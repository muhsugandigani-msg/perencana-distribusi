const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/local.html'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(500);
  await p.click('[data-tab="kendaraan"]'); await p.selectOption('[data-k="vehicles.1.bbm"]', 'Bensin');
  await p.click('[data-tab="parameter"]'); await p.waitForTimeout(200);
  await p.check('[data-k="params.fairness.aktif"]'); await p.waitForTimeout(300);
  await p.screenshot({ path: __dirname + '/../fair_param.png' });
  await p.click('#btnPlan'); await p.waitForTimeout(4000);
  const r = await p.evaluate(() => ({ fair: !!plan.opt.fair, solar: plan.opt.solar, card: !!document.querySelector('#p-plan') && /Fairness antar kendaraan/.test(document.querySelector('#p-plan').textContent) }));
  console.log(JSON.stringify(r));
  const el = await p.$('text=Fairness antar kendaraan'); if (el) await el.scrollIntoViewIfNeeded();
  await p.screenshot({ path: __dirname + '/../fair_plan.png' });
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
