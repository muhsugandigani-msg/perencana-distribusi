/* ===== Mesin perencanaan distribusi ===== */
const HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const HARI3 = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function toMin(s) { if (s == null || s === "") return null; const m = String(s).match(/^(\d{1,2})[:.](\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; }
function fmtJam(m) { if (m == null || !isFinite(m)) return "-"; m = Math.round(m); const d = Math.floor(m / 1440); m -= d * 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0") + (d > 0 ? " (+" + d + ")" : ""); }
function hav(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/* Ambil koordinat dari link Google Maps / teks */
function parseKoordinat(txt) {
  if (!txt) return null;
  txt = String(txt).trim();
  try { txt = decodeURIComponent(txt); } catch (e) {}
  const num = "(-?\\d{1,3}\\.\\d+)";
  const pats = [
    new RegExp("!3d" + num + "!4d" + num),
    new RegExp("@" + num + "," + num),
    new RegExp("[?&](?:q|query|ll|destination|daddr|center|sll)=(?:loc:)?" + num + ",\\s*" + num),
    new RegExp("/place/" + num + ",\\s*" + num),
    new RegExp("/dir/[^/]*?" + num + ",\\s*" + num),
    new RegExp("^" + num + "\\s*[, ]\\s*" + num + "$"),
    new RegExp(num + ",\\s*" + num),
  ];
  for (const p of pats) {
    const m = txt.match(p);
    if (m) { const la = +m[1], lo = +m[2]; if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) return { lat: la, lng: lo }; }
  }
  if (/goo\.gl|maps\.app/.test(txt)) return { short: true };
  return null;
}


/* ---------- Jarak jalan sebenarnya (matriks dari server rute, disimpan di state.jarakJalan) ---------- */
function ptKey(lat, lng) { return (+lat).toFixed(5) + "," + (+lng).toFixed(5); }
function normJalan(s) {
  return " " + String(s || "").toLowerCase().replace(/\./g, " ").replace(/\binsinyur\b/g, "ir").replace(/\bdokter\b/g, "dr").replace(/\bjenderal\b/g, "jend").replace(/\b(jalan|jln|jl)\b/g, " ").replace(/\s+/g, " ").trim() + " ";
}
function roadCfgKey(state) { // jarak berubah bila aturan blok tol / jalan berubah
  const b = (state.params && state.params.jalanBlok) || {};
  const nama = (Array.isArray(b.daftar) ? b.daftar : []).filter(x => x && x.aktif !== false && String(x.nama || "").trim()).map(x => normJalan(x.nama).trim()).sort();
  return (b.semuaTol !== false ? "T" : "t") + "|" + nama.join("|");
}
function roadTable(state) { // -> {km(a,b) -> km|null} memakai lookup numerik cepat
  const J = state.jarakJalan;
  if (!J || J.cfg !== roadCfgKey(state) || !Array.isArray(J.k) || !J.d) return null;
  const idx = new Map(J.k.map((k, i) => [k, i])), byLat = new Map();
  for (const st of state.stores) {
    if (st.lat == null || st.lng == null || isNaN(st.lat) || isNaN(st.lng)) continue;
    const i = idx.get(ptKey(st.lat, st.lng)); if (i == null) continue;
    let m = byLat.get(+st.lat); if (!m) byLat.set(+st.lat, m = new Map()); m.set(+st.lng, i);
  }
  const memo = new Map();
  return function (a, b) {
    const ma = byLat.get(+a[0]), mb = byLat.get(+b[0]); if (!ma || !mb) return null;
    const i = ma.get(+a[1]), j = mb.get(+b[1]); if (i == null || j == null) return null;
    const key = i * 100003 + j; if (memo.has(key)) return memo.get(key);
    const v = J.d[i + ":" + j], r = typeof v === "number" && isFinite(v) && v >= 0 ? v : null;
    memo.set(key, r); return r;
  };
}


/* ---------- Frekuensi lebih jarang dari seminggu (1x per 2–5 minggu) ----------
   Disimpan sebagai frek pecahan: 0,5 = 1x/2 minggu, 0,333 = 1x/3 minggu, 0,25 = 1x/4 minggu, 0,2 = 1x/5 minggu.
   Plan dibuat per minggu dalam satu siklus; minggu kirim tiap store dibagi rata otomatis (bisa dikunci lewat mingguKe). */
function periodeOf(s) { const f = +s.frek; return f > 0 && f < 1 ? Math.max(2, Math.min(5, Math.round(1 / f))) : 1; }
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
function weekMeta(state) {
  const stores = state.stores.filter(s => s.aktif !== false && s.antaran !== "Origin");
  const per = stores.filter(s => periodeOf(s) > 1);
  if (!per.length) return { H: 1, off: {}, exact: true };
  const P = [...new Set(per.map(periodeOf))]; const L = P.reduce((a, b) => a * b / gcd(a, b), 1);
  const H = L <= 12 ? L : Math.max(...P);
  const base = stores.filter(s => periodeOf(s) === 1).reduce((a, s) => a + (+s.beratKg || 0) * Math.max(0, Math.round(+s.frek || 0)), 0);
  const load = Array(H).fill(base), off = {};
  const fixed = per.filter(s => +s.mingguKe >= 1 && +s.mingguKe <= periodeOf(s)), auto = per.filter(s => !fixed.includes(s));
  const put = (s, o) => { off[s.id] = o; const N = periodeOf(s); for (let w = 0; w < H; w++) if (w % N === o) load[w] += +s.beratKg || 0; };
  fixed.forEach(s => put(s, +s.mingguKe - 1));
  auto.slice().sort((a, b) => (+b.beratKg || 0) - (+a.beratKg || 0) || String(a.id).localeCompare(String(b.id))).forEach(s => {
    const N = periodeOf(s); let bo = 0, bs = Infinity;
    for (let o = 0; o < N; o++) { const t = load.map((x, w) => w % N === o ? x + (+s.beratKg || 0) : x); const sc = Math.max(...t) * 1e6 + t.reduce((a, x) => a + x * x, 0) / 1e3; if (sc < bs - 1e-9) { bs = sc; bo = o; } }
    put(s, bo);
  });
  return { H, off, exact: L <= 12, load };
}
function weekState(state, meta, w) { // w = 0..H-1
  const stores = state.stores.filter(s => { if (s.antaran === "Origin" || periodeOf(s) === 1) return true; const o = meta.off[s.id]; return o != null && w % periodeOf(s) === o; })
    .map(s => periodeOf(s) > 1 ? Object.assign({}, s, { frek: 1, _periode: periodeOf(s) }) : s);
  return Object.assign({}, state, { stores });
}
function baseState(state) { // hanya store mingguan (1x atau lebih per minggu) -> rute dasar yang sama tiap minggu
  return Object.assign({}, state, { stores: state.stores.filter(s => s.antaran === "Origin" || periodeOf(s) === 1) });
}
function buildWeeks(state, opts) { // sinkron: array plan per minggu
  const g = weeksGen(state, opts); let r; do { r = g.next(); } while (!r.done); return r.value;
}
/* Siklus beberapa minggu: rute dasar store mingguan dihitung sekali (bisa mode mendalam), lalu tiap minggu
   store 1x per 2–5 minggu disisipkan ke rute dasar itu. Rute store mingguan tidak berubah antar minggu. */
function* weeksGen(state, opts) {
  opts = opts || {}; const meta = weekMeta(state), out = [];
  if (meta.H <= 1) { const P = yield* planGen(state, opts); if (P && !P.error) { P.week = 0; P.nMinggu = 1; } out.push(P); out.meta = meta; return out; }
  const bs = baseState(state);
  let base = null;
  if (bs.stores.some(s => s.antaran !== "Origin" && s.aktif !== false)) {
    base = yield* planGen(bs, opts);
    if (base && base.error) base = null; // error yang sama akan muncul di plan tiap minggu
  }
  for (let w = 0; w < meta.H; w++) {
    const P = buildPlan(weekState(state, meta, w), base ? Object.assign({}, opts, { base, mendalam: false }) : opts);
    if (P && !P.error) { P.week = w; P.nMinggu = meta.H; if (base && base.opt) P.opt.dasarInfo = base.opt; }
    out.push(P);
    yield { fase: "sisip minggu " + (w + 1) + "/" + meta.H, k: 100, n: 100 };
  }
  out.meta = meta; out.base = base; return out;
}

/* ---------- Model waktu ---------- */
function makeCtx(state, day) {
  const p = state.params, L = p.lalin;
  const breaks = (state.breaks[day] || []).map(b => [toMin(b.mulai), toMin(b.selesai)]).filter(b => b[0] != null && b[1] != null && b[1] > b[0]).sort((a, b) => a[0] - b[0]);
  const peaks = (L.jamSibuk || []).map(j => [toMin(j.mulai), toMin(j.selesai), +j.faktor || 1]).filter(j => j[0] != null && j[1] != null);
  const rate = Math.max(0.01, +p.rasioKgMenit || 30);
  function advance(t, dur) {
    for (let guard = 0; guard < 100; guard++) {
      for (const [a, b] of breaks) if (a <= t && t < b) t = b;
      let nxt = Infinity; for (const [a] of breaks) if (a > t && a < nxt) nxt = a;
      if (t + dur <= nxt) return t + dur;
      dur -= nxt - t; t = nxt;
    }
    return t + dur;
  }
  const RT = state._roadT !== undefined ? state._roadT : roadTable(state);
  function leg(a, b, t, speed) {
    const h = hav(a, b);
    if (h < 1e-6) return { km: 0, min: 0 };
    let road = RT ? RT(a, b) : null;
    if (road == null) road = h * (+L.faktorJalan || 1.65);
    let f;
    if (h >= (+L.batasAntarKotaKm || 25)) f = +L.fAntarKota || 1;
    else {
      f = +L.fDalamKota || 1;
      if (t != null) { const tm = ((t % 1440) + 1440) % 1440; for (const [s, e, x] of peaks) if (tm >= s && tm < e) { f *= x; break; } }
    }
    return { km: road, min: road / Math.max(1, speed) * 60 * f };
  }
  function overlap(t0, t1) { let s = 0; for (const [a, b] of breaks) s += Math.max(0, Math.min(b, t1) - Math.max(a, t0)); return s; }
  const hariOn = (p.hari || []).map((x, i) => x ? i : -1).filter(i => i >= 0);
  const firstDay = hariOn.length ? hariOn[0] : -1, lastDay = hariOn.length ? hariOn[hariOn.length - 1] : -1;
  const pagiHariPertama = p.loadingHariPertama === "pagi";
  const acts = [];
  (p.aktivitas || []).filter(a => a.hari && a.hari[day] && +a.durasi > 0).forEach(a => {
    if (a.waktu !== "setelah") { acts.push(Object.assign({}, a, { waktu: "sebelum" })); return; }
    // aktivitas "setelah kembali" = persiapan rit berikutnya (shift berikutnya / esok hari)
    if (pagiHariPertama && day === firstDay) acts.push(Object.assign({}, a, { waktu: "sebelum", berlaku: "shift1", pagi: true }));
    // hari terakhir (mode pagi): tidak perlu menyiapkan esok hari; rit ke-2 dst. tetap disiapkan (dijalankan sebelum berangkat rit itu)
    if (pagiHariPertama && day === lastDay) { if (a.berlaku !== "shift1") acts.push(Object.assign({}, a, { waktu: "sebelum", berlaku: "lanjut" })); }
    else acts.push(Object.assign({}, a, { waktu: "setelah" }));
  });
  return { day, breaks, advance, leg, overlap, rate, acts, H: (+p.jamShift || 8) * 60, start: toMin(p.jamMulai) ?? 480 };
}

/* Simulasi satu rit. stops: array store (pengantaran dulu, lalu penjemputan). */
function simulate(ctx, depot, veh, t0, shiftNo, stops, detail) {
  const segs = [];
  let t = t0, shiftStart = null;
  const all = ctx.acts.filter(a => a.berlaku === "shift1" ? shiftNo === 1 : a.berlaku === "lanjut" ? shiftNo > 1 : true);
  const acts = all.filter(a => a.waktu !== "setelah"), after = all.filter(a => a.waktu === "setelah");
  for (const a of acts.filter(a => !a.dihitung)) { t = ctx.advance(t, 0); const s = t; t = ctx.advance(t, +a.durasi); if (detail) segs.push({ type: "aktivitas", start: s, end: t, label: a.nama }); }
  for (const a of acts.filter(a => a.dihitung)) { t = ctx.advance(t, 0); if (shiftStart == null) shiftStart = t; const s = t; t = ctx.advance(t, +a.durasi); if (detail) segs.push({ type: "aktivitas", start: s, end: t, label: a.nama }); }
  t = ctx.advance(t, 0);
  if (shiftStart == null) shiftStart = t;
  const dep = t;
  let pos = [depot.lat, depot.lng], km = 0, ok = true, why = "";
  let kgDel = 0, kgPick = 0;
  const out = [];
  const speed = +veh.kecepatan > 0 ? +veh.kecepatan : 40;
  for (const s of stops) {
    const pt = [s.lat, s.lng];
    const lg = ctx.leg(pos, pt, t, speed);
    t = ctx.advance(t, 0); const ts = t; t = ctx.advance(t, lg.min); km += lg.km;
    if (detail && lg.min > 0) segs.push({ type: "jalan", start: ts, end: t, label: "Perjalanan ke " + s.nama, km: lg.km });
    const arr = t;
    const buka = toMin(s.buka); let tutup = toMin(s.tutup);
    if (buka != null && tutup != null && tutup <= buka) tutup += 1440; // tutup lewat tengah malam
    if (buka != null && t < buka) { if (detail) segs.push({ type: "tunggu", start: t, end: buka, label: "Menunggu " + s.nama + " buka" }); t = buka; }
    t = ctx.advance(t, 0);
    const svc = (+s.beratKg || 0) / ctx.rate;
    const st = t; t = ctx.advance(t, svc);
    const pick = s.loading === "Menaikkan";
    if (pick) kgPick += +s.beratKg || 0; else kgDel += +s.beratKg || 0;
    if (tutup != null && t > tutup) { ok = false; why = "Tidak terkejar sebelum " + s.nama + " tutup (" + s.tutup + ")"; }
    if (detail) segs.push({ type: pick ? "muat" : "bongkar", start: st, end: t, label: (pick ? "Menaikkan barang di " : "Menurunkan barang di ") + s.nama, kg: +s.beratKg || 0 });
    out.push({ store: s, km: lg.km, drive: lg.min, depart: ts, arr, start: st, fin: t, brk: ctx.overlap(ts, t), wait: buka != null && arr < buka ? buka - arr : 0 });
    pos = pt;
  }
  const back = ctx.leg(pos, [depot.lat, depot.lng], t, speed);
  t = ctx.advance(t, 0); const tb = t; t = ctx.advance(t, back.min); km += back.km;
  if (detail && back.min > 0) segs.push({ type: "jalan", start: tb, end: t, label: "Kembali ke " + depot.nama, km: back.km });
  const ret = t;
  let end = t, endCounted = t;
  for (const a of after) { t = ctx.advance(t, 0); const s = t; t = ctx.advance(t, +a.durasi); if (detail) segs.push({ type: "aktivitas", start: s, end: t, label: a.nama + " (untuk rit berikutnya)", after: true }); if (a.dihitung) endCounted = t; }
  end = t;
  const cap = +veh.kapasitasKg || 0;
  if (kgDel > cap + 1e-6) { ok = false; why = "Muatan melebihi kapasitas"; }
  if (kgPick > cap + 1e-6) { ok = false; why = "Barang yang dinaikkan melebihi kapasitas"; }
  if (stops.length && endCounted - shiftStart > ctx.H + 1e-6) { ok = false; why = "Melebihi jam kerja shift"; }
  // Batas rute pendek per kendaraan (mis. pickup hemat BBM): kosong = tanpa batas
  const vnm = (veh.jenis || "Kendaraan") + (veh.plat ? " " + veh.plat : "");
  const maxR = +veh.maksRadiusKm, maxK = +veh.maksKmRit;
  if (maxR > 0) for (const s of stops) { const rk = ctx.leg([depot.lat, depot.lng], [s.lat, s.lng], null, speed).km; if (rk > maxR + 1e-6) { ok = false; why = s.nama + " berjarak " + rk.toFixed(1) + " km dari gudang, di luar radius maks " + vnm + " (" + maxR + " km)"; break; } }
  if (maxK > 0 && km > maxK + 1e-6) { ok = false; why = "Rit " + km.toFixed(1) + " km melebihi maks jarak per rit " + vnm + " (" + maxK + " km)"; }
  if (end > 24 * 60) { ok = false; why = "Melewati tengah malam"; }
  return { ok, why, t0, shiftStart, dep, ret, end, endShift: endCounted, dur: endCounted - shiftStart, km, kgDel, kgPick, stops: out, segs, backKm: back.km, backMin: back.min, backDep: tb, backBrk: ctx.overlap(tb, ret) };
}

/* Jika titik pertama belum buka saat tiba, tunda mulai shift (menunggu di gudang tidak memakan jam shift). */
function simFlex(ctx, depot, veh, t0, shiftNo, stops, detail) {
  let r = simulate(ctx, depot, veh, t0, shiftNo, stops, false), t = t0;
  for (let i = 0; i < 4 && r.stops.length; i++) {
    const f = r.stops[0], w = f.start - f.arr - ctx.overlap(f.arr, f.start);
    if (w <= 1) break;
    t += w;
    const r2 = simulate(ctx, depot, veh, t, shiftNo, stops, false);
    if ((r2.ok && !r.ok) || (r2.ok === r.ok && r2.dur < r.dur - 0.5)) r = r2; else break;
  }
  return detail ? simulate(ctx, depot, veh, r.t0, shiftNo, stops, true) : r;
}
function orderStops(list) { // pengantaran dulu, penjemputan ("Menaikkan barang") selalu terakhir
  return list.filter(s => s.loading !== "Menaikkan").concat(list.filter(s => s.loading === "Menaikkan"));
}

/* Bangun rute untuk satu hari */
function routeDay(state, day, visits, depot, vehicles, rnd) {
  const ctx = makeCtx(state, day);
  const U = visits.slice();
  const trips = [];
  const avail = vehicles.map(() => ctx.start), used = vehicles.map(() => 0), done = vehicles.map(() => false);
  const legDepot = s => ctx.leg([depot.lat, depot.lng], [s.lat, s.lng], null, 40).min;
  for (let iter = 0; iter < 200 && U.length; iter++) {
    // kendaraan yang paling awal tersedia
    let vi = -1;
    vehicles.forEach((v, i) => { if (!done[i] && used[i] < (+v.maksShift || 1) && (vi < 0 || avail[i] < avail[vi] - 1e-9 || (Math.abs(avail[i] - avail[vi]) < 1e-9 && +v.kapasitasKg > +vehicles[vi].kapasitasKg))) vi = i; });
    if (vi < 0) break;
    const v = vehicles[vi], sh = used[vi] + 1;
    const sim = r => simFlex(ctx, depot, v, avail[vi], sh, orderStops(r), false);
    // seed: titik terjauh yang layak sendirian
    const cand = U.map(s => ({ s, d: legDepot(s) })).sort((a, b) => b.d - a.d);
    let route = null;
    const okc = []; for (const c of cand) { if (sim([c.s]).ok) { okc.push(c.s); if (!rnd || okc.length >= 3) break; } }
    if (okc.length) route = [okc[rnd ? Math.floor(rnd() * okc.length) : 0]];
    if (!route) { done[vi] = true; continue; }
    U.splice(U.indexOf(route[0]), 1);
    // penyisipan termurah
    for (;;) {
      const base = sim(route).ret;
      let best = null;
      for (const s of U) {
        if (route.some(r => r.id === s.id)) continue; // store sama tidak dua kali dalam satu rit
        for (let k = 0; k <= route.length; k++) {
          const r2 = route.slice(0, k).concat([s], route.slice(k));
          const res = sim(r2);
          if (res.ok) { const c = res.ret - base; if (!best || c < best.c) best = { c, r2, s }; }
        }
      }
      if (!best) break;
      route = best.r2; U.splice(U.indexOf(best.s), 1);
    }
    route = improve(route, sim);
    const res = simFlex(ctx, depot, v, avail[vi], sh, orderStops(route), true);
    trips.push(Object.assign(res, { day, vIdx: vi, veh: v, shift: sh }));
    avail[vi] = res.end; used[vi] = sh;
  }
  return { trips, left: U };
}

function improve(route, sim) { // 2-opt + relokasi sederhana
  let cur = orderStops(route), best = sim(cur).ret, again = true, n = 0;
  while (again && n++ < 50) {
    again = false;
    for (let i = 0; i < cur.length - 1; i++) for (let j = i + 1; j < cur.length; j++) {
      const r2 = orderStops(cur.slice(0, i).concat(cur.slice(i, j + 1).reverse(), cur.slice(j + 1)));
      const res = sim(r2); if (res.ok && res.ret < best - 0.01) { cur = r2; best = res.ret; again = true; }
    }
    for (let i = 0; i < cur.length; i++) for (let j = 0; j < cur.length; j++) {
      if (i === j) continue;
      const tmp = cur.slice(); const [x] = tmp.splice(i, 1); tmp.splice(j, 0, x);
      const r2 = orderStops(tmp); const res = sim(r2); if (res.ok && res.ret < best - 0.01) { cur = r2; best = res.ret; again = true; }
    }
  }
  return cur;
}

/* Perkiraan kapasitas menit kerja per hari */
function dayCapacity(state, day, depot, vehicles) {
  const ctx = makeCtx(state, day);
  let tot = 0;
  vehicles.forEach(v => {
    let t = ctx.start;
    for (let k = 1; k <= (+v.maksShift || 1); k++) {
      const e = simulate(ctx, depot, v, t, k, [], false);
      const end = Math.min(e.shiftStart + ctx.H, 24 * 60);
      const work = Math.max(0, end - e.dep - ctx.overlap(e.dep, end));
      tot += work; t = end;
    }
  });
  return tot;
}

/* Bobot fungsi tujuan (dalam "menit setara"): belum terlayani >> jumlah rit > jam kerja > km */
const W = { unserved: 10000, rit: 60, km: 2 };
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function buildPlan(state, opts) { // sinkron (dipakai tes & mode biasa)
  const g = planGen(state, opts); let r; do { r = g.next(); } while (!r.done); return r.value;
}
/* Generator: menghasilkan progres {fase, k, n} selama optimasi mendalam agar layar bisa diperbarui. */
function* planGen(state, opts) {
  try { Object.defineProperty(state, "_roadT", { value: roadTable(state), configurable: true, enumerable: false, writable: true }); } catch (e) {}
  try { const P = yield* buildPlanCore(state, opts || {}); if (P && !P.error) P.jarak = jarakInfo(state, P); return P; }
  finally { try { delete state._roadT; } catch (e) {} }
}
function jarakInfo(state, P) { // berapa kaki perjalanan di plan final yang memakai jarak jalan sebenarnya
  const RT = roadTable(state); let real = 0, est = 0;
  const pts = t => [[P.depot.lat, P.depot.lng]].concat(t.stops.map(x => [x.store.lat, x.store.lng]), [[P.depot.lat, P.depot.lng]]);
  P.trips.forEach(t => { const q = pts(t); for (let i = 1; i < q.length; i++) { if (hav(q[i - 1], q[i]) < 1e-6) continue; if (RT && RT(q[i - 1], q[i]) != null) real++; else est++; } });
  return { real, est, mode: !est ? "jalan" : !real ? "perkiraan" : "campuran" };
}
function* buildPlanCore(state, opts) {
  const warn = [];
  const days = state.params.hari.map((b, i) => b ? i : -1).filter(i => i >= 0);
  const depot = state.stores.find(s => s.aktif !== false && s.antaran === "Origin" && s.lat != null && s.lng != null);
  if (!depot) return { error: "Belum ada titik Origin (gudang) dengan koordinat. Tandai satu store sebagai Jenis Antaran \"Origin\"." };
  const vehicles = state.vehicles.filter(v => v.aktif !== false && +v.kapasitasKg > 0);
  if (!vehicles.length) return { error: "Belum ada kendaraan aktif." };
  if (!days.length) return { error: "Pilih minimal satu hari distribusi." };
  const stores = state.stores.filter(s => s.aktif !== false && s.antaran !== "Origin");
  const noCoord = stores.filter(s => s.lat == null || s.lng == null || isNaN(s.lat) || isNaN(s.lng));
  noCoord.forEach(s => warn.push("\"" + s.nama + "\" dilewati karena belum ada koordinat."));
  const zeroF = stores.filter(s => !noCoord.includes(s) && !(Math.round(+s.frek) > 0));
  zeroF.forEach(s => warn.push("\"" + s.nama + "\" dilewati karena frekuensi kirim belum diisi / tidak dikirim."));
  // Hari beroperasi: store hanya boleh diantar pada hari aktifnya (kosong = setiap hari)
  const opsOf = s => Array.isArray(s.hariOperasi) ? s.hariOperasi : [0, 1, 2, 3, 4, 5, 6];
  const okDaysOf = {};
  stores.forEach(s => { okDaysOf[s.id] = days.filter(d => opsOf(s).includes(d)); });
  const closed = stores.filter(s => !noCoord.includes(s) && !zeroF.includes(s) && !okDaysOf[s.id].length);
  closed.forEach(s => warn.push("\"" + s.nama + "\" dilewati karena hari beroperasinya tidak ada yang jatuh di hari distribusi."));
  const valid = stores.filter(s => !noCoord.includes(s) && !zeroF.includes(s) && !closed.includes(s));
  const okDays = s => okDaysOf[s.id] || days;
  const restricted = s => okDays(s).length < days.length;
  state.vehicles.filter(v => v.aktif !== false && !(+v.kapasitasKg > 0)).forEach(v => warn.push("Kendaraan \"" + (v.jenis || "") + " " + (v.plat || "") + "\" tidak dipakai karena kapasitas kosong/0."));
  vehicles.filter(v => !(+v.kecepatan > 0)).forEach(v => warn.push("Kecepatan " + (v.jenis || "") + " " + (v.plat || "") + " kosong, dipakai 40 km/jam."));
  const maxCap = Math.max(...vehicles.map(v => +v.kapasitasKg));
  valid.filter(s => +s.beratKg > maxCap).forEach(s => warn.push("\"" + s.nama + "\" " + Math.round(s.beratKg) + " kg melebihi kapasitas kendaraan terbesar (" + maxCap + " kg). Pecah menjadi 2 baris store atau tambah kendaraan lebih besar."));
  const D = days.length;
  const ctx0 = makeCtx(state, days[0]);
  const ctxOf = {}; days.forEach(d => ctxOf[d] = makeCtx(state, d));
  const work = s => (+s.beratKg || 0) / ctx0.rate + ctx0.leg([depot.lat, depot.lng], [s.lat, s.lng], null, 40).min * 0.9;
  const cap = {}; days.forEach(d => cap[d] = dayCapacity(state, d, depot, vehicles));
  // Frekuensi kirim (Nx seminggu) menentukan jumlah kunjungan; harinya dipilih otomatis berjarak rata di antara hari beroperasi store.
  const freqOf = s => Math.round(+s.frek || 0);
  const multi = valid.filter(s => restricted(s) || freqOf(s) > 1).sort((a, b) => freqOf(b) - freqOf(a) || okDays(a).length - okDays(b).length);
  const multiIds = new Set(multi.map(s => s.id));
  const fixedIds = new Set(valid.filter(s => freqOf(s) > 1).map(s => s.id)); // >1x seminggu: jarak antar hari dijaga, tidak dipindah satu-satu
  let warned = false;
  // tetangga terdekat tiap store (membatasi pencarian agar cepat untuk ratusan store)
  const NB = {};
  valid.forEach(s => { NB[s.id] = new Set(valid.filter(u => u.id !== s.id).map(u => ({ id: u.id, d: hav([s.lat, s.lng], [u.lat, u.lng]) })).sort((a, b) => a.d - b.d).slice(0, 10).map(x => x.id)); });
  const near = (s, route) => route.some(x => NB[s.id] && NB[s.id].has(x.id));
  const deep = opts.mendalam != null ? !!opts.mendalam : state.params.optimasiMendalam === true;
  const sk = Math.max(0.35, Math.min(1, +opts.skala || 1)); // siklus beberapa minggu: usaha per minggu dikurangi
  let evals = 0, EVAL_MAX = deep ? Math.round(1500000 * sk) : 250000; // batas kerja (deterministik, tidak bergantung kecepatan komputer)

  /* 1) Pembagian kunjungan ke hari. rnd = null -> deterministik (solusi awal); rnd -> variasi untuk multi-start */
  function assign(rnd) {
    const load = {}, perDay = {}; days.forEach(d => { load[d] = 0; perDay[d] = []; });
    for (const s of multi) {
      const A = okDays(s), K = A.length;
      let f = freqOf(s);
      if (f > K) { if (!warned) warn.push("\"" + s.nama + "\": frekuensi " + f + "x seminggu melebihi " + K + " hari beroperasi yang bisa diantar, dibatasi " + K + "x."); f = K; }
      const w = work(s);
      // pilihan himpunan hari berjarak rata di antara hari beroperasi; pilih yang beban harinya paling ringan
      const opts = [];
      for (let o = 0; o < K; o++) {
        const set = []; for (let i = 0; i < f; i++) set.push(A[(o + Math.round(i * K / f)) % K]);
        const key = set.slice().sort((a, b) => a - b);
        if (opts.some(x => x.set.join() === key.join())) continue;
        const score = Math.max(...set.map(d => (load[d] + w) / Math.max(1, cap[d])));
        opts.push({ score, set: key });
      }
      opts.sort((a, b) => a.score - b.score);
      let pick = opts[0];
      if (rnd && opts.length > 1) { const nr = opts.filter(x => x.score <= opts[0].score * 1.15 + 1e-9); pick = nr[Math.floor(rnd() * nr.length)]; }
      const ds = pick.set.slice();
      ds.sort((a, b) => a - b);
      ds.forEach(d => { perDay[d].push(s); load[d] += w; });
    }
    warned = true;
    // frekuensi 1x: sapuan sudut agar satu hari mengelompok secara geografis
    const flex = valid.filter(s => !multiIds.has(s.id)).map(s => ({ s, a: Math.atan2(s.lat - depot.lat, s.lng - depot.lng) })).sort((x, y) => x.a - y.a);
    if (flex.length) {
      let gi = 0, gap = -1; // mulai dari celah sudut terbesar
      for (let i = 0; i < flex.length; i++) { const nx = flex[(i + 1) % flex.length]; let g = nx.a - flex[i].a; if (g <= 0) g += 2 * Math.PI; if (g > gap) { gap = g; gi = (i + 1) % flex.length; } }
      if (rnd) gi = (gi + Math.floor(rnd() * flex.length)) % flex.length;
      const ordered = flex.slice(gi).concat(flex.slice(0, gi)).map(x => x.s);
      const totalW = ordered.reduce((a, s) => a + work(s), 0) + days.reduce((a, d) => a + load[d], 0);
      const capSum = days.reduce((a, d) => a + cap[d], 0) || 1;
      const jit = rnd ? 0.25 + rnd() * 0.5 : 0.5;
      let di = 0;
      for (const s of ordered) {
        while (di < D - 1 && load[days[di]] + work(s) * jit > totalW * cap[days[di]] / capSum) di++;
        perDay[days[di]].push(s); load[days[di]] += work(s);
      }
    }
    return { perDay, load };
  }

  /* 2) Rute per hari + pindahkan kunjungan yang tidak muat ke hari lain */
  function construct(A, rnd) {
    const { perDay, load } = A, res = {};
    days.forEach(d => res[d] = routeDay(state, d, perDay[d], depot, vehicles, rnd));
    for (let pass = 0; pass < 2; pass++) {
      for (const d of days) {
        const left = res[d].left.slice();
        for (const s of left) {
          if (fixedIds.has(s.id)) continue;
          const others = okDays(s).filter(x => x !== d && !perDay[x].some(y => y.id === s.id)).sort((a, b) => (load[a] / cap[a]) - (load[b] / cap[b]));
          for (const o of others) {
            const trial = routeDay(state, o, perDay[o].concat([s]), depot, vehicles, rnd);
            if (!trial.left.includes(s) && trial.left.length <= res[o].left.length) {
              perDay[o].push(s); res[o] = trial; load[o] += work(s);
              perDay[d] = perDay[d].filter(x => x !== s); res[d].left = res[d].left.filter(x => x !== s); load[d] -= work(s);
              break;
            }
          }
        }
      }
    }
    const sol = {};
    days.forEach(d => sol[d] = toDaySol(d, res[d].trips, res[d].left));
    return sol;
  }

  /* --- representasi solusi harian: R[vi] = daftar rit (array store) berurutan shift --- */
  function vehEval(d, vi, list, detail) {
    const ctx = ctxOf[d], v = vehicles[vi]; evals++;
    let t = ctx.start, sh = 0, cost = 0; const trips = [];
    for (const stops of list) {
      if (!stops.length) continue;
      sh++; if (sh > (+v.maksShift || 1)) return null;
      const r = simFlex(ctx, depot, v, t, sh, orderStops(stops), detail);
      if (!r.ok) return null;
      cost += (W.rit + r.dur + W.km * r.km) * fuelF[vi];
      if (detail) trips.push(Object.assign(r, { day: d, vIdx: vi, veh: v, shift: sh }));
      t = r.end;
    }
    return { cost, trips };
  }
  // Prioritas bahan bakar: kendaraan bensin diberi biaya lebih tinggi agar tugas diutamakan ke kendaraan solar
  const PS = state.params.prioritasSolar || {};
  const psOn = PS.aktif !== false;
  const psF = { ringan: 1.15, sedang: 1.35, kuat: 1.8 }[PS.tingkat] || 1.35;
  const isBensin = v => /bensin|pertalite|pertamax|gasoline/i.test(v.bbm || "");
  const fuelF = vehicles.map(v => psOn && isBensin(v) ? psF : 1);
  const share = fuelF.map(f => 1 / f); // porsi adil: kendaraan bensin mendapat porsi lebih kecil
  // statistik satu kendaraan di satu hari (untuk fairness)
  const stCache = new Map();
  function vehStats(d, vi, list) {
    const key = d + "|" + vi + "|" + list.map(r => r.map(x => x.id).join(",")).join("/");
    if (stCache.has(key)) return stCache.get(key);
    const ctx = ctxOf[d], v = vehicles[vi]; evals++;
    let t = ctx.start, sh = 0; const o = { cost: 0, rit: 0, toko: 0, jam: 0, kg: 0, km: 0, s2: 0 };
    let res = o;
    for (const stops of list) {
      if (!stops.length) continue;
      sh++; if (sh > (+v.maksShift || 1)) { res = null; break; }
      const r = simFlex(ctx, depot, v, t, sh, orderStops(stops), false);
      if (!r.ok) { res = null; break; }
      o.cost += (W.rit + r.dur + W.km * r.km) * fuelF[vi]; o.rit++; o.toko += stops.length; o.jam += r.dur; o.kg += r.kgDel + r.kgPick; o.km += r.km; if (sh >= 2) o.s2++;
      t = r.end;
    }
    if (stCache.size > 200000) stCache.clear();
    stCache.set(key, res); return res;
  }
  // Fairness: pemerataan beban antar kendaraan (penalti = simpangan relatif kuadrat terhadap rata-rata)
  const FP = state.params.fairness || {};
  const fairOn = !!FP.aktif && vehicles.length > 1;
  const FW = { ringan: 600, sedang: 2000, kuat: 6000 }[FP.tingkat] || 2000;
  const fKeys = fairOn ? ["rit", "toko", "jam", "kg", "km", "s2"].filter(k => FP[k]) : [];
  const capV = vehicles.map(v => +v.kapasitasKg || 1);
  function fairPen(T) { // T: array per kendaraan {rit,toko,jam,kg,km,s2}
    if (!fKeys.length) return 0;
    let pen = 0;
    for (const k of fKeys) {
      let idx = vehicles.map((v, i) => i);
      if (k === "s2") idx = idx.filter(i => (+vehicles[i].maksShift || 1) >= 2);
      if (idx.length < 2) continue;
      const xs = idx.map(i => (k === "kg" && FP.kgRelatif !== false ? T[i].kg / capV[i] : T[i][k]) / (k === "s2" ? 1 : share[i]));
      const m = xs.reduce((a, b) => a + b, 0) / xs.length; if (m <= 1e-9) continue;
      pen += FW * xs.reduce((a, x) => a + ((x - m) / m) ** 2, 0) / xs.length;
    }
    return pen;
  }
  function totals(sol) {
    const T = vehicles.map(() => ({ rit: 0, toko: 0, jam: 0, kg: 0, km: 0, s2: 0 }));
    days.forEach(d => sol[d].R.forEach((L, vi) => { const st = vehStats(d, vi, L); if (st) for (const k in T[vi]) T[vi][k] += st[k]; }));
    return T;
  }
  function toDaySol(d, trips, left) {
    const R = vehicles.map(() => []);
    trips.slice().sort((a, b) => a.vIdx - b.vIdx || a.shift - b.shift).forEach(t => R[t.vIdx].push(t.stops.map(x => x.store)));
    const vc = R.map((L, vi) => vehEval(d, vi, L, false).cost);
    return { R, left: left.slice(), vc };
  }
  const dayCost = S => S.vc.reduce((a, b) => a + b, 0) + W.unserved * S.left.length;
  const solCost = sol => days.reduce((a, d) => a + dayCost(sol[d]), 0);

  /* 3) Pencarian lokal per hari: sisipkan yang belum terlayani, pindah & tukar store antar rit/kendaraan, rapikan urutan */
  function dayLS(d, S) {
    const R = S.R.map(L => L.map(r => r.slice())), vc = S.vc.slice(), left = S.left.slice();
    const slots = vi => { const L = R[vi].filter(r => r.length); return L.length < (+vehicles[vi].maksShift || 1) ? [...R[vi].map((r, i) => i).filter(i => R[vi][i].length), -1] : R[vi].map((r, i) => i).filter(i => R[vi][i].length); };
    const tryVeh = (vi, L) => { const r = vehEval(d, vi, L, false); return r ? r.cost : null; };
    const withRoute = (vi, ri, stops) => { const L = R[vi].map(r => r.slice()); if (ri === -1) L.push(stops); else L[ri] = stops; return L; };
    let improved = true, rounds = 0;
    while (improved && rounds++ < 25 && evals < EVAL_MAX) {
      improved = false;
      // (a) sisipkan store yang belum terlayani
      for (let k = left.length - 1; k >= 0; k--) {
        const s = left[k]; let best = null;
        for (let vi = 0; vi < vehicles.length; vi++) for (const ri of slots(vi)) {
          const base = ri === -1 ? [] : R[vi][ri];
          if (base.some(x => x.id === s.id)) continue;
          for (let p = 0; p <= base.length; p++) {
            const L = withRoute(vi, ri, base.slice(0, p).concat([s], base.slice(p)));
            const c = tryVeh(vi, L); if (c == null) continue;
            const delta = c - vc[vi];
            if (!best || delta < best.delta) best = { delta, vi, L, c };
          }
        }
        if (best) { R[best.vi] = best.L.filter(r => r.length); vc[best.vi] = best.c; left.splice(k, 1); improved = true; }
      }
      // (b) pindahkan satu store ke rit lain (boleh kendaraan lain / rit baru)
      for (let va = 0; va < vehicles.length; va++) for (let ra = 0; ra < R[va].length; ra++) for (let i = 0; i < (R[va][ra] || []).length; i++) {
        const s = R[va][ra][i];
        const La = R[va].map(r => r.slice()); La[ra].splice(i, 1);
        const ca = tryVeh(va, La); if (ca == null) continue;
        let best = null;
        for (let vb = 0; vb < vehicles.length; vb++) for (const rb of slots(vb)) {
          if (vb === va && rb === ra) continue;
          const Lb0 = vb === va ? La : R[vb];
          const base = rb === -1 ? [] : Lb0[rb];
          if (base.some(x => x.id === s.id)) continue;
          if (rb !== -1 && !near(s, base)) continue;
          for (let p = 0; p <= base.length; p++) {
            const Lb = Lb0.map(r => r.slice()); const nr = base.slice(0, p).concat([s], base.slice(p)); if (rb === -1) Lb.push(nr); else Lb[rb] = nr;
            const cb = tryVeh(vb, Lb); if (cb == null) continue;
            const delta = vb === va ? cb - vc[va] : (ca - vc[va]) + (cb - vc[vb]);
            if (delta < -0.5 && (!best || delta < best.delta)) best = { delta, vb, Lb, cb, ca };
          }
        }
        if (best) {
          if (best.vb === va) { R[va] = best.Lb.filter(r => r.length); vc[va] = best.cb; }
          else { R[va] = La.filter(r => r.length); vc[va] = best.ca; R[best.vb] = best.Lb.filter(r => r.length); vc[best.vb] = best.cb; }
          improved = true; i = 1e9; ra = 1e9;
        }
      }
      // (c) tukar dua store antar rit
      for (let va = 0; va < vehicles.length; va++) for (let ra = 0; ra < R[va].length; ra++) for (let i = 0; i < R[va][ra].length; i++)
        for (let vb = va; vb < vehicles.length; vb++) for (let rb = 0; rb < R[vb].length; rb++) {
          if (vb === va && rb <= ra) continue;
          for (let j = 0; j < R[vb][rb].length; j++) {
            const s = R[va][ra][i], u = R[vb][rb][j];
            if (s.id === u.id || R[va][ra].some(x => x.id === u.id) || R[vb][rb].some(x => x.id === s.id)) continue;
            if (!near(s, R[vb][rb]) || !near(u, R[va][ra])) continue;
            const La = R[va].map(r => r.slice()); La[ra][i] = u;
            if (vb === va) { La[rb][j] = s; const c = tryVeh(va, La); if (c != null && c < vc[va] - 0.5) { R[va] = La; vc[va] = c; improved = true; } continue; }
            const Lb = R[vb].map(r => r.slice()); Lb[rb][j] = s;
            const ca = tryVeh(va, La); if (ca == null) continue; const cb = tryVeh(vb, Lb); if (cb == null) continue;
            if (ca + cb < vc[va] + vc[vb] - 0.5) { R[va] = La; R[vb] = Lb; vc[va] = ca; vc[vb] = cb; improved = true; }
          }
        }
      // (d) rapikan urutan tiap rit (2-opt + relokasi dalam rit)
      for (let vi = 0; vi < vehicles.length; vi++) for (let ri = 0; ri < R[vi].length; ri++) {
        const simR = st => { const L = R[vi].map(r => r.slice()); L[ri] = st; const c = tryVeh(vi, L); return c == null ? { ok: false } : { ok: true, ret: c }; };
        const nr = improve(R[vi][ri], simR); const L = R[vi].map(r => r.slice()); L[ri] = nr; const c = tryVeh(vi, L);
        if (c != null && c < vc[vi] - 0.5) { R[vi] = L; vc[vi] = c; improved = true; }
      }
    }
    return { R, left, vc };
  }

  /* 4) Pindahkan store frekuensi 1x ke hari lain bila total lebih baik */
  function interDay(sol) {
    let moved = 0;
    for (const d of days) {
      for (let vi = 0; vi < vehicles.length; vi++) for (let ri = 0; ri < (sol[d].R[vi] || []).length; ri++) for (let i = 0; i < ((sol[d].R[vi] || [])[ri] || []).length; i++) {
        const s = sol[d].R[vi][ri][i]; if (fixedIds.has(s.id) || evals > EVAL_MAX * 1.6) continue;
        const Sd = { R: sol[d].R.map(L => L.map(r => r.slice())), left: sol[d].left.slice(), vc: sol[d].vc.slice() };
        Sd.R[vi][ri].splice(i, 1); Sd.R[vi] = Sd.R[vi].filter(r => r.length);
        const cv = vehEval(d, vi, Sd.R[vi], false); if (!cv) continue; Sd.vc[vi] = cv.cost;
        const before = dayCost(sol[d]);
        let best = null;
        for (const o of okDays(s)) {
          if (o === d || sol[o].R.some(L => L.some(r => r.some(x => x.id === s.id))) || sol[o].left.some(x => x.id === s.id)) continue;
          const So = dayLS(o, { R: sol[o].R, left: sol[o].left.concat([s]), vc: sol[o].vc });
          if (So.left.some(x => x.id === s.id)) continue;
          const delta = dayCost(So) - dayCost(sol[o]) + dayCost(Sd) - before;
          if (delta < -1 && (!best || delta < best.delta)) best = { delta, o, So };
        }
        if (best) { sol[d] = dayLS(d, Sd); sol[best.o] = best.So; moved++; i = 1e9; ri = 1e9; vi = 1e9; }
      }
    }
    return moved;
  }

  /* 5) Fairness: pindah/tukar store antar kendaraan di hari yang sama bila beban jadi lebih merata */
  function fairLS(sol) {
    let T = totals(sol), pen = fairPen(T), moved = 0;
    const sub = (a, b) => { const o = {}; for (const k in a) o[k] = a[k] - (b ? b[k] : 0); return o; };
    const add = (a, b) => { const o = {}; for (const k in a) o[k] = a[k] + (b ? b[k] : 0); return o; };
    for (let round = 0; round < 6 && evals < EVAL_MAX * 2.5; round++) {
      let any = false;
      for (const d of days) {
        const S = sol[d];
        for (let va = 0; va < vehicles.length; va++) for (let ra = 0; ra < S.R[va].length; ra++) for (let i = 0; i < (S.R[va][ra] || []).length; i++) {
          if (evals > EVAL_MAX * 2.5) break;
          const s = S.R[va][ra][i];
          const stA0 = vehStats(d, va, S.R[va]); if (!stA0) continue;
          const La = S.R[va].map(r => r.slice()); La[ra].splice(i, 1); const LaC = La.filter(r => r.length);
          const stA = vehStats(d, va, LaC); if (!stA) continue;
          let best = null;
          for (let vb = 0; vb < vehicles.length; vb++) {
            if (vb === va) continue;
            const stB0 = vehStats(d, vb, S.R[vb]); if (!stB0) continue;
            const slotsB = S.R[vb].map((r, k) => k).filter(k => S.R[vb][k].length);
            if (slotsB.length < (+vehicles[vb].maksShift || 1)) slotsB.push(-1);
            for (const rb of slotsB) {
              const base = rb === -1 ? [] : S.R[vb][rb];
              if (rb !== -1 && valid.length > 80 && !near(s, base)) continue;
              for (let p = 0; p <= base.length; p++) {
                const Lb = S.R[vb].map(r => r.slice()); const nr = base.slice(0, p).concat([s], base.slice(p)); if (rb === -1) Lb.push(nr); else Lb[rb] = nr;
                const stB = vehStats(d, vb, Lb); if (!stB) continue;
                const T2 = T.map(x => ({ ...x }));
                T2[va] = add(sub(T[va], stA0), stA); T2[vb] = add(sub(T[vb], stB0), stB);
                const delta = (stA.cost - stA0.cost) + (stB.cost - stB0.cost) + fairPen(T2) - pen;
                if (delta < -1 && (!best || delta < best.delta)) best = { delta, vb, Lb, T2 };
              }
            }
          }
          if (best) { S.R[va] = LaC; S.R[best.vb] = best.Lb; S.vc[va] = vehStats(d, va, LaC).cost; S.vc[best.vb] = vehStats(d, best.vb, best.Lb).cost; T = best.T2; pen = fairPen(T); moved++; any = true; i = 1e9; ra = 1e9; }
        }
        sol[d] = dayLSfair(d, sol[d]);
      }
      if (!any) break;
    }
    return moved;
  }
  // rapikan urutan dalam tiap rit tanpa memindah store antar kendaraan (agar pemerataan tidak dibatalkan)
  function dayLSfair(d, S) {
    const R = S.R.map(L => L.map(r => r.slice())), vc = S.vc.slice();
    for (let vi = 0; vi < vehicles.length; vi++) for (let ri = 0; ri < R[vi].length; ri++) {
      const simR = st => { const L = R[vi].map(r => r.slice()); L[ri] = st; const r = vehEval(d, vi, L, false); return r ? { ok: true, ret: r.cost } : { ok: false }; };
      const nr = improve(R[vi][ri], simR); const L = R[vi].map(r => r.slice()); L[ri] = nr; const r = vehEval(d, vi, L, false);
      if (r && r.cost < vc[vi] - 0.5) { R[vi] = L; vc[vi] = r.cost; }
    }
    return { R, left: S.left, vc };
  }

  /* --- Mode rute dasar: rute store mingguan diambil persis dari plan dasar (hari, kendaraan, rit, urutan sama tiap minggu);
         store 1x per 2–5 minggu hanya DISISIPKAN ke rute itu (posisi termurah, atau rit baru bila perlu). --- */
  const baseMode = !!(opts.base && !opts.base.error && Array.isArray(opts.base.trips));
  function fromBase(B) {
    const byId = new Map(valid.map(s => [String(s.id), s])), used = new Set(), sol = {};
    days.forEach(d => {
      const R = vehicles.map(() => []);
      B.trips.filter(t => t.day === d).slice().sort((a, b) => a.vIdx - b.vIdx || a.shift - b.shift).forEach(t => {
        if (!R[t.vIdx]) return;
        const st = t.stops.map(x => byId.get(String(x.store.id))).filter(Boolean);
        st.forEach(x => used.add(String(x.id))); if (st.length) R[t.vIdx].push(st);
      });
      const left = (B.unserved || []).filter(u => u.day === d).map(u => byId.get(String(u.store.id))).filter(x => x && !used.has(String(x.id)));
      left.forEach(x => used.add(String(x.id)));
      sol[d] = { R, left, vc: R.map((L, vi) => { const r = vehEval(d, vi, L, false); return r ? r.cost : 0; }) };
    });
    const extra = valid.filter(s => !used.has(String(s.id)));
    const ins = (s, skip) => { // posisi sisip termurah untuk store s (tanpa mengubah urutan store lain)
      let best = null;
      for (const d of okDays(s)) {
        const S = sol[d];
        for (let vi = 0; vi < vehicles.length; vi++) {
          const n = S.R[vi].filter(r => r.length).length, slots = S.R[vi].map((r, i) => i);
          if (n < (+vehicles[vi].maksShift || 1)) slots.push(-1);
          for (const ri of slots) {
            const base = ri === -1 ? [] : S.R[vi][ri];
            for (let p = 0; p <= base.length; p++) {
              const L = S.R[vi].map(r => r.slice()); const nr = base.slice(0, p).concat([s], base.slice(p)); if (ri === -1) L.push(nr); else L[ri] = nr;
              const r = vehEval(d, vi, L, false); if (!r) continue;
              const delta = r.cost - S.vc[vi];
              if (!best || delta < best.delta) best = { delta, d, vi, L, c: r.cost };
            }
          }
        }
      }
      return best;
    };
    const put = b => { sol[b.d].R[b.vi] = b.L; sol[b.d].vc[b.vi] = b.c; };
    const where = {}; // id -> hari tempat store tambahan disisipkan
    extra.slice().sort((a, b) => (+b.beratKg || 0) - (+a.beratKg || 0) || okDays(a).length - okDays(b).length).forEach(s => {
      const b = ins(s); if (b) { put(b); where[s.id] = b.d; } else { const d = okDays(s)[0]; sol[d].left.push(s); }
    });
    // perbaiki: keluarkan satu store tambahan lalu sisipkan ulang bila ada posisi lebih murah
    for (let round = 0; round < 3; round++) {
      let any = false;
      for (const s of extra) {
        const d = where[s.id]; if (d == null) continue;
        const S = sol[d]; let vi = -1, ri = -1;
        S.R.forEach((L, v) => L.forEach((r, k) => { if (r.includes(s)) { vi = v; ri = k; } }));
        if (vi < 0) continue;
        const L0 = S.R[vi], c0 = S.vc[vi];
        const L1 = L0.map(r => r.filter(x => x !== s)).filter(r => r.length); const r1 = vehEval(d, vi, L1, false); if (!r1) continue;
        const gain = c0 - r1.cost; S.R[vi] = L1; S.vc[vi] = r1.cost;
        const b = ins(s);
        if (b && b.delta < gain - 0.5) { put(b); where[s.id] = b.d; any = true; } else { S.R[vi] = L0; S.vc[vi] = c0; }
      }
      if (!any) break;
    }
    days.forEach(d => { sol[d].R = sol[d].R.map(L => L.filter(r => r.length)); });
    return sol;
  }

  /* --- jalankan: solusi awal (seperti sebelumnya) lalu multi-start + pencarian lokal --- */
  const t0 = Date.now();
  if (baseMode) {
    const sol = fromBase(opts.base), m = metric0(sol);
    return finish(sol, m, { starts: 0, rr: 0, rrOk: 0, cost: solCost(sol), dasar: true });
  }
  const initial = construct(assign(null), null);
  function metric0(sol) {
    let rit = 0, km = 0, dur = 0, kg = 0, capu = 0, un = 0;
    days.forEach(d => { const S = sol[d]; un += S.left.length; S.R.forEach((L, vi) => { const r = vehEval(d, vi, L, true); if (!r) return; r.trips.forEach(t => { rit++; km += t.km; dur += t.dur; kg += Math.max(t.kgDel, t.kgPick) / (+vehicles[vi].kapasitasKg || 1); capu += 1; }); }); });
    return { rit, km, jam: dur / 60, isi: capu ? kg / capu : 0, unserved: un };
  }
  const mInit = metric0(initial);
  let best = null, bestCost = Infinity, starts = 0, rr = 0, rrOk = 0;
  const nStart = deep ? Math.max(8, Math.round(Math.max(12, Math.min(40, Math.round(2400 / Math.max(10, valid.length)))) * sk)) : Math.max(3, Math.min(10, Math.round(600 / Math.max(10, valid.length))));
  const nRR = deep ? Math.max(10, Math.round(Math.max(20, Math.min(80, Math.round(3000 / Math.max(10, valid.length)))) * sk)) : 0;
  const cloneSol = sol => { const o = {}; days.forEach(d => o[d] = { R: sol[d].R.map(L => L.map(r => r.slice())), left: sol[d].left.slice(), vc: sol[d].vc.slice() }); return o; };
  for (let k = 0; k < nStart; k++) {
    const rnd = k === 0 ? null : mulberry32(1000 + k * 7919);
    const sol = k === 0 ? initial : construct(assign(rnd), rnd);
    for (const d of days) { sol[d] = dayLS(d, sol[d]); if (deep) yield { fase: "variasi", k: k + 0.5, n: nStart + nRR }; }
    if (deep) for (let r = 0; r < 2 && interDay(sol); r++) yield { fase: "variasi", k: k + 0.8, n: nStart + nRR }; // mode mendalam: tiap variasi juga dipindah antar hari
    starts++;
    const c = solCost(sol);
    if (c < bestCost - 1e-6) { bestCost = c; best = sol; }
    if (deep) yield { fase: "variasi", k: k + 1, n: nStart + nRR };
    if (evals > EVAL_MAX) break; // batas kerja
  }
  for (let r = 0; r < 3 && interDay(best); r++) {}
  bestCost = solCost(best);
  // mode mendalam: "bongkar & susun ulang" — keluarkan sebagian store dari satu hari lalu sisipkan ulang dengan pencarian lokal
  if (deep && best) {
    const rnd = mulberry32(424242); EVAL_MAX = evals + Math.round(1200000 * sk); // anggaran kerja sendiri untuk tahap ini
    for (let it = 0; it < nRR && evals < EVAL_MAX; it++) {
      const cand = cloneSol(best), d = days[Math.floor(rnd() * days.length)], S = cand[d];
      const all = []; S.R.forEach((L, vi) => L.forEach((r, ri) => r.forEach((st, i) => all.push([vi, ri, st]))));
      if (all.length < 3) continue;
      const m = Math.max(2, Math.round(all.length * (0.15 + rnd() * 0.2)));
      // pilih titik acak lalu tetangga terdekatnya (keluarkan satu kelompok yang berdekatan)
      const c0 = all[Math.floor(rnd() * all.length)][2];
      const pick = new Set(all.map(x => x[2]).sort((a, b) => hav([a.lat, a.lng], [c0.lat, c0.lng]) - hav([b.lat, b.lng], [c0.lat, c0.lng])).slice(0, m).map(x => x.id));
      const removed = [];
      S.R = S.R.map(L => L.map(r => r.filter(st => { if (pick.has(st.id)) { removed.push(st); return false; } return true; })).filter(r => r.length));
      S.left = S.left.concat(removed);
      S.vc = S.R.map((L, vi) => { const r = vehEval(d, vi, L, false); return r ? r.cost : Infinity; });
      cand[d] = dayLS(d, S); rr++;
      const c = solCost(cand);
      if (c < bestCost - 1e-6) { best = cand; bestCost = c; rrOk++; }
      yield { fase: "susun ulang", k: nStart + it + 1, n: nStart + nRR };
    }
    for (let r = 0; r < 2 && interDay(best); r++) {}
    bestCost = solCost(best);
  }
  const mNoFair = fairOn ? metric0(best) : null; const TnoFair = fairOn ? totals(best) : null;
  if (fairOn) fairLS(best);
  return finish(best, mInit, { starts, rr, rrOk, cost: bestCost, mNoFair, TnoFair });
  function finish(best, mInit, X) {
  const { starts, rr, rrOk, mNoFair, TnoFair } = X; const bestCost = X.cost;
  const res = {};
  days.forEach(d => { const S = best[d]; const trips = []; S.R.forEach((L, vi) => { const r = vehEval(d, vi, L, true); if (r) trips.push(...r.trips); }); res[d] = { trips, left: S.left }; });
  const mBest = metric0(best);
  const opt = { awal: mInit, akhir: mBest, starts, ms: Date.now() - t0, bobot: W, mendalam: deep && !X.dasar, rr, rrOk, cost: Math.round(bestCost), dasar: !!X.dasar };
  opt.solar = { aktif: psOn && fuelF.some(f => f > 1) && fuelF.some(f => f === 1), tingkat: PS.tingkat || "sedang" };
  if (fairOn && !X.dasar) { opt.fair = { kriteria: fKeys, tingkat: FP.tingkat || "sedang", sebelum: TnoFair, sesudah: totals(best), mSebelum: mNoFair, cap: capV, kgRelatif: FP.kgRelatif !== false }; }
  const unserved = [];
  days.forEach(d => res[d].left.forEach(s => {
    const ctx = makeCtx(state, d);
    let reason = "Waktu/kapasitas armada di hari ini sudah penuh";
    if (+s.beratKg > maxCap) reason = "Berat melebihi kapasitas kendaraan terbesar";
    else {
      const tries = vehicles.map(v => simFlex(ctx, depot, v, ctx.start, 1, [s], false));
      if (!tries.some(r => r.ok)) reason = [...new Set(tries.map(r => r.why).filter(Boolean))].join("; ") || reason;
    }
    unserved.push({ day: d, store: s, reason });
  }));
  const trips = [];
  days.forEach(d => res[d].trips.forEach(t => trips.push(t)));
  trips.sort((a, b) => a.day - b.day || a.vIdx - b.vIdx || a.shift - b.shift);
  return { depot, vehicles, days, trips, unserved, warn, opt, ctxBreaks: Object.fromEntries(days.map(d => [d, makeCtx(state, d).breaks])), H: ctx0.H };
  }
}

if (typeof module !== "undefined") module.exports = { buildPlan, planGen, buildWeeks, weeksGen, baseState, weekMeta, weekState, periodeOf, roadCfgKey, ptKey, normJalan, roadTable, parseKoordinat, fmtJam, toMin, HARI, simulate, makeCtx };
