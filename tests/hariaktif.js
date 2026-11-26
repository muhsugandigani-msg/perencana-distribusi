// Hari aktif distribusi per kendaraan: dropdown, plan, export
const { chromium } = require('playwright'); const XLSX = require('../deps/xlsx');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 800 }, acceptDownloads: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.route(/api\.github\.com/, r => r.abort());
  await p.goto('file://' + __dirname + '/local.html'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem(LS_KEY, JSON.stringify(SAMPLE)); }); await p.reload(); await p.waitForTimeout(500);
  console.log('• data lama tanpa hariAktif:', await p.evaluate(() => state.vehicles.some(v => 'hariAktif' in v)));
  await p.click('[data-tab="kendaraan"]'); await p.waitForTimeout(300);
  const sum = p.locator('[data-hakt="1|*"]').locator('xpath=ancestor::details/summary');
  console.log('• label awal:', await sum.textContent()); await sum.click(); await p.waitForTimeout(100);
  await p.click('[data-hakt="1|2"]'); await p.click('[data-hakt="1|4"]');
  console.log('• setelah hapus Rab & Jum:', await p.evaluate(() => JSON.stringify(state.vehicles[1].hariAktif)), '|', await p.locator('[data-hakt="1|*"]').locator('xpath=ancestor::details/summary').textContent());
  await p.screenshot({ path: __dirname + '/../hariaktif.png' });
  await p.click('#btnPlan'); await p.waitForTimeout(4000);
  const used = await p.evaluate(() => [...new Set(planWeeks.flatMap(P => P.trips.filter(t => t.veh === state.vehicles[1] || t.veh.id === state.vehicles[1].id).map(t => t.day)))].sort());
  console.log('• hari dipakai kendaraan 2:', JSON.stringify(used), used.includes(2) || used.includes(4) ? 'GAGAL' : 'OK');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => exportExcel())]); const f = __dirname + '/dl/ha.xlsx'; await dl.saveAs(f);
  const wb = XLSX.readFile(f); const sh = wb.SheetNames.find(n => n === 'Kendaraan'); const rows = XLSX.utils.sheet_to_json(wb.Sheets[sh], { header: 1 });
  const hi = rows[0].indexOf('Hari aktif distribusi'); console.log('• export:', rows.slice(1).map(r => r[hi]).join(' | '));
  await p.click('[data-tab="kendaraan"]'); await p.waitForTimeout(200); await p.locator('[data-hakt="1|*"]').locator('xpath=ancestor::details/summary').click(); await p.click('[data-hakt="1|*"]');
  console.log('• klik Semua hari:', await p.evaluate(() => 'hariAktif' in state.vehicles[1]));
  console.log('ERRORS:', errs.length ? errs.join(' | ') : 'none'); await b.close();
})();
