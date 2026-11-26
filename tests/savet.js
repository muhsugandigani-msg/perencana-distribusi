const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const url = 'file://' + __dirname + '/local.html';
  await p.goto(url); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  const st = async () => p.textContent('#saveState');
  console.log('• awal:', await st());
  await p.click('[data-tab="kendaraan"]'); await p.fill('[data-k="vehicles.0.plat"]', 'DD 9999 XX'); await p.waitForTimeout(100);
  console.log('• setelah ubah:', await st(), '| tombol merah:', await p.$eval('#btnSave', e => e.classList.contains('primary')));
  // reload tanpa simpan -> perubahan hilang
  p.once('dialog', d => d.accept());
  await p.reload(); await p.waitForTimeout(400);
  console.log('• reload tanpa simpan, plat:', await p.evaluate(() => state.vehicles[0].plat));
  await p.click('[data-tab="kendaraan"]'); await p.fill('[data-k="vehicles.0.plat"]', 'DD 1234 AB'); await p.waitForTimeout(100);
  await p.click('#btnSave'); await p.waitForTimeout(200);
  console.log('• setelah simpan:', await st());
  await p.close(); const p2 = await ctx.newPage(); p2.on('pageerror', e => errs.push(e.message)); await p2.goto(url); await p2.waitForTimeout(400);
  console.log('• buka lagi, plat:', await p2.evaluate(() => state.vehicles[0].plat), '|', await p2.textContent('#saveState'));
  await p2.click('[data-tab="parameter"]'); await p2.check('[data-k="params.fairness.aktif"]'); await p2.keyboard.press('Control+s'); await p2.waitForTimeout(200);
  await p2.reload(); await p2.waitForTimeout(400);
  console.log('• Ctrl+S fairness tersimpan:', await p2.evaluate(() => state.params.fairness.aktif));
  await p2.screenshot({ path: __dirname + '/../save.png', clip: { x: 0, y: 0, width: 1440, height: 110 } });
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
