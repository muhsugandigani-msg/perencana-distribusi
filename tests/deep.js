// Optimasi mendalam: progres, hasil diganti, hentikan, edit membatalkan, toggle off
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://**', r => r.abort());
  await p.goto('file://' + __dirname + '/local.html#plan'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(800); console.log('0 tanpa plan otomatis:', await p.evaluate(() => plan === null && !deepJob.run)); await p.click('#btnPlan'); await p.waitForTimeout(700);
  const quick = await p.evaluate(() => ({ rit: plan.trips.length, deep: plan.opt.mendalam }));
  console.log('1 plan cepat:', JSON.stringify(quick), '| banner:', (await p.textContent('#deepNote')).trim().slice(0, 60), '| tombol:', await p.textContent('#btnPlan'));
  // UI tetap responsif: pindah tab saat berjalan
  const t0 = Date.now(); await p.click('[data-tab="gantt"]'); await p.click('[data-tab="plan"]'); console.log('  klik tab saat optimasi', Date.now() - t0, 'ms');
  await p.waitForFunction(() => !deepJob.run, null, { timeout: 90000 });
  const deep = await p.evaluate(() => ({ rit: plan.trips.length, km: Math.round(plan.trips.reduce((a, t) => a + t.km, 0)), deep: plan.opt.mendalam, biasa: plan.opt.biasa && plan.opt.biasa.rit, card: document.querySelector('#p-plan').textContent.includes('Dibanding plan cepat') }));
  console.log('2 selesai:', JSON.stringify(deep), '| toast:', await p.textContent('#toast'), '| tombol:', await p.textContent('#btnPlan'));
  // hentikan
  await p.click('#btnPlan'); await p.waitForTimeout(600); await p.click('#btnStopDeep'); await p.waitForTimeout(300);
  console.log('3 hentikan:', await p.evaluate(() => [deepJob.run, plan.opt.mendalam]), await p.textContent('#btnPlan'));
  // edit membatalkan
  await p.click('#btnPlan'); await p.waitForTimeout(600); await p.evaluate(() => { state.stores[1].beratKg += 1; save(); }); await p.waitForTimeout(300);
  console.log('4 edit membatalkan:', await p.evaluate(() => deepJob.run));
  // toggle off
  await p.click('[data-tab="parameter"]'); await p.uncheck('[data-k="params.optimasiMendalam"]'); await p.click('#btnPlan'); await p.waitForTimeout(500);
  console.log('5 mode off:', await p.evaluate(() => [deepJob.run, state.params.optimasiMendalam]));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
