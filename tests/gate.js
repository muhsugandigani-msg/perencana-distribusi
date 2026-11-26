// UI kolom titik keluar/masuk gudang
const { chromium } = require('playwright'); const fs = require('fs');
const DATA = JSON.parse(fs.readFileSync('/home/user/perencana-distribusi/data/plan-data.json', 'utf8'));
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/api\.github\.com|valhalla|tile|nominatim/, r => r.abort());
  await p.goto('file://' + __dirname + '/local.html');
  await p.evaluate(d => { localStorage.clear(); localStorage.setItem(LS_KEY, JSON.stringify(d.state || d)); }, DATA); await p.reload(); await p.waitForTimeout(800);
  await p.click('[data-tab="parameter"]'); await p.waitForTimeout(300);
  const inp = p.locator('input[data-k="params.titikGudang"]'); console.log('• kolom ada:', await inp.count());
  await inp.fill('https://www.google.com/maps?q=-5.0950,119.4850'); await inp.blur(); await p.waitForTimeout(300);
  console.log('• hint:', (await p.locator('input[data-k="params.titikGudang"] + p').textContent()).match(/Terbaca[^<]*/)?.[0]);
  console.log('• tersimpan:', await p.evaluate(() => state.params.titikGudang), '| titik jarak termasuk gerbang:', await p.evaluate(() => jarakPts().includes(ptKey(-5.095, 119.485))));
  await p.waitForTimeout(1500); console.log('• di LS:', await p.evaluate(() => JSON.parse(localStorage.getItem(LS_KEY)).params.titikGudang)); await p.reload(); await p.waitForTimeout(600);
  console.log('• setelah muat ulang:', await p.evaluate(() => state.params.titikGudang));
  const inp2 = p.locator('input[data-k="params.titikGudang"]'); await p.click('[data-tab="parameter"]'); await inp2.fill('https://maps.app.goo.gl/abc'); await inp2.blur(); await p.waitForTimeout(300);
  console.log('• link pendek:', /Link pendek/.test(await p.locator('input[data-k="params.titikGudang"] + p').textContent()));
  await inp2.fill(''); await inp2.blur();
  await p.click('[data-tab="plan"]'); await p.click('#btnPlan'); await p.waitForTimeout(2500);
  console.log('ERRORS:', errs.length ? errs.join(' | ') : 'none'); await b.close();
})();
