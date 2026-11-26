// Jarak jalan sebenarnya: mock Valhalla sources_to_targets
const { chromium } = require('playwright');
function hav(a,b){const R=6371,r=Math.PI/180,dLa=(b[0]-a[0])*r,dLo=(b[1]-a[1])*r;const x=Math.sin(dLa/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const errs = []; let calls = 0, mode = 'ok', lastBody = null;
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '{}' }));
  await ctx.route('https://valhalla1.openstreetmap.de/sources_to_targets**', async r => {
    calls++; const body = JSON.parse(r.request().postData()); lastBody = body;
    if (mode === 'fail') return r.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, body: '{"error":"Too Many Requests"}' });
    await new Promise(z => setTimeout(z, 300));
    const rows = body.sources.map((s, i) => body.targets.map((t, j) => ({ from_index: i, to_index: j, distance: mode === 'partial' && (i + j) % 7 === 0 ? null : +(hav([s.lat, s.lon], [t.lat, t.lon]) * 1.4).toFixed(3), time: 1 })));
    r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ sources_to_targets: rows }) });
  });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const idle = async () => { await p.waitForTimeout(400); await p.waitForFunction(() => !roadJob.run, null, { timeout: 30000 }); await p.waitForTimeout(200); };
  const info = () => p.evaluate(() => ({ rit: plan.trips.length, km: Math.round(plan.trips.reduce((a, t) => a + t.km, 0) * 10) / 10, jarak: plan.jarak, pairs: state.jarakJalan ? Object.keys(state.jarakJalan.d).length : 0, unsaved }));
  await p.goto('file://' + __dirname + '/local.html#plan'); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForTimeout(700); console.log('1 progres:', (await p.textContent('#roadNote')).trim().slice(0, 80));
  await idle(); console.log('2 selesai:', JSON.stringify(await info()), 'calls', calls, 'tol?', JSON.stringify(lastBody.costing_options));
  console.log('  catatan:', (await p.textContent('#roadNote')).trim());
  // reload: dari cache, tanpa request baru
  const c0 = calls; await p.reload(); await p.waitForTimeout(1500); await idle(); console.log('3 reload cache:', JSON.stringify(await info()), 'calls baru', calls - c0);
  // tambah store baru -> hanya pasangan baru
  await p.evaluate(() => { state.stores.push({ id: 'sx', nama: 'Baru', lat: -5.15, lng: 119.43, beratKg: 100, frek: 1, antaran: 'Tujuan', aktif: true, hariOperasi: [0,1,2,3,4,5,6], buka: '08:00', tutup: '20:00' }); save(); runPlan(true); renderTab(); });
  await idle(); console.log('4 store baru:', JSON.stringify(await info()), 'calls', calls, 'sumber di req terakhir', lastBody.sources.length, 'x', lastBody.targets.length);
  // ganti aturan blok tol -> matriks dihitung ulang
  await p.evaluate(() => { state.params.jalanBlok.semuaTol = false; save(); runPlan(true); renderTab(); }); await idle();
  console.log('5 blok tol off:', JSON.stringify(await info()), 'tol opt', JSON.stringify(lastBody.costing_options));
  // gagal server
  mode = 'fail'; await p.evaluate(() => { state.params.jalanBlok.semuaTol = true; localStorage.removeItem(JARAK_LS); state.jarakJalan = undefined; runPlan(true); renderTab(); }); await idle();
  const cf = calls; console.log('6 server gagal:', JSON.stringify(await info()), '|', (await p.textContent('#roadNote')).trim().slice(0, 140));
  await p.evaluate(() => { runPlan(true); renderTab(); }); await p.waitForTimeout(800); await idle(); console.log('  tidak mengulang otomatis:', calls === cf);
  mode = 'partial'; await p.click('#btnJarak'); await idle(); console.log('7 tombol + sebagian null:', JSON.stringify(await info()), '|', (await p.textContent('#roadNote')).trim().slice(0, 100));
  const c7 = calls; await p.evaluate(() => { runPlan(true); renderTab(); }); await p.waitForTimeout(800); await idle(); console.log('  tidak loop:', calls === c7);
  // data korup
  await p.evaluate(() => { const s = clone(state); s.jarakJalan = { cfg: 1, k: 'x', d: 5 }; console.log(JSON.stringify(normalize(s).jarakJalan)); const s2 = clone(state); s2.jarakJalan.d['0:1'] = '<img>'; s2.jarakJalan.d['x'] = 3; const n = normalize(s2).jarakJalan; window.__ok = !('x' in n.d) && !('0:1' in n.d && typeof n.d['0:1'] !== 'number'); });
  console.log('8 sanitasi:', await p.evaluate(() => window.__ok));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
