// Plan terakhir yang disimpan tampil saat web dibuka (lokal & data bersama), tanpa hitung ulang
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  let remote = null; const H = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  await ctx.route('https://api.github.com/**', r => r.fulfill(remote ? { status: 200, headers: H, body: JSON.stringify({ sha: 'x', content: Buffer.from(remote).toString('base64') }) } : { status: 404, headers: H, body: '{}' }));
  await ctx.route('https://valhalla1.openstreetmap.de/**', r => r.abort());
  await p.goto('file://' + __dirname + '/local.html#plan'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(500);
  console.log('1 tanpa simpanan:', await p.evaluate(() => plan === null));
  // siklus 2 minggu agar uji multi-minggu
  await p.evaluate(() => { state.stores.find(s => s.nama.includes('Panakkukang')).frek = 0.5; save(); });
  await p.click('#btnPlan'); await p.waitForFunction(() => !deepJob.run, null, { timeout: 120000 });
  await p.click('.weekbar [data-week="1"]'); await p.waitForTimeout(200);
  const before = await p.evaluate(() => ({ unsaved, W: planWeeks.map(P => P.trips.length + '/' + Math.round(P.trips.reduce((a, t) => a + t.km, 0))), sel: weekSel, deep: plan.opt.mendalam }));
  console.log('2 setelah buat plan:', JSON.stringify(before));
  await p.click('#btnSave'); await p.waitForTimeout(300);
  const size = await p.evaluate(() => localStorage.getItem(LS_KEY).length);
  // buka ulang
  await p.reload(); await p.waitForTimeout(800);
  const after = await p.evaluate(() => ({ unsaved, W: planWeeks && planWeeks.map(P => P.trips.length + '/' + Math.round(P.trips.reduce((a, t) => a + t.km, 0))), sel: weekSel, deep: plan && plan.opt.mendalam, running: deepJob.run, dirty: planDirty, vehSame: plan.trips[0].veh === state.vehicles.find(v => v.id === plan.trips[0].veh.id), note: document.querySelector('#p-plan').textContent.includes('plan terakhir yang disimpan') }));
  console.log('3 buka ulang:', JSON.stringify(after), 'ukuran data', Math.round(size / 1024) + ' KB');
  for (const t of ['gantt', 'peta', 'store']) { await p.click('[data-tab="' + t + '"]'); await p.waitForTimeout(400); }
  console.log('  gantt bar', await p.$$eval('#p-gantt [data-tip]', e => e.length), '| jadwal store', await p.evaluate(() => document.querySelector('#p-store').textContent.includes('M2:') || document.querySelector('#p-store').textContent.includes('Tiap minggu')));
  // ubah input -> banner data berubah
  await p.evaluate(() => { state.stores[2].beratKg += 5; save(); }); await p.click('[data-tab="plan"]'); await p.waitForTimeout(200);
  console.log('4 input berubah -> banner:', await p.evaluate(() => !document.getElementById('dirtyBanner').hidden));
  // data bersama: orang lain membuka
  remote = await p.evaluate(() => localStorage.getItem(LS_KEY));
  const q = await ctx.newPage(); q.on('pageerror', e => errs.push('Q ' + e.message));
  await q.goto('file://' + __dirname + '/local.html#plan'); await q.evaluate(() => localStorage.clear()); await q.reload(); await q.waitForTimeout(1200);
  console.log('5 pengunjung lain (GitHub):', JSON.stringify(await q.evaluate(() => ({ W: planWeeks && planWeeks.map(P => P.trips.length), running: deepJob.run, src: document.getElementById('saveState').textContent }))));
  // data plan rusak
  await q.evaluate(() => { const s = JSON.parse(localStorage.getItem(LS_KEY)); s.savedPlan.weeks[0].trips = 'x'; s._savedAt = Date.now() * 2; localStorage.setItem(LS_KEY, JSON.stringify(s)); });
  remote = null; await q.reload(); await q.waitForTimeout(800); console.log('6 plan rusak -> aman:', await q.evaluate(() => plan === null));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
