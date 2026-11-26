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
function gatePt(state) { // titik jalur keluar/masuk gudang (Parameter); null bila kosong / tidak terbaca
  const g = parseKoordinat(state.params && state.params.titikGudang);
  return g && g.lat != null ? [g.lat, g.lng] : null;
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
  const G = gatePt(state);
  if (G) { const i = idx.get(ptKey(G[0], G[1])); if (i != null) { let m = byLat.get(+G[0]); if (!m) byLat.set(+G[0], m = new Map()); m.set(+G[1], i); } }
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
  const runWeeks = function* (base) {
    const o = [];
    for (let w = 0; w < meta.H; w++) {
      const P = buildPlan(weekState(state, meta, w), base ? Object.assign({}, opts, { base, mendalam: false }) : opts);
      if (P && !P.error) { P.week = w; P.nMinggu = meta.H; if (base && base.opt) P.opt.dasarInfo = base.opt; }
      o.push(P);
      yield { fase: "sisip minggu " + (w + 1) + "/" + meta.H, k: 100, n: 100 };
    }
    return o;
  };
  let weeks = yield* runWeeks(base);
  // metode zona membuat rute dasar padat merata; bila store 2–5 mingguan jadi tidak muat, bandingkan dengan rute dasar metode lama
  const unOf = L => L.reduce((a, P) => a + (P && P.unserved ? P.unserved.length : 0), 0);
  if (base && state.params.metodeZona !== false && unOf(weeks) > 0) {
    let b2 = yield* planGen(Object.assign({}, bs, { params: Object.assign({}, bs.params, { metodeZona: false }) }), opts);
    if (b2 && !b2.error) {
      const w2 = yield* runWeeks(b2);
      const kmOf = L => L.reduce((a, P) => a + (P && P.trips ? P.trips.reduce((x, t) => x + t.km, 0) : 0), 0);
      if (unOf(w2) < unOf(weeks) || (unOf(w2) === unOf(weeks) && kmOf(w2) < kmOf(weeks) - 1e-6)) { weeks = w2; base = b2; }
    }
  }
  weeks.forEach(P => out.push(P));
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
  // semua rit keluar & masuk gudang lewat satu titik jalur (Parameter) bila diisi
  const G = gatePt(state), D0 = state.stores.find(s => s.antaran === "Origin" && s.aktif !== false && s.lat != null);
  const near = (q, r) => Math.abs(q[0] - r[0]) < 1e-7 && Math.abs(q[1] - r[1]) < 1e-7;
  const atD = q => D0 && near(q, [D0.lat, D0.lng]);
  function leg(a, b, t, speed) {
    if (G && D0 && !near(a, G) && !near(b, G) && (atD(a) !== atD(b))) {
      const x = leg0(a, G, t, speed), y = leg0(G, b, t != null ? t + x.min : null, speed);
      return { km: x.km + y.km, min: x.min + y.min };
    }
    return leg0(a, b, t, speed);
  }
  function leg0(a, b, t, speed) {
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
  // loading/unloading di gudang tidak lagi jadi aktivitas: dibentuk otomatis dari muatan tiap rit (Gandi 2026-11-27)
  (p.aktivitas || []).map((a, i) => Object.assign({}, a, { _i: i })).filter(a => !a.muatan && a.hari && a.hari[day] && +a.durasi > 0).forEach(a => {
    if (a.waktu !== "setelah") { acts.push(Object.assign({}, a, { waktu: "sebelum" })); return; }
    // aktivitas "setelah kembali" = persiapan rit berikutnya (shift berikutnya / esok hari)
    if (pagiHariPertama && day === firstDay) acts.push(Object.assign({}, a, { waktu: "sebelum", berlaku: "shift1", pagi: true, muatan: false }));
    // hari terakhir (mode pagi): tidak perlu menyiapkan esok hari; rit ke-2 dst. tetap disiapkan (dijalankan sebelum berangkat rit itu)
    if (pagiHariPertama && day === lastDay) { if (a.berlaku !== "shift1") acts.push(Object.assign({}, a, { waktu: "sebelum", berlaku: "lanjut", muatan: false })); }
    else acts.push(Object.assign({}, a, { waktu: "setelah" }));
  });
  const H = (+p.jamShift || 8) * 60, start = toMin(p.jamMulai) ?? 480;
  // Shift 1 habis untuk aktivitas khusus shift 1 (mis. pembersihan Senin) sehingga tidak ada rit yang muat:
  // kendaraan 2 shift langsung jalan di shift 2 sesudah shift 1 selesai; kendaraan 1 shift libur hari itu (Gandi 2026-11-26).
  let skip1 = false, s1end = null;
  if (acts.some(a => a.berlaku === "shift1" && a.waktu !== "setelah")) {
    let t = start, ss = null;
    const a1 = acts.filter(a => a.waktu !== "setelah" && a.berlaku !== "lanjut");
    for (const a of a1.filter(a => !a.dihitung)) t = advance(advance(t, 0), +a.durasi);
    for (const a of a1.filter(a => a.dihitung)) { t = advance(t, 0); if (ss == null) ss = t; t = advance(t, +a.durasi); }
    const dep = advance(t, 0); if (ss == null) ss = dep;
    const D = (state.stores || []).find(s => s.antaran === "Origin" && s.aktif !== false && s.lat != null);
    let minTrip = Infinity;
    if (D) for (const s of state.stores) if (s !== D && s.aktif !== false && s.lat != null && s.antaran !== "Origin") {
      const m = leg([D.lat, D.lng], [s.lat, s.lng], null, 40).min + (+s.beratKg || 0) / rate * 2 + leg([s.lat, s.lng], [D.lat, D.lng], null, 40).min;
      if (m < minTrip) minTrip = m;
    }
    const after = acts.filter(a => a.waktu === "setelah" && a.dihitung).reduce((x, a) => x + (+a.durasi || 0), 0);
    if (minTrip < Infinity && dep + minTrip + after > ss + H) { skip1 = true; s1end = ss + H; }
  }
  // posisi menaikkan barang di gudang di antara aktivitas sebelum berangkat (default: tepat sebelum berangkat)
  const mi = (p.aktivitas || []).findIndex(a => a.muatan && a.waktu !== "setelah");
  const loadPos = mi >= 0 ? mi : Number.isFinite(+p.posLoadingGudang) && p.posLoadingGudang !== null && p.posLoadingGudang !== "" ? +p.posLoadingGudang - 0.5 : Infinity; // dimuat sebelum aktivitas berindeks > loadPos
  return { day, breaks, advance, leg, overlap, rate, acts, H, start, skip1, s1end, loadPos };
}

/* Simulasi satu rit. stops: array store (pengantaran dulu, lalu penjemputan). */
function simulate(ctx, depot, veh, t0, shiftNo0, stops, detail) {
  const segs = [];
  const shiftNo = ctx.skip1 ? shiftNo0 + 1 : shiftNo0; // shift 1 dipakai aktivitas (pembersihan): rit pertama = shift 2
  if (ctx.skip1 && t0 < ctx.s1end) t0 = ctx.s1end;
  let t = t0, shiftStart = null;
  const all = ctx.acts.filter(a => a.berlaku === "shift1" ? shiftNo === 1 : a.berlaku === "lanjut" ? shiftNo > 1 : true);
  const acts = all.filter(a => a.waktu !== "setelah"), after = all.filter(a => a.waktu === "setelah");
  // menaikkan barang di gudang (otomatis, Gandi 2026-11-27): muatan store antaran Tujuan + Menurunkan barang di rit ini ÷ rasio loading/unloading, masuk jam shift
  const kgNaik = stops.reduce((x, s) => x + (s.loading !== "Menaikkan" && s.antaran !== "Origin" ? +s.beratKg || 0 : 0), 0);
  let loaded = !(kgNaik > 0);
  const doLoad = () => { loaded = true; t = ctx.advance(t, 0); if (shiftStart == null) shiftStart = t; const s = t; t = ctx.advance(t, kgNaik / ctx.rate); if (detail) segs.push({ type: "muat", start: s, end: t, label: "Menaikkan barang di " + depot.nama, kg: kgNaik }); };
  for (const a of acts.filter(a => !a.dihitung)) { t = ctx.advance(t, 0); const s = t; t = ctx.advance(t, +a.durasi); if (detail) segs.push({ type: "aktivitas", start: s, end: t, label: a.nama }); }
  for (const a of acts.filter(a => a.dihitung)) { if (!loaded && a._i > ctx.loadPos) doLoad(); t = ctx.advance(t, 0); if (shiftStart == null) shiftStart = t; const s = t; t = ctx.advance(t, +a.durasi); if (detail) segs.push({ type: "aktivitas", start: s, end: t, label: a.nama }); }
  if (!loaded) doLoad();
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
  // barang yang dinaikkan di store (mis. PRODUKSI) diturunkan di gudang setelah pulang, rasio sama dengan store (Gandi 2026-11-27)
  if (kgPick > 0) { t = ctx.advance(t, 0); const s0 = t; t = ctx.advance(t, kgPick / ctx.rate); if (detail) segs.push({ type: "bongkar", start: s0, end: t, label: "Menurunkan barang di " + depot.nama, kg: kgPick }); }
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
  if (!vehOnDay(veh, ctx.day)) { ok = false; why = vnm + " tidak aktif distribusi hari " + HARI[ctx.day]; }
  // Akses kendaraan per store: kosong = semua jenis kendaraan boleh
  const vj = normJenis(veh.jenis);
  for (const s of stops) if (!aksesOk(s, vj)) { ok = false; why = s.nama + " hanya bisa dilayani " + s.akses.join(" / ") + " (akses kendaraan)"; break; }
  if (maxK > 0 && km > maxK + 1e-6) { ok = false; why = "Rit " + km.toFixed(1) + " km melebihi maks jarak per rit " + vnm + " (" + maxK + " km)"; }
  if (end > 24 * 60) { ok = false; why = "Melewati tengah malam"; }
  // kunci kendaraan / shift dari Peta Rute (Gandi 2026-11-27)
  for (const s of stops) { const k = s.kunci; if (!k) continue;
    if (k.kendaraan && k.kendaraan !== veh.id) { ok = false; why = s.nama + " dikunci ke kendaraan lain (" + (k.kendaraanNama || k.kendaraan) + ")"; break; }
    if (k.shift && +k.shift !== shiftNo) { ok = false; why = s.nama + " dikunci ke shift " + k.shift; break; } }
  if (shiftNo > (+veh.maksShift || 1)) { ok = false; why = "Shift 1 hari " + HARI[ctx.day] + " habis untuk " + (ctx.acts.filter(a => a.berlaku === "shift1").map(a => a.nama).join(" dan ") || "aktivitas") + "; " + vnm + " hanya 1 shift"; }
  return { ok, why, t0, shiftStart, shiftEff: shiftNo, dep, ret, end, endShift: endCounted, dur: endCounted - shiftStart, km, kgDel, kgPick, stops: out, segs, backKm: back.km, backMin: back.min, backDep: tb, backBrk: ctx.overlap(tb, ret) };
}

/* Zona pratinjau (tanpa kendaraan, Gandi 2026-11-27): tiap store satu titik & satu zona, dikelompokkan berdasarkan jarak terdekat,
   jumlah store tiap zona rata (Gandi 2026-11-27: tanpa melihat muatan). Frekuensi kirim dan hari belum dipakai. Jumlah zona = jumlah hari distribusi. */
function zonePreview(state) {
  const days = (state.params.hari || []).map((x, i) => x ? i : -1).filter(i => i >= 0);
  const D = days.length; if (!D) return null;
  const st = state.stores.filter(x => x.aktif !== false && x.antaran !== "Origin" && x.lat != null && x.lng != null);
  if (!st.length) return null;
  const pt = x => [x.lat, x.lng], kgOf = () => 1, kgReal = x => +x.beratKg || 0; // yang diratakan: jumlah titik
  const fOf = () => 1;
  const visits = []; st.forEach(x => { for (let k = 0; k < fOf(x); k++) visits.push(x); });
  const tot = visits.reduce((a, x) => a + kgOf(x), 0), target = tot / D;
  const ops = x => Array.isArray(x.hariOperasi) ? x.hariOperasi : [0, 1, 2, 3, 4, 5, 6];
  // pusat awal: titik terjauh berurutan, lalu k-means
  const D0 = state.stores.find(x => x.antaran === "Origin" && x.lat != null) || st[0];
  let C = [pt(st.slice().sort((a, b) => hav(pt(b), pt(D0)) - hav(pt(a), pt(D0)))[0])];
  while (C.length < D) { let bs = null, bd = -1; for (const x of st) { const m = Math.min(...C.map(c => hav(pt(x), c))); if (m > bd) { bd = m; bs = x; } } C.push(pt(bs)); }
  for (let it = 0; it < 8; it++) { const G = C.map(() => []); st.forEach(x => { let bi = 0; C.forEach((c, i) => { if (hav(pt(x), c) < hav(pt(x), C[bi])) bi = i; }); G[bi].push(x); }); C = C.map((c, i) => G[i].length ? [G[i].reduce((a, x) => a + x.lat, 0) / G[i].length, G[i].reduce((a, x) => a + x.lng, 0) / G[i].length] : c); }
  const assignBal = () => {
    const kg = C.map(() => 0), Z = new Map(); // Z: store id -> [zona]
    const order = visits.map((x, j) => { const ds = C.map(c => hav(pt(x), c)).sort((a, b) => a - b); return { x, j, r: (ds[1] ?? ds[0]) - ds[0] }; }).sort((a, b) => b.r - a.r || a.j - b.j);
    for (const { x } of order) {
      const used = Z.get(x.id) || [];
      const cand = C.map((c, i) => i).filter(i => !used.includes(i)).sort((a, b) => hav(pt(x), C[a]) - hav(pt(x), C[b]));
      let pick = cand.find(i => kg[i] + kgOf(x) <= Math.ceil(target));
      if (pick == null) pick = cand.slice().sort((a, b) => kg[a] - kg[b])[0];
      Z.set(x.id, used.concat([pick])); kg[pick] += kgOf(x);
    }
    return { Z, kg };
  };
  let R = assignBal();
  for (let it = 0; it < 8; it++) {
    C = C.map((c, i) => { const m = st.filter(x => R.Z.get(x.id).includes(i)); return m.length ? [m.reduce((a, x) => a + x.lat, 0) / m.length, m.reduce((a, x) => a + x.lng, 0) / m.length] : c; });
    R = assignBal();
  }
  // tukar dua store 1x antar zona bila lebih dekat ke pusat dan keseimbangan tidak memburuk
  const single = st.filter(x => R.Z.get(x.id).length === 1);
  for (let pass = 0; pass < 3; pass++) {
    let any = false;
    for (let a = 0; a < single.length; a++) for (let b = a + 1; b < single.length; b++) {
      const x = single[a], y = single[b], zx = R.Z.get(x.id)[0], zy = R.Z.get(y.id)[0]; if (zx === zy) continue;
      const gain = hav(pt(x), C[zx]) + hav(pt(y), C[zy]) - hav(pt(x), C[zy]) - hav(pt(y), C[zx]); if (gain < 0.05) continue;
      const kx = R.kg[zx] - kgOf(x) + kgOf(y), ky = R.kg[zy] - kgOf(y) + kgOf(x), over = k => Math.max(0, k - target * 1.06);
      if (over(kx) + over(ky) > over(R.kg[zx]) + over(R.kg[zy]) + 1) continue;
      R.Z.set(x.id, [zy]); R.Z.set(y.id, [zx]); R.kg[zx] = kx; R.kg[zy] = ky; any = true;
    }
    if (!any) break;
  }
  // pemerataan muatan (Gandi: muatan tiap zona seimbang dengan zona lainnya): pindah / tukar store antar zona
  // bila selisih muatan mengecil; jarak ke pusat zona ikut dihitung agar zona tetap rapat
  { const BW = 4000, obj = () => R.kg.reduce((a, k) => a + BW * ((k - target) / target) ** 2, 0) + st.reduce((a, x) => a + R.Z.get(x.id).reduce((b, i) => b + hav(pt(x), C[i]), 0), 0);
    let cur = obj();
    for (let pass = 0; pass < 40; pass++) {
      let best = null;
      for (const x of st) for (const zi of R.Z.get(x.id)) for (let zj = 0; zj < D; zj++) {
        if (zj === zi || R.Z.get(x.id).includes(zj)) continue;
        const k1 = R.kg[zi] - kgOf(x), k2 = R.kg[zj] + kgOf(x);
        const dB = BW * (((k1 - target) / target) ** 2 + ((k2 - target) / target) ** 2 - ((R.kg[zi] - target) / target) ** 2 - ((R.kg[zj] - target) / target) ** 2);
        const dD = hav(pt(x), C[zj]) - hav(pt(x), C[zi]), dl = dB + dD;
        if (dl < -1e-6 && (!best || dl < best.dl)) best = { dl, x, zi, zj, k1, k2 };
        for (const y of st) { // tukar x (zi) dengan y (zj)
          if (y === x || !R.Z.get(y.id).includes(zj) || R.Z.get(y.id).includes(zi)) continue;
          const t1 = R.kg[zi] - kgOf(x) + kgOf(y), t2 = R.kg[zj] + kgOf(x) - kgOf(y);
          const eB = BW * (((t1 - target) / target) ** 2 + ((t2 - target) / target) ** 2 - ((R.kg[zi] - target) / target) ** 2 - ((R.kg[zj] - target) / target) ** 2);
          const eD = hav(pt(x), C[zj]) - hav(pt(x), C[zi]) + hav(pt(y), C[zi]) - hav(pt(y), C[zj]), el = eB + eD;
          if (el < -1e-6 && (!best || el < best.dl)) best = { dl: el, x, zi, zj, y, k1: t1, k2: t2 };
        }
      }
      if (!best) break;
      R.Z.set(best.x.id, R.Z.get(best.x.id).map(i => i === best.zi ? best.zj : i));
      if (best.y) R.Z.set(best.y.id, R.Z.get(best.y.id).map(i => i === best.zj ? best.zi : i));
      R.kg[best.zi] = best.k1; R.kg[best.zj] = best.k2; cur += best.dl;
    }
  }
  // nomor zona berurutan searah jarum jam dari gudang
  const ang = c => Math.atan2(c[0] - D0.lat, c[1] - D0.lng);
  const ord = C.map((c, i) => i).sort((a, b) => ang(C[b]) - ang(C[a]));
  const zones = ord.map((i, k) => { const m = st.filter(x => R.Z.get(x.id)[0] === i); return { no: k + 1, kg: m.reduce((a, x) => a + kgReal(x), 0), n: m.length, center: C[i] }; });
  const byStore = {}; st.forEach(x => { byStore[x.id] = ord.indexOf(R.Z.get(x.id)[0]) + 1; });
  // pindah zona manual dari Peta Rute (Gandi 2026-11-27)
  st.forEach(x => { const m = Math.round(+x.zonaManual); if (m >= 1 && m <= D) byStore[x.id] = m; });
  zones.forEach(z => { const m = st.filter(x => byStore[x.id] === z.no); z.n = m.length; z.kg = m.reduce((a, x) => a + kgReal(x), 0); z.manual = m.filter(x => +x.zonaManual === z.no).length; });
  return { zones, byStore, target, total: st.reduce((a, x) => a + kgReal(x), 0) };
}
function vehOnDay(v, d) { return !Array.isArray(v.hariAktif) || v.hariAktif.includes(d); } // hari aktif distribusi per kendaraan (tidak diisi = semua hari)
// Prioritas store: bila armada tidak cukup, store prioritas tinggi dilayani lebih dulu (biaya "belum terlayani" lebih besar)
function vehLabelE(v) { return (v.jenis || "Kendaraan") + (v.plat ? " " + v.plat : ""); }
function kunciHari(s) { const h = s.kunci && s.kunci.hari; return Array.isArray(h) && h.length ? h : null; }
function prioOf(s) { return s.prioritas === "Tinggi" ? 2 : s.prioritas === "Rendah" ? 0 : 1; }
function unsCost(s) { return W.unserved * [0.5, 1, 3][prioOf(s)]; }
function normJenis(x) { return String(x || "").trim().toLowerCase().replace(/\s+/g, " "); }
function aksesOk(s, vj) { return !Array.isArray(s.akses) || !s.akses.length || s.akses.some(a => normJenis(a) === vj); }
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
    trips.push(Object.assign(res, { day, vIdx: vi, veh: v, shift: res.shiftEff || sh }));
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
    if (!vehOnDay(v, day)) return;
    let t = ctx.start;
    for (let k = 1; k <= (+v.maksShift || 1) - (ctx.skip1 ? 1 : 0); k++) {
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
  const opsOf0 = s => Array.isArray(s.hariOperasi) ? s.hariOperasi : [0, 1, 2, 3, 4, 5, 6];
  // kunci hari dari Peta Rute (Gandi 2026-11-27): store hanya boleh diantar di hari yang dikunci
  const opsOf = s => kunciHari(s) || opsOf0(s);
  const okDaysOf = {};
  stores.forEach(s => { okDaysOf[s.id] = days.filter(d => opsOf(s).includes(d)); });
  const closed = stores.filter(s => !noCoord.includes(s) && !zeroF.includes(s) && !okDaysOf[s.id].length);
  closed.forEach(s => warn.push("\"" + s.nama + "\" dilewati karena hari beroperasinya tidak ada yang jatuh di hari distribusi."));
  const valid = stores.filter(s => !noCoord.includes(s) && !zeroF.includes(s) && !closed.includes(s));
  const okDays = s => okDaysOf[s.id] || days;
  const restricted = s => okDays(s).length < days.length;
  state.vehicles.filter(v => v.aktif !== false && !(+v.kapasitasKg > 0)).forEach(v => warn.push("Kendaraan \"" + (v.jenis || "") + " " + (v.plat || "") + "\" tidak dipakai karena kapasitas kosong/0."));
  vehicles.filter(v => !days.some(d => vehOnDay(v, d))).forEach(v => warn.push("Kendaraan \"" + (v.jenis || "") + " " + (v.plat || "") + "\" tidak dipakai karena hari aktif distribusinya tidak ada yang jatuh di hari distribusi."));
  vehicles.filter(v => !(+v.kecepatan > 0)).forEach(v => warn.push("Kecepatan " + (v.jenis || "") + " " + (v.plat || "") + " kosong, dipakai 40 km/jam."));
  valid.filter(s => !vehicles.some(v => aksesOk(s, normJenis(v.jenis)))).forEach(s => warn.push("\"" + s.nama + "\" hanya boleh dilayani " + s.akses.join(" / ") + ", tetapi tidak ada kendaraan aktif dengan jenis itu."));
  const maxCap = Math.max(...vehicles.map(v => +v.kapasitasKg));
  valid.filter(s => +s.beratKg > maxCap).forEach(s => warn.push("\"" + s.nama + "\" " + Math.round(s.beratKg) + " kg melebihi kapasitas kendaraan terbesar (" + maxCap + " kg). Pecah menjadi 2 baris store atau tambah kendaraan lebih besar."));
  const D = days.length;
  const ctx0 = makeCtx(state, days[0]);
  const ctxOf = {}; days.forEach(d => ctxOf[d] = makeCtx(state, d));
  days.filter(d => ctxOf[d].skip1).forEach(d => warn.push("Hari " + HARI[d] + ": shift 1 habis untuk " + ctxOf[d].acts.filter(a => a.berlaku === "shift1").map(a => a.nama).join(" dan ") + " sampai " + fmtJam(ctxOf[d].s1end) + ", jadi kendaraan 2 shift langsung jalan di shift 2; kendaraan 1 shift tidak dapat rit."));
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
  // tingkat optimasi (Gandi 2026-11-27): rendah = usaha dasar, sedang = 2x, tinggi = 4x
  const EF = deep ? ({ rendah: 1, sedang: 2, tinggi: 4 }[state.params.tingkatOptimasi] || 2) : 1;
  let evals = 0, EVAL_MAX = deep ? Math.round(1500000 * sk * EF) : 250000; // batas kerja (deterministik, tidak bergantung kecepatan komputer)

  /* 1) Pembagian kunjungan ke hari. rnd = null -> deterministik (solusi awal); rnd -> variasi untuk multi-start */
  function assign(rnd, multiOnly) {
    const load = {}, perDay = {}; days.forEach(d => { load[d] = 0; perDay[d] = []; });
    const placed = new Set();
    for (const s of (multiOnly ? multi.filter(x => freqOf(x) > 1) : multi)) {
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
      ds.forEach(d => { perDay[d].push(s); load[d] += w; }); placed.add(s.id);
    }
    warned = true;
    if (multiOnly) return { perDay, load, placed };
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

  /* 1b) Metode zoning (urutan kerja Gandi):
         titik store -> dibagi menjadi zona sebanyak hari distribusi (1 zona = 1 hari), berdasarkan jarak terdekat,
         dengan berat muatan & jumlah store tiap zona seimbang (sebanding kapasitas armada hari itu).
         Store >1x seminggu sudah dibagi rata ke beberapa hari lebih dulu (tidak bisa masuk satu zona saja);
         store yang hari operasinya terbatas hanya boleh masuk zona hari yang ia buka. */
  const zoneMode = state.params.metodeZona !== false;
  // Store >1x seminggu: hari kirimnya dipilih mengikuti zona (pola hari berjarak rata yang sama seperti biasa,
  // tapi dipilih yang hari-harinya punya pusat zona paling dekat dengan store), lalu zona dibentuk ulang.
  const zonaMulti = state.params.zonaMulti !== false;
  function zoneAssign(rnd) {
    const A0 = assign(rnd, true);
    if (!zonaMulti || !A0.placed.size) return zoneCore(A0, rnd);
    const r1 = zoneCore({ perDay: Object.fromEntries(days.map(d => [d, A0.perDay[d].slice()])), load: Object.assign({}, A0.load), placed: A0.placed }, rnd);
    if (!r1.C) return r1;
    const cen = {}; r1.zDay.forEach((d, i) => cen[d] = r1.C[i]);
    const perDay = {}, load = {}; days.forEach(d => { perDay[d] = []; load[d] = 0; });
    const M = multi.filter(x => freqOf(x) > 1).slice().sort((a, b) => okDays(a).length - okDays(b).length);
    for (const s of M) {
      const Ad = okDays(s), K = Ad.length; const f = Math.min(freqOf(s), K), w = work(s);
      let best = null;
      for (let o = 0; o < K; o++) {
        const set = []; for (let i = 0; i < f; i++) set.push(Ad[(o + Math.round(i * K / f)) % K]);
        const key = set.slice().sort((a, b) => a - b);
        const dz = key.reduce((a, d) => a + (cen[d] ? hav([s.lat, s.lng], cen[d]) : 0), 0);
        const ld = Math.max(...key.map(d => (load[d] + w) / Math.max(1, cap[d])));
        const sc = (s.loading === "Menaikkan" ? 0 : dz) + ld * 3;
        if (!best || sc < best.sc - 1e-9) best = { sc, key };
      }
      best.key.forEach(d => { perDay[d].push(s); load[d] += w; });
    }
    return zoneCore({ perDay, load, placed: A0.placed }, rnd);
  }
  function zoneCore(A, rnd) {
    const { perDay, load } = A;
    const F = valid.filter(s => !A.placed.has(s.id)); // frekuensi 1x: dibagi lewat zona
    if (!F.length) return A;
    const kgOf = s => +s.beratKg || 0;
    const capSum = days.reduce((a, d) => a + cap[d], 0) || 1;
    const multiKg = {}, multiN = {}; days.forEach(d => { multiKg[d] = perDay[d].filter(x => x.loading !== "Menaikkan").reduce((a, x) => a + kgOf(x), 0); multiN[d] = perDay[d].filter(x => x.loading !== "Menaikkan").length; });
    const totKg = F.reduce((a, s) => a + kgOf(s), 0) + days.reduce((a, d) => a + multiKg[d], 0);
    const totN = F.length + days.reduce((a, d) => a + multiN[d], 0);
    const tKg = {}, tN = {}; days.forEach(d => { tKg[d] = Math.max(0, totKg * cap[d] / capSum - multiKg[d]); tN[d] = Math.max(0, totN * cap[d] / capSum - multiN[d]); });
    const pt = s => [s.lat, s.lng], dist = (a, b) => hav(a, b);
    const okZ = (s, d) => okDaysOf[s.id] ? okDaysOf[s.id].includes(d) : true;
    // pusat awal: titik terjauh berurutan (k-means++ deterministik; variasi acak untuk multi-start)
    let C = []; const first = rnd ? F[Math.floor(rnd() * F.length)] : F.slice().sort((a, b) => dist(pt(b), [depot.lat, depot.lng]) - dist(pt(a), [depot.lat, depot.lng]))[0];
    C.push(pt(first));
    while (C.length < D) { let bs = null, bd = -1; for (const s of F) { const m = Math.min(...C.map(c => dist(pt(s), c))) * (rnd ? 0.6 + rnd() * 0.8 : 1); if (m > bd) { bd = m; bs = s; } } C.push(pt(bs)); }
    // k-means biasa beberapa putaran untuk bentuk zona yang rapat
    for (let it = 0; it < 6; it++) { const G = C.map(() => []); F.forEach(s => { let bi = 0; C.forEach((c, i) => { if (dist(pt(s), c) < dist(pt(s), C[bi])) bi = i; }); G[bi].push(s); }); C = C.map((c, i) => G[i].length ? [G[i].reduce((a, s) => a + s.lat, 0) / G[i].length, G[i].reduce((a, s) => a + s.lng, 0) / G[i].length] : c); }
    // pasangkan zona ke hari: coba semua urutan (≤ 7 hari), pilih yang paling sedikit melanggar hari operasi & paling dekat ke store multi di hari itu
    const perms = []; const permute = (a, k) => { if (k === a.length) { perms.push(a.slice()); return; } for (let i = k; i < a.length; i++) { [a[k], a[i]] = [a[i], a[k]]; permute(a, k + 1); [a[k], a[i]] = [a[i], a[k]]; } };
    if (D <= 7) permute(days.slice(), 0); else perms.push(days.slice());
    const near0 = F.map(s => { let bi = 0; C.forEach((c, i) => { if (dist(pt(s), c) < dist(pt(s), C[bi])) bi = i; }); return bi; });
    let bestP = perms[0], bestPc = Infinity;
    for (const P of perms) { let c = 0; F.forEach((s, j) => { if (!okZ(s, P[near0[j]])) c += 1000; }); P.forEach((d, i) => { perDay[d].forEach(x => { c += dist(pt(x), C[i]) * 0.2; }); }); if (c < bestPc) { bestPc = c; bestP = P; } }
    const zDay = bestP; // zona i -> hari zDay[i]
    // penugasan seimbang: store dengan "penyesalan" terbesar (beda jarak ke zona terdekat vs kedua) ditaruh lebih dulu ke zona terdekat yang masih muat
    const assignBal = () => {
      const kg = C.map(() => 0), n = C.map(() => 0), Z = new Map();
      const order = F.map(s => { const ds = C.map((c, i) => okZ(s, zDay[i]) ? dist(pt(s), c) : Infinity).sort((a, b) => a - b); return { s, r: (ds[1] ?? ds[0]) - ds[0] }; }).sort((a, b) => b.r - a.r);
      for (const { s } of order) {
        const cand = C.map((c, i) => i).filter(i => okZ(s, zDay[i])).sort((a, b) => dist(pt(s), C[a]) - dist(pt(s), C[b]));
        if (!cand.length) { const i0 = 0; Z.set(s.id, i0); kg[i0] += kgOf(s); n[i0]++; continue; }
        let pick = cand.find(i => kg[i] + kgOf(s) <= tKg[zDay[i]] * 1.06 + 1 && n[i] + 1 <= Math.ceil(tN[zDay[i]] * 1.12));
        if (pick == null) pick = cand.slice().sort((a, b) => (kg[a] + kgOf(s)) / Math.max(1, tKg[zDay[a]]) - (kg[b] + kgOf(s)) / Math.max(1, tKg[zDay[b]]))[0];
        Z.set(s.id, pick); kg[pick] += kgOf(s); n[pick]++;
      }
      return { Z, kg, n };
    };
    let R = assignBal();
    for (let it = 0; it < 6; it++) { // geser pusat zona ke titik tengah anggotanya lalu bagi ulang
      C = C.map((c, i) => { const m = F.filter(s => R.Z.get(s.id) === i); return m.length ? [m.reduce((a, s) => a + s.lat, 0) / m.length, m.reduce((a, s) => a + s.lng, 0) / m.length] : c; });
      R = assignBal();
    }
    // perbaiki: tukar dua store antar zona bila jarak ke pusat zona berkurang dan keseimbangan tetap terjaga
    const { Z, kg, n } = R;
    for (let pass = 0; pass < 3; pass++) {
      let any = false;
      for (let a = 0; a < F.length; a++) for (let b = a + 1; b < F.length; b++) {
        const s = F[a], u = F[b], zs = Z.get(s.id), zu = Z.get(u.id); if (zs === zu || !okZ(s, zDay[zu]) || !okZ(u, zDay[zs])) continue;
        const gain = dist(pt(s), C[zs]) + dist(pt(u), C[zu]) - dist(pt(s), C[zu]) - dist(pt(u), C[zs]); if (gain < 0.05) continue;
        const ks = kg[zs] - kgOf(s) + kgOf(u), ku = kg[zu] - kgOf(u) + kgOf(s);
        const over = (k, d) => Math.max(0, k - tKg[d] * 1.06);
        if (over(ks, zDay[zs]) + over(ku, zDay[zu]) > over(kg[zs], zDay[zs]) + over(kg[zu], zDay[zu]) + 1) continue;
        Z.set(s.id, zu); Z.set(u.id, zs); kg[zs] = ks; kg[zu] = ku; any = true;
      }
      if (!any) break;
    }
    F.forEach(s => { const d = zDay[Z.get(s.id)]; perDay[d].push(s); load[d] += work(s); });
    return { perDay, load, C, zDay };
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
  // Sub-zona per kendaraan: tiap rit diusahakan satu kelompok yang rapat (biaya tambahan = jumlah jarak store ke titik tengah rit)
  const SUBZ = state.params.subZona === false ? 0 : (+state.params._subZonaW || 8);
  function spreadCost(stops) {
    if (!SUBZ) return 0; const X = stops.filter(x => x.loading !== "Menaikkan"); if (X.length < 2) return 0;
    const c = [X.reduce((a, x) => a + x.lat, 0) / X.length, X.reduce((a, x) => a + x.lng, 0) / X.length];
    return SUBZ * X.reduce((a, x) => a + hav([x.lat, x.lng], c), 0);
  }
  function vehEval(d, vi, list, detail) {
    const ctx = ctxOf[d], v = vehicles[vi]; evals++;
    let t = ctx.start, sh = 0, cost = 0; const trips = [];
    for (const stops of list) {
      if (!stops.length) continue;
      sh++; if (sh > (+v.maksShift || 1)) return null;
      const r = simFlex(ctx, depot, v, t, sh, orderStops(stops), detail);
      if (!r.ok) return null;
      cost += (W.rit + r.dur + W.km * r.km) * fuelF[vi] + spreadCost(stops);
      if (detail) trips.push(Object.assign(r, { day: d, vIdx: vi, veh: v, shift: r.shiftEff || sh }));
      t = r.end;
    }
    return { cost, trips };
  }
  // Prioritas bahan bakar: kendaraan bensin diberi biaya lebih tinggi agar tugas diutamakan ke kendaraan solar
  const PS = state.params.prioritasSolar || {};
  const psOn = false; // prioritas solar dihapus (Gandi 2026-11-26)
  const psF = { ringan: 1.15, sedang: 1.35, kuat: 1.8 }[PS.tingkat] || 1.35;
  const isBensin = v => /bensin|pertalite|pertamax|gasoline/i.test(v.bbm || "");
  const fuelOnly = vehicles.map(v => psOn && isBensin(v) ? psF : 1);
  // Fairness: kendaraan berkapasitas besar diprioritaskan (biaya sedikit lebih murah) dan mendapat porsi beban sebanding kapasitasnya
  const FP0 = state.params.fairness || {}, capPrio = false; // bagian dari fairness, dihapus
  const maxCapV = Math.max(...vehicles.map(v => +v.kapasitasKg || 1));
  const capF = vehicles.map(v => capPrio ? 1 + 0.12 * (1 - (+v.kapasitasKg || 1) / maxCapV) : 1);
  const fuelF = fuelOnly.map((f, i) => f * capF[i]);
  const meanCap = vehicles.reduce((a, v) => a + (+v.kapasitasKg || 1), 0) / vehicles.length;
  const capShare = vehicles.map(v => capPrio ? (+v.kapasitasKg || 1) / meanCap : 1);
  const share = fuelOnly.map((f, vi) => Math.max(0.05, days.filter(d => vehOnDay(vehicles[vi], d)).length / days.length) / f); // porsi adil: kendaraan bensin & yang hari aktifnya lebih sedikit mendapat porsi lebih kecil
  // statistik satu kendaraan di satu hari (untuk fairness)
  const stCache = new Map();
  function vehStats(d, vi, list) {
    const key = d + "|" + vi + "|" + list.map(r => r.map(x => x.id).join(",")).join("/");
    if (stCache.has(key)) return stCache.get(key);
    const ctx = ctxOf[d], v = vehicles[vi]; evals++;
    let t = ctx.start, sh = 0; const o = { cost: 0, rit: 0, toko: 0, jam: 0, kg: 0, km: 0, s2: 0, jam1: 0, jam2: 0, km1: 0, km2: 0, toko1: 0, toko2: 0, kg1: 0, kg2: 0 };
    let res = o;
    for (const stops of list) {
      if (!stops.length) continue;
      sh++; if (sh > (+v.maksShift || 1)) { res = null; break; }
      const r = simFlex(ctx, depot, v, t, sh, orderStops(stops), false);
      if (!r.ok) { res = null; break; }
      o.cost += (W.rit + r.dur + W.km * r.km) * fuelF[vi]; o.rit++; o.toko += stops.length; o.jam += r.dur; o.kg += r.kgDel + r.kgPick; o.km += r.km; if (sh >= 2) o.s2++;
      { const se = Math.min(2, r.shiftEff || sh); o["jam" + se] += r.dur; o["km" + se] += r.km; o["toko" + se] += stops.length; o["kg" + se] += r.kgDel + r.kgPick; }
      t = r.end;
    }
    if (stCache.size > 200000) stCache.clear();
    stCache.set(key, res); return res;
  }
  // Fairness: pemerataan beban antar kendaraan (penalti = simpangan relatif kuadrat terhadap rata-rata)
  const FP = state.params.fairness || {};
  // Fairness (Gandi 2026-11-26): tugas dibagi merata ke tiap kendaraan dan antar shift 1/2, dari sisi waktu, jarak & jumlah tugas
  const fairOn = !!FP.aktif;
  const FW = { ringan: 600, sedang: 2000, kuat: 6000 }[FP.tingkat] || 2000;
  const fKeys = fairOn ? ["jam", "km", "toko"].filter(k => FP[k] !== false) : [];
  const capV = vehicles.map(v => +v.kapasitasKg || 1);
  const IDLE = 0;
  const shiftOn = fairOn && FP.antarShift !== false;
  // rata-rata per hari shift itu bisa jalan (shift 1 tidak dihitung di hari yang shift 1-nya habis untuk pembersihan)
  const nS1 = vehicles.map(v => Math.max(1, days.filter(d => vehOnDay(v, d) && !ctxOf[d].skip1).length));
  const nS2 = vehicles.map(v => Math.max(1, days.filter(d => vehOnDay(v, d)).length));
  function fairPen(T) { // T: array per kendaraan {rit,toko,jam,kg,km,s2}
    if (!fKeys.length) return 0;
    let pen = 0;
    for (const k of fKeys) {
      let idx = vehicles.map((v, i) => i);
      if (k === "s2") idx = idx.filter(i => (+vehicles[i].maksShift || 1) >= 2);
      if (idx.length < 2) continue;
      const rel = k === "kg" && FP.kgRelatif !== false;
      const xs = idx.map(i => (rel ? T[i].kg / capV[i] : T[i][k]) / (k === "s2" ? 1 : share[i] * (rel ? 1 : capShare[i])));
      const m = xs.reduce((a, b) => a + b, 0) / xs.length; if (m <= 1e-9) continue;
      pen += FW * xs.reduce((a, x) => a + ((x - m) / m) ** 2, 0) / xs.length;
    }
    // antar shift: shift 1 dan shift 2 tiap kendaraan 2 shift diratakan (jam, km, jumlah tugas)
    if (shiftOn) for (let i = 0; i < vehicles.length; i++) {
      if ((+vehicles[i].maksShift || 1) < 2) continue;
      for (const k of ["jam", "km", "toko", "kg"]) { if (k === "kg" ? FP.muatan === false : !fKeys.includes(k)) continue; const a = T[i][k + "1"] / nS1[i], b = T[i][k + "2"] / nS2[i], m = (a + b) / 2; if (m > 1e-9) pen += FW * (((a - m) / m) ** 2 + ((b - m) / m) ** 2) / 2; }
    }
    return pen;
  }
  function totals(sol) {
    const T = vehicles.map(() => ({ rit: 0, toko: 0, jam: 0, kg: 0, km: 0, s2: 0, jam1: 0, jam2: 0, km1: 0, km2: 0, toko1: 0, toko2: 0, kg1: 0, kg2: 0 }));
    days.forEach(d => sol[d].R.forEach((L, vi) => { const st = vehStats(d, vi, L); if (st) for (const k in T[vi]) T[vi][k] += st[k]; }));
    return T;
  }
  function toDaySol(d, trips, left) {
    const R = vehicles.map(() => []);
    trips.slice().sort((a, b) => a.vIdx - b.vIdx || a.shift - b.shift).forEach(t => R[t.vIdx].push(t.stops.map(x => x.store)));
    const vc = R.map((L, vi) => vehEval(d, vi, L, false).cost);
    return { R, left: left.slice(), vc };
  }
  const dayCost = S => S.vc.reduce((a, b) => a + b, 0) + S.left.reduce((a, st) => a + unsCost(st), 0);
  /* Keseimbangan zona: tiap hari dijaga dekat targetnya (berat & jumlah store sebanding kapasitas hari), toleransi ±10% */
  const dayTK = {}, dayTN = {};
  if (zoneMode) {
    const capSum = days.reduce((a, d) => a + cap[d], 0) || 1; let K = 0, N = 0;
    valid.forEach(s => { if (s.loading === "Menaikkan" || periodeOf(s) !== 1) return; const v = Math.max(1, Math.round(+s.frek || 1)); K += (+s.beratKg || 0) * v; N += v; });
    days.forEach(d => { dayTK[d] = K * cap[d] / capSum; dayTN[d] = N * cap[d] / capSum; });
  }
  const BAL = 3000, BAL_TOL = 0.10;
  const balDay = (d, S) => {
    if (!zoneMode || !dayTN[d]) return 0; let kg = 0, n = 0;
    S.R.forEach(L => L.forEach(r => r.forEach(x => { if (x.loading !== "Menaikkan") { kg += +x.beratKg || 0; n++; } })));
    // dibatasi agar tidak pernah lebih mahal daripada membiarkan store tidak terlayani
    return Math.min(W.unserved * 0.2, BAL * (Math.max(0, Math.abs(kg - dayTK[d]) / Math.max(1, dayTK[d]) - BAL_TOL) + Math.max(0, Math.abs(n - dayTN[d]) / Math.max(1, dayTN[d]) - BAL_TOL)));
  };
  const solCost = sol => days.reduce((a, d) => a + dayCost(sol[d]) + balDay(d, sol[d]), 0);

  /* 3) Pencarian lokal per hari: sisipkan yang belum terlayani, pindah & tukar store antar rit/kendaraan, rapikan urutan */
  function dayLS(d, S) {
    const R = S.R.map(L => L.map(r => r.slice())), vc = S.vc.slice(), left = S.left.slice();
    const slots = vi => { const L = R[vi].filter(r => r.length); return L.length < (+vehicles[vi].maksShift || 1) ? [...R[vi].map((r, i) => i).filter(i => R[vi][i].length), -1] : R[vi].map((r, i) => i).filter(i => R[vi][i].length); };
    const tryVeh = (vi, L) => { const r = vehEval(d, vi, L, false); return r ? r.cost : null; };
    const withRoute = (vi, ri, stops) => { const L = R[vi].map(r => r.slice()); if (ri === -1) L.push(stops); else L[ri] = stops; return L; };
    let improved = true, rounds = 0;
    while (improved && rounds++ < 25 && evals < EVAL_MAX) {
      improved = false;
      // (a) sisipkan store yang belum terlayani (prioritas tinggi dulu)
      left.sort((a, b) => prioOf(a) - prioOf(b));
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
        else if (prioOf(s) > 0) { // tidak muat: tukar dengan store berprioritas lebih rendah di hari ini (yang tergeser jadi belum terlayani)
          let ej = null;
          for (let vi = 0; vi < vehicles.length; vi++) for (let ri = 0; ri < R[vi].length; ri++) for (let i = 0; i < R[vi][ri].length; i++) {
            const u = R[vi][ri][i]; if (prioOf(u) >= prioOf(s)) continue;
            const base = R[vi][ri].filter((x, j) => j !== i);
            for (let p = 0; p <= base.length; p++) {
              const L = withRoute(vi, ri, base.slice(0, p).concat([s], base.slice(p)));
              const c = tryVeh(vi, L); if (c == null) continue;
              const delta = c - vc[vi] + unsCost(u) - unsCost(s);
              if (delta < -1 && (!ej || delta < ej.delta)) ej = { delta, vi, L, c, u };
            }
          }
          if (ej) { R[ej.vi] = ej.L.filter(r => r.length); vc[ej.vi] = ej.c; left.splice(k, 1, ej.u); improved = true; }
        }
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
          const delta = dayCost(So) - dayCost(sol[o]) + dayCost(Sd) - before + balDay(o, So) - balDay(o, sol[o]) + balDay(d, Sd) - balDay(d, sol[d]);
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
            const same = vb === va; // same: pindah antar shift di kendaraan yang sama
            if (same && (!shiftOn || (+vehicles[va].maksShift || 1) < 2)) continue;
            const RB = same ? LaC : S.R[vb];
            const stB0 = same ? stA : vehStats(d, vb, RB); if (!stB0) continue;
            const slotsB = RB.map((r, k) => k).filter(k => RB[k].length && !(same && RB[k] === La[ra]));
            if (RB.filter(r => r.length).length < (+vehicles[vb].maksShift || 1)) { slotsB.push(-1); if (same) slotsB.push(-2); }
            for (const rb of slotsB) {
              const base = rb < 0 ? [] : RB[rb];
              if (rb >= 0 && valid.length > 80 && !near(s, base)) continue;
              for (let p = 0; p <= base.length; p++) {
                const Lb = RB.map(r => r.slice()); const nr = base.slice(0, p).concat([s], base.slice(p)); if (rb === -1) Lb.push(nr); else if (rb === -2) Lb.unshift(nr); else Lb[rb] = nr;
                const stB = vehStats(d, vb, Lb); if (!stB) continue;
                const T2 = T.map(x => ({ ...x }));
                if (same) T2[va] = add(sub(T[va], stA0), stB); else { T2[va] = add(sub(T[va], stA0), stA); T2[vb] = add(sub(T[vb], stB0), stB); }
                const idleD = 0;
                const delta = same ? (stB.cost - stA0.cost) + fairPen(T2) - pen : (stA.cost - stA0.cost) + (stB.cost - stB0.cost) + fairPen(T2) - pen + idleD;
                if (delta < -1 && (!best || delta < best.delta)) best = { delta, vb, Lb, T2 };
              }
            }
          }
          if (best && best.vb === va) { S.R[va] = best.Lb.filter(r => r.length); S.vc[va] = vehStats(d, va, S.R[va]).cost; T = best.T2; pen = fairPen(T); moved++; any = true; i = 1e9; ra = 1e9; }
          else if (best) { S.R[va] = LaC; S.R[best.vb] = best.Lb; S.vc[va] = vehStats(d, va, LaC).cost; S.vc[best.vb] = vehStats(d, best.vb, best.Lb).cost; T = best.T2; pen = fairPen(T); moved++; any = true; i = 1e9; ra = 1e9; }
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
      // kunjungan yang di plan dasar belum terlayani tetap dicatat (store >1x seminggu bisa terlayani di satu hari dan tidak di hari lain)
      const left = (B.unserved || []).filter(u => u.day === d).map(u => byId.get(String(u.store.id))).filter(Boolean);
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
    extra.slice().sort((a, b) => prioOf(b) - prioOf(a) || (+b.beratKg || 0) - (+a.beratKg || 0) || okDays(a).length - okDays(b).length).forEach(s => {
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
  // metode zona = konstruksi utama; tiap variasi ke-3 memakai pembagian lama sebagai pembanding (dipakai hanya bila total biaya, termasuk keseimbangan zona, lebih baik — mis. data terlalu padat)
  const assignF = (rnd, k) => zoneMode && (k == null || k % 3 !== 2) ? zoneAssign(rnd) : assign(rnd);
  const initial = construct(assignF(null), null);
  function metric0(sol) {
    let rit = 0, km = 0, dur = 0, kg = 0, capu = 0, un = 0;
    days.forEach(d => { const S = sol[d]; un += S.left.length; S.R.forEach((L, vi) => { const r = vehEval(d, vi, L, true); if (!r) return; r.trips.forEach(t => { rit++; km += t.km; dur += t.dur; kg += Math.max(t.kgDel, t.kgPick) / (+vehicles[vi].kapasitasKg || 1); capu += 1; }); }); });
    return { rit, km, jam: dur / 60, isi: capu ? kg / capu : 0, unserved: un };
  }
  const mInit = metric0(initial);
  let best = null, bestCost = Infinity, starts = 0, rr = 0, rrOk = 0;
  const nStart = deep ? Math.max(8, Math.round(Math.max(12, Math.min(40 * EF, Math.round(2400 * EF / Math.max(10, valid.length)))) * sk)) : Math.max(3, Math.min(10, Math.round(600 / Math.max(10, valid.length))));
  const nRR = deep ? Math.max(10, Math.round(Math.max(20, Math.min(80 * EF, Math.round(3000 * EF / Math.max(10, valid.length)))) * sk)) : 0;
  const cloneSol = sol => { const o = {}; days.forEach(d => o[d] = { R: sol[d].R.map(L => L.map(r => r.slice())), left: sol[d].left.slice(), vc: sol[d].vc.slice() }); return o; };
  for (let k = 0; k < nStart; k++) {
    const rnd = k === 0 ? null : mulberry32(1000 + k * 7919);
    const sol = k === 0 ? initial : construct(assignF(rnd, k), rnd);
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
    const rnd = mulberry32(424242); EVAL_MAX = evals + Math.round(1200000 * sk * EF); // anggaran kerja sendiri untuk tahap ini
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
  const pairMoved = pairPass(best);
  const pickMoved = 0;
  return finish(best, mInit, { starts, rr, rrOk, cost: pairMoved || pickMoved ? solCost(best) : bestCost, mNoFair, TnoFair, pairMoved });

  /* 7) Penjemputan ("Menaikkan barang", mis. PRODUKSI; selalu di akhir rit): bila total jarak hari itu sama saja
        (selisih ≤ 1 km), ikutkan ke rit yang store-nya paling dekat dengan titik jemput walau fairness memilih lain.
        Rit tidak bertambah dan semua aturan (kapasitas, jam, akses, hari aktif) tetap dicek. */
  function pickNear(sol) {
    let moved = 0; const TIE_KM = 1;
    const info = (d, vi, L) => { const LL = L.filter(r => r.length); if (!LL.length) return { km: 0, cost: 0, L: LL }; const r = vehEval(d, vi, LL, true); if (!r) return null; return { km: r.trips.reduce((a, t) => a + t.km, 0), cost: r.cost, L: LL }; };
    const near = (s, r) => { let m = Infinity; r.forEach(x => { if (x.id !== s.id && x.loading !== "Menaikkan") m = Math.min(m, hav([s.lat, s.lng], [x.lat, x.lng])); }); return m; };
    for (const d of days) {
      const picks = []; sol[d].R.forEach((L, vi) => L.forEach((r, ri) => r.forEach(x => { if (x.loading === "Menaikkan") picks.push([x, vi, ri]); })));
      for (const [s, vi, ri0] of picks) {
        const S = sol[d], r0 = S.R[vi][ri0]; if (!r0 || !r0.some(x => x.id === s.id)) continue;
        const n0 = near(s, r0), cvi = info(d, vi, S.R[vi]); if (!cvi) continue;
        const from = info(d, vi, S.R[vi].map(r => r.filter(x => x.id !== s.id))); if (!from) continue;
        let best = null;
        for (let vj = 0; vj < vehicles.length; vj++) {
          if (vj === vi || !vehOnDay(vehicles[vj], d) || !aksesOk(s, normJenis(vehicles[vj].jenis))) continue;
          S.R[vj].forEach((r, ri) => {
            if (!r.length || r.some(x => x.loading === "Menaikkan")) return;
            const n = near(s, r); if (!(n < n0 - 0.2) || (best && n >= best.n)) return;
            const cvj = info(d, vj, S.R[vj]); if (!cvj) return;
            const L = S.R[vj].map(q => q.slice()); L[ri] = L[ri].concat([s]);
            const to = info(d, vj, L); if (!to) return;
            if (from.km + to.km - cvi.km - cvj.km <= TIE_KM) best = { n, vj, L: to.L, cj: to.cost };
          });
        }
        if (best) { S.R[vi] = from.L; S.vc[vi] = from.cost; S.R[best.vj] = best.L; S.vc[best.vj] = best.cj; moved++; }
      }
    }
    return moved;
  }

  /* 6) Store yang berdekatan (≤ 1,5 km) diusahakan dikirim di hari yang sama dan dengan mobil/rit yang sama:
        pindah satu store ke hari/rit pasangannya, bila perlu ditukar dengan store lain, selama total biaya
        (termasuk fairness) tidak memburuk. */
  function pairPass(sol) {
    const PAIR_KM = 1.5, AFF = 40, AFF_RIT = 100;
    const P2 = [];
    for (let i = 0; i < valid.length; i++) for (let j = i + 1; j < valid.length; j++) {
      const a = valid[i], b = valid[j];
      if (hav([a.lat, a.lng], [b.lat, b.lng]) <= PAIR_KM && okDays(a).some(d => okDays(b).includes(d))) P2.push([a, b]);
    }
    if (!P2.length) return 0;
    EVAL_MAX = evals + Math.round(400000 * sk * EF);
    const daysOf = (S, id) => days.filter(d => S[d].R.some(L => L.some(r => r.some(x => x.id === id))));
    const obj = S => {
      let c = solCost(S);
      if (fairOn) { c += fairPen(totals(S)); days.forEach(d => vehicles.forEach((v, vi) => { if (vehOnDay(v, d) && !S[d].R[vi].some(r => r.length)) c += IDLE; })); }
      P2.forEach(([a, b]) => { const A = daysOf(S, a.id), B = daysOf(S, b.id); if (A.some(x => B.includes(x))) c -= AFF; });
      days.forEach(d => S[d].R.forEach(L => L.forEach(r => { const ids = new Set(r.map(x => x.id)); P2.forEach(([a, b]) => { if (ids.has(a.id) && ids.has(b.id)) c -= AFF_RIT; }); })));
      return c;
    };
    const ritOf = (S, d, id) => { for (let vi = 0; vi < S[d].R.length; vi++) for (let ri = 0; ri < S[d].R[vi].length; ri++) if (S[d].R[vi][ri].some(x => x.id === id)) return [vi, ri]; return null; };
    const without = (S, d, st) => { const R = S[d].R.map(L => L.map(r => r.filter(x => x.id !== st.id)).filter(r => r.length)); const vc = R.map((L, vi) => { const r = vehEval(d, vi, L, false); return r ? r.cost : Infinity; }); return dayLS(d, { R, left: S[d].left.slice(), vc }); };
    const withS = (S, d, st) => dayLS(d, { R: S[d].R, left: S[d].left.concat([st]), vc: S[d].vc });
    let cur = obj(sol), moved = 0;
    const s1 = () => { for (const [a, b] of P2) {
      if (evals > EVAL_MAX) break;
      const A = daysOf(sol, a.id), B = daysOf(sol, b.id);
      if (!A.length || !B.length || A.some(x => B.includes(x))) continue;
      let best = null;
      for (const [st, mate] of [[a, b], [b, a]]) {
        if (fixedIds.has(st.id)) continue;
        const ds = daysOf(sol, st.id); if (ds.length !== 1) continue; const d = ds[0];
        for (const o of daysOf(sol, mate.id).filter(x => okDays(st).includes(x))) {
          const Sd = without(sol, d, st), So = withS(sol, o, st);
          if (So.left.some(x => x.id === st.id)) continue;
          const tryC = (Dd, Do) => { const C = Object.assign({}, sol); C[d] = Dd; C[o] = Do; return { C, c: obj(C) }; };
          const r0 = tryC(Sd, So); if (r0.c < cur - 1 && (!best || r0.c < best.c)) best = r0;
          // tukar: satu store lain dari hari o pindah ke hari d (menjaga beban & fairness harian)
          const others = []; So.R.forEach(L => L.forEach(r => r.forEach(u => { if (u.id !== st.id && u.id !== mate.id && !fixedIds.has(u.id) && okDays(u).includes(d) && daysOf(sol, u.id).length === 1) others.push(u); })));
          for (const u of others) {
            if (evals > EVAL_MAX) break;
            const Do = without({ [o]: So }, o, u), Dd = withS({ [d]: Sd }, d, u);
            if (Dd.left.some(x => x.id === u.id)) continue;
            const r1 = tryC(Dd, Do); if (r1.c < cur - 1 && (!best || r1.c < best.c)) best = r1;
          }
        }
      }
      if (best) { days.forEach(d => sol[d] = best.C[d]); cur = best.c; moved++; }
    } };
    // tahap 2: pasangan yang sudah sehari tapi beda mobil/rit -> satukan ke rit yang sama
    const s2 = () => { for (const [a, b] of P2) {
      if (evals > EVAL_MAX) break;
      let best = null;
      for (const d of daysOf(sol, a.id).filter(x => daysOf(sol, b.id).includes(x))) {
        const pa = ritOf(sol, d, a.id), pb = ritOf(sol, d, b.id); if (!pa || !pb || (pa[0] === pb[0] && pa[1] === pb[1])) continue;
        for (const [st, ps, pm] of [[a, pa, pb], [b, pb, pa]]) {
          const R0 = sol[d].R, from = R0[ps[0]][ps[1]], to = R0[pm[0]][pm[1]];
          const evalDay = R => { const vc = R.map((L, vi) => { const r = vehEval(d, vi, L.filter(x => x.length), false); return r ? r.cost : null; }); if (vc.some(x => x == null)) return null; const C = Object.assign({}, sol); C[d] = { R: R.map(L => L.filter(x => x.length)), left: sol[d].left, vc }; return { C, c: obj(C) }; };
          const variants = [null]; to.forEach(u => { if (u.id !== st.id && P2.every(([x, y]) => !((x.id === u.id && y.id !== st.id && to.some(z => z.id === y.id)) || (y.id === u.id && to.some(z => z.id === x.id))))) variants.push(u); });
          for (const u of variants) {
            const fromN = from.filter(x => x.id !== st.id), toB = to.filter(x => !u || x.id !== u.id);
            for (let p = 0; p <= toB.length; p++) {
              const toN = toB.slice(0, p).concat([st], toB.slice(p));
              const fromOpts = u ? Array.from({ length: fromN.length + 1 }, (_, q) => fromN.slice(0, q).concat([u], fromN.slice(q))) : [fromN];
              for (const fN of fromOpts) {
                const R = R0.map(L => L.map(r => r.slice()));
                R[ps[0]][ps[1]] = fN; R[pm[0]][pm[1]] = toN;
                const r = evalDay(R); if (r && r.c < cur - 1 && (!best || r.c < best.c)) best = r;
              }
            }
          }
        }
      }
      if (best) { days.forEach(d => sol[d] = best.C[d]); cur = best.c; moved++; }
    } };
    s2(); s1(); s2();
    if (moved) days.forEach(d => sol[d] = dayLSfair(d, sol[d])); // rapikan urutan dalam rit tanpa memindah store antar mobil
    return moved;
  }
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
      const vOn = vehicles.filter(v => vehOnDay(v, d));
      const tries = vOn.map(v => simFlex(ctx, depot, v, ctx.start, 1, [s], false));
      if (!vOn.length) reason = "Tidak ada kendaraan yang aktif distribusi hari " + HARI[d];
      else if (!tries.some(r => r.ok)) reason = [...new Set(tries.map(r => r.why).filter(Boolean))].join("; ") || reason;
    }
    const k = s.kunci;
    if (k && (k.kendaraan || k.shift)) { // store dikunci dari Peta Rute: jelaskan kenapa kuncinya tidak bisa dipenuhi
      const lv = k.kendaraan ? vehicles.find(v => v.id === k.kendaraan) : null;
      let why = "";
      if (k.kendaraan && !lv) why = "kendaraan itu tidak aktif / kapasitas kosong";
      else if (lv && k.shift && +k.shift > (+lv.maksShift || 1)) why = vehLabelE(lv) + " hanya " + (+lv.maksShift || 1) + " shift";
      else { const vv = lv ? [lv] : vehicles.filter(v => vehOnDay(v, d)); const tr = vv.map(v => { const t0 = { ...s, kunci: null }; return simFlex(ctx, depot, v, ctx.start, Math.max(1, (+k.shift || 1) - (ctx.skip1 ? 1 : 0)), [t0], false); });
        why = tr.some(r => r.ok) ? "rit kendaraan/shift itu sudah penuh (waktu atau kapasitas)" : [...new Set(tr.map(r => r.why).filter(Boolean))].join("; "); }
      reason = "Kunci " + [lv ? vehLabelE(lv) : k.kendaraanNama, k.shift ? "shift " + k.shift : ""].filter(Boolean).join(" · ") + " tidak bisa dipenuhi: " + (why || reason);
    }
    unserved.push({ day: d, store: s, reason });
  }));
  const trips = [];
  days.forEach(d => res[d].trips.forEach(t => trips.push(t)));
  trips.sort((a, b) => a.day - b.day || a.vIdx - b.vIdx || a.shift - b.shift);
  return { depot, vehicles, days, trips, unserved, warn, opt, ctxBreaks: Object.fromEntries(days.map(d => [d, makeCtx(state, d).breaks])), H: ctx0.H };
  }
}

if (typeof module !== "undefined") module.exports = { kunciHari, zonePreview, gatePt, prioOf, vehOnDay, aksesOk, normJenis, buildPlan, planGen, buildWeeks, weeksGen, baseState, weekMeta, weekState, periodeOf, roadCfgKey, ptKey, normJalan, roadTable, parseKoordinat, fmtJam, toMin, HARI, simulate, makeCtx };
