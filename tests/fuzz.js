// Uji acak invarian mesin plan
const E = require('./engine.js'); const base = require('/home/user/perencana-distribusi/data/plan-data.json');
const N = +process.argv[2] || 30; let bad = 0;
function rnd(seed) { let a = seed; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const K0 = +process.argv[3] || 0; for (let k = K0; k < K0 + N; k++) {
  const R = rnd(k * 97 + 1), pick = a => a[Math.floor(R() * a.length)];
  const st = JSON.parse(JSON.stringify(base.state || base)); delete st.savedPlan;
  if (R() < 0.5) delete st.jarakJalan;
  st.vehicles.forEach(v => { v.aktif = R() < 0.85; if (R() < 0.3) v.hariAktif = [0,1,2,3,4,5,6].filter(() => R() < 0.7); if (R() < 0.2) v.maksRadiusKm = pick([8, 12, 20]); if (R() < 0.15) v.maksKmRit = pick([40, 80]); if (R() < 0.2) v.maksShift = 2; });
  if (!st.vehicles.some(v => v.aktif)) st.vehicles[0].aktif = true;
  const J = [...new Set(st.vehicles.map(v => v.jenis))];
  st.stores.forEach(s => { if (s.antaran === 'Origin') return; if (R() < 0.15) s.frek = pick([0.5, 0.33333, 0.25, 0.2]); if (R() < 0.1) s.akses = [pick(J)]; if (R() < 0.1) s.hariOperasi = [0,1,2,3,4,5,6].filter(() => R() < 0.6); if (R() < 0.05) s.aktif = false; });
  st.params.fairness.aktif = R() < 0.6;
  let W; try { W = E.buildWeeks(st, { mendalam: process.argv[4] === 'deep' }); } catch (e) { console.log(k, 'EXCEPTION', e.stack.split('\n').slice(0, 3).join(' ')); bad++; continue; }
  const issues = [];
  const per = new Map(st.stores.map(s => [s.id, s]));
  const meta = W.meta;
  W.forEach((P, w) => {
    if (P.error) { issues.push('error ' + P.error); return; }
    const visits = {};
    P.trips.forEach(t => {
      const v = t.veh;
      if (Array.isArray(v.hariAktif) && !v.hariAktif.includes(t.day)) issues.push('hariAktif ' + v.jenis + ' d' + t.day);
      if (v.aktif === false) issues.push('nonaktif dipakai');
      if (t.kgDel > +v.kapasitasKg + 1e-6) issues.push('kapasitas');
      if (+v.maksKmRit > 0 && t.km > v.maksKmRit + 1e-6) issues.push('maksKm');
      if (t.shift > (+v.maksShift || 1)) issues.push('shift');
      t.stops.forEach(x => { const s = per.get(x.store.id); visits[s.id] = (visits[s.id] || 0) + 1;
        if (!E.aksesOk(s, E.normJenis(v.jenis))) issues.push('akses ' + s.nama + ' ' + v.jenis);
        if (Array.isArray(s.hariOperasi) && !s.hariOperasi.includes(t.day)) issues.push('hariOperasi ' + s.nama);
      });
    });
    // frekuensi: tiap store terkunjungi sesuai frek (kecuali tercatat belum terlayani / dilewati)
    const un = {}; P.unserved.forEach(u => un[u.store.id] = (un[u.store.id] || 0) + 1);
    st.stores.forEach(s => {
      if (s.aktif === false || s.antaran === 'Origin') return;
      const p = E.periodeOf(s); let need = p === 1 ? Math.round(+s.frek || 0) : (meta.off[s.id] === w % p ? 1 : 0);
      const days = st.params.hari.map((b, i) => b ? i : -1).filter(i => i >= 0).filter(d => (s.hariOperasi || [0,1,2,3,4,5,6]).includes(d));
      need = Math.min(need, days.length);
      const got = (visits[s.id] || 0) + (un[s.id] || 0);
      const skipped = P.warn.some(x => x.includes('"' + s.nama + '" dilewati'));
      if (!skipped && got !== need) issues.push('frek ' + s.nama + ' butuh ' + need + ' dapat ' + (visits[s.id] || 0) + '+' + (un[s.id] || 0) + 'un');
    });
  });
  // rute tetap: store mingguan sama di semua minggu
  if (W.length > 1 && W.every(P => !P.error)) {
    const sig = W.map(P => { const o = {}; P.trips.forEach(t => { const reg = t.stops.filter(x => E.periodeOf(per.get(x.store.id)) === 1).map(x => x.store.id); reg.forEach(id => (o[id] = o[id] || []).push(t.day + '|' + t.vIdx + '|' + t.shift + '|' + reg.join('>'))); }); P.unserved.forEach(u => { if (E.periodeOf(per.get(u.store.id)) === 1) (o[u.store.id] = o[u.store.id] || []).push('UN' + u.day); }); return o; });
    Object.keys(sig[0]).forEach(id => { const a = sig[0][id].sort().join(';'); for (let w = 1; w < sig.length; w++) if ((sig[w][id] || []).sort().join(';') !== a) { issues.push('rute berubah ' + per.get(id).nama + ' minggu ' + (w + 1)); break; } });
  }
  const T = W.reduce((a, P) => a + (P.trips ? P.trips.length : 0), 0), U = W.reduce((a, P) => a + (P.unserved ? P.unserved.length : 0), 0);
  if (issues.length) bad++;
  console.log(k, 'minggu', W.length, 'rit', T, 'un', U, issues.length ? 'ISSUES: ' + [...new Set(issues)].slice(0, 6).join(' | ') : 'ok');
}
console.log('BAD', bad, '/', N);
