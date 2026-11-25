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

/* ---------- Model waktu ---------- */
function makeCtx(state, day) {
  const p = state.params, L = p.lalin;
  const breaks = (state.breaks[day] || []).map(b => [toMin(b.mulai), toMin(b.selesai)]).filter(b => b[0] != null && b[1] != null && b[1] > b[0]).sort((a, b) => a[0] - b[0]);
  const peaks = (L.jamSibuk || []).map(j => [toMin(j.mulai), toMin(j.selesai), +j.faktor || 1]).filter(j => j[0] != null && j[1] != null);
  const pusat = L.pusat && L.pusat.lat != null ? [+L.pusat.lat, +L.pusat.lng] : null;
  const rate = Math.max(0.01, +p.rasioKgMenit || 30);
  function inCore(pt) { return pusat && +L.pusat.radiusKm > 0 && hav(pt, pusat) <= +L.pusat.radiusKm; }
  function advance(t, dur) {
    for (let guard = 0; guard < 100; guard++) {
      for (const [a, b] of breaks) if (a <= t && t < b) t = b;
      let nxt = Infinity; for (const [a] of breaks) if (a > t && a < nxt) nxt = a;
      if (t + dur <= nxt) return t + dur;
      dur -= nxt - t; t = nxt;
    }
    return t + dur;
  }
  function leg(a, b, t, speed) {
    const h = hav(a, b);
    if (h < 1e-6) return { km: 0, min: 0 };
    const road = h * (+L.faktorJalan || 1.65);
    let f;
    if (h >= (+L.batasAntarKotaKm || 25)) f = +L.fAntarKota || 1;
    else {
      const ca = inCore(a), cb = inCore(b);
      f = (ca && cb) ? (+L.fPusat || 1) : ((ca || cb) ? (+L.fPusatLuar || 1) : (+L.fPinggir || 1));
      if (t != null) { const tm = ((t % 1440) + 1440) % 1440; for (const [s, e, x] of peaks) if (tm >= s && tm < e) { f *= x; break; } }
    }
    return { km: road, min: road / Math.max(1, speed) * 60 * f };
  }
  function overlap(t0, t1) { let s = 0; for (const [a, b] of breaks) s += Math.max(0, Math.min(b, t1) - Math.max(a, t0)); return s; }
  const acts = (p.aktivitas || []).filter(a => a.hari && a.hari[day] && +a.durasi > 0);
  return { day, breaks, advance, leg, overlap, rate, acts, H: (+p.jamShift || 8) * 60, start: toMin(p.jamMulai) ?? 480 };
}

/* Simulasi satu rit. stops: array store (pengantaran dulu, lalu penjemputan). */
function simulate(ctx, depot, veh, t0, shiftNo, stops, detail) {
  const segs = [];
  let t = t0, shiftStart = null;
  const acts = ctx.acts.filter(a => a.berlaku !== "shift1" || shiftNo === 1);
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
  const cap = +veh.kapasitasKg || 0;
  if (kgDel > cap + 1e-6) { ok = false; why = "Muatan melebihi kapasitas"; }
  if (kgPick > cap + 1e-6) { ok = false; why = "Barang yang dinaikkan melebihi kapasitas"; }
  if (stops.length && t - shiftStart > ctx.H + 1e-6) { ok = false; why = "Melebihi jam kerja shift"; }
  if (t > 24 * 60) { ok = false; why = "Melewati tengah malam"; }
  return { ok, why, t0, shiftStart, dep, ret: t, dur: t - shiftStart, km, kgDel, kgPick, stops: out, segs, backKm: back.km, backMin: back.min, backDep: tb, backBrk: ctx.overlap(tb, t) };
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
function routeDay(state, day, visits, depot, vehicles) {
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
    for (const c of cand) { if (sim([c.s]).ok) { route = [c.s]; break; } }
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
    avail[vi] = res.ret; used[vi] = sh;
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

function buildPlan(state) {
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
  const zeroF = stores.filter(s => !noCoord.includes(s) && !(s.hariTetap && s.hariTetap.length) && !(Math.round(+s.frek) > 0));
  zeroF.forEach(s => warn.push("\"" + s.nama + "\" dilewati karena frekuensi kirim belum diisi / tidak dikirim."));
  const valid = stores.filter(s => !noCoord.includes(s) && !zeroF.includes(s));
  state.vehicles.filter(v => v.aktif !== false && !(+v.kapasitasKg > 0)).forEach(v => warn.push("Kendaraan \"" + (v.jenis || "") + " " + (v.plat || "") + "\" tidak dipakai karena kapasitas kosong/0."));
  vehicles.filter(v => !(+v.kecepatan > 0)).forEach(v => warn.push("Kecepatan " + (v.jenis || "") + " " + (v.plat || "") + " kosong, dipakai 40 km/jam."));
  const maxCap = Math.max(...vehicles.map(v => +v.kapasitasKg));
  valid.filter(s => +s.beratKg > maxCap).forEach(s => warn.push("\"" + s.nama + "\" " + Math.round(s.beratKg) + " kg melebihi kapasitas kendaraan terbesar (" + maxCap + " kg). Pecah menjadi 2 baris store atau tambah kendaraan lebih besar."));
  const D = days.length;
  const ctx0 = makeCtx(state, days[0]);
  const work = s => (+s.beratKg || 0) / ctx0.rate + ctx0.leg([depot.lat, depot.lng], [s.lat, s.lng], null, 40).min * 0.9;
  const cap = {}; days.forEach(d => cap[d] = dayCapacity(state, d, depot, vehicles));
  const load = {}; days.forEach(d => load[d] = 0);
  const perDay = {}; days.forEach(d => perDay[d] = []);
  const fixedIds = new Set();
  // Frekuensi kirim (Nx seminggu) menentukan jumlah kunjungan; hari tetap (opsional) dipakai lebih dulu, sisanya diisi otomatis berjarak rata.
  const freqOf = s => { const f = Math.round(+s.frek || 0); return f > 0 ? f : ((s.hariTetap || []).length || 0); };
  const multi = valid.filter(s => (s.hariTetap && s.hariTetap.length) || freqOf(s) > 1).sort((a, b) => freqOf(b) - freqOf(a));
  const circ = (a, b) => { const i = days.indexOf(a), j = days.indexOf(b); const x = Math.abs(i - j); return Math.min(x, D - x); };
  for (const s of multi) {
    let f = freqOf(s);
    if (f > D) { warn.push("\"" + s.nama + "\": frekuensi " + f + "x seminggu melebihi " + D + " hari distribusi, dibatasi " + D + "x."); f = D; }
    let fixed = (s.hariTetap || []).filter(d => days.includes(d));
    if (fixed.length < (s.hariTetap || []).length) warn.push("\"" + s.nama + "\": sebagian hari tetap bukan hari distribusi.");
    if (fixed.length > f) { warn.push("\"" + s.nama + "\": hari tetap (" + fixed.length + " hari) lebih banyak dari frekuensi " + f + "x seminggu, dipakai " + f + " hari pertama."); fixed = fixed.slice(0, f); }
    const w = work(s);
    let ds;
    if (!fixed.length) {
      let best = null;
      for (let o = 0; o < D; o++) {
        const set = []; for (let i = 0; i < f; i++) set.push(days[(o + Math.round(i * D / f)) % D]);
        const score = Math.max(...set.map(d => (load[d] + w) / Math.max(1, cap[d])));
        if (!best || score < best.score - 1e-9) best = { score, set };
      }
      ds = best.set;
    } else {
      ds = fixed.slice();
      while (ds.length < f) {
        let best = null;
        for (const d of days) { if (ds.includes(d)) continue; const gap = Math.min(...ds.map(x => circ(x, d))); const r = (load[d] + w) / Math.max(1, cap[d]); if (!best || gap > best.gap || (gap === best.gap && r < best.r)) best = { d, gap, r }; }
        ds.push(best.d);
      }
    }
    ds.sort((a, b) => a - b);
    ds.forEach(d => { perDay[d].push(s); load[d] += w; });
    fixedIds.add(s.id);
  }
  // frekuensi 1x: sapuan sudut agar satu hari mengelompok secara geografis
  const flex = valid.filter(s => !fixedIds.has(s.id)).map(s => ({ s, a: Math.atan2(s.lat - depot.lat, s.lng - depot.lng) })).sort((x, y) => x.a - y.a);
  if (flex.length) {
    let gi = 0, gap = -1; // mulai dari celah sudut terbesar
    for (let i = 0; i < flex.length; i++) { const nx = flex[(i + 1) % flex.length]; let g = nx.a - flex[i].a; if (g <= 0) g += 2 * Math.PI; if (g > gap) { gap = g; gi = (i + 1) % flex.length; } }
    const ordered = flex.slice(gi).concat(flex.slice(0, gi)).map(x => x.s);
    const totalW = ordered.reduce((a, s) => a + work(s), 0) + days.reduce((a, d) => a + load[d], 0);
    const capSum = days.reduce((a, d) => a + cap[d], 0) || 1;
    let di = 0;
    for (const s of ordered) {
      while (di < D - 1 && load[days[di]] + work(s) / 2 > totalW * cap[days[di]] / capSum) di++;
      perDay[days[di]].push(s); load[days[di]] += work(s);
    }
  }
  // rute per hari + pindahkan sisa yang fleksibel ke hari lain
  const res = {};
  days.forEach(d => res[d] = routeDay(state, d, perDay[d], depot, vehicles));
  const unserved = [];
  for (let pass = 0; pass < 2; pass++) {
    for (const d of days) {
      const left = res[d].left.slice();
      for (const s of left) {
        if (fixedIds.has(s.id) && (s.hariTetap && s.hariTetap.length)) continue;
        const others = days.filter(x => x !== d && !perDay[x].some(y => y.id === s.id)).sort((a, b) => (load[a] / cap[a]) - (load[b] / cap[b]));
        for (const o of others) {
          const trial = routeDay(state, o, perDay[o].concat([s]), depot, vehicles);
          if (!trial.left.includes(s) && trial.left.length <= res[o].left.length) {
            perDay[o].push(s); res[o] = trial; load[o] += work(s);
            perDay[d] = perDay[d].filter(x => x !== s); res[d].left = res[d].left.filter(x => x !== s); load[d] -= work(s);
            break;
          }
        }
      }
    }
  }
  days.forEach(d => res[d].left.forEach(s => {
    const ctx = makeCtx(state, d);
    let reason = "Waktu/kapasitas armada di hari ini sudah penuh";
    if (+s.beratKg > maxCap) reason = "Berat melebihi kapasitas kendaraan terbesar";
    else {
      const tries = vehicles.map(v => simFlex(ctx, depot, v, ctx.start, 1, [s], false));
      if (!tries.some(r => r.ok)) reason = (tries.find(r => +vehicles[tries.indexOf(r)].kapasitasKg >= +s.beratKg) || tries[0]).why || reason;
    }
    unserved.push({ day: d, store: s, reason });
  }));
  const trips = [];
  days.forEach(d => res[d].trips.forEach(t => trips.push(t)));
  trips.sort((a, b) => a.day - b.day || a.vIdx - b.vIdx || a.shift - b.shift);
  return { depot, vehicles, days, trips, unserved, warn, ctxBreaks: Object.fromEntries(days.map(d => [d, makeCtx(state, d).breaks])), H: ctx0.H };
}

if (typeof module !== "undefined") module.exports = { buildPlan, parseKoordinat, fmtJam, toMin, HARI, simulate, makeCtx };
