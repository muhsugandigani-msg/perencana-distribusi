// Akses kendaraan per store: chip, plan hanya pakai jenis yang diizinkan, peringatan, Excel
const { chromium } = require('playwright'); const XLSX = require('../deps/xlsx');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 800 }, acceptDownloads: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/api\.github\.com/, r => r.abort());
  await p.goto('file://' + __dirname + '/local.html'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem(LS_KEY, JSON.stringify(SAMPLE)); }); await p.reload(); await p.waitForTimeout(500);
  console.log('• data lama tanpa akses:', await p.evaluate(() => state.stores.some(s => 'akses' in s)));
  await p.click('[data-tab="store"]'); await p.waitForTimeout(300);
  const i = await p.evaluate(() => state.stores.findIndex(s => s.nama.includes('Panakkukang')));
  const row = await p.$(`[data-akses="${i}|*"]`); const dd = await row.evaluateHandle(x => x.closest('details'));
  console.log('• dropdown tertutup:', await dd.evaluate(d => d.querySelector('summary').textContent + ' open=' + d.open));
  await dd.evaluate(d => d.scrollIntoView({ block: 'center' })); await (await dd.$('summary')).click(); await p.waitForTimeout(150);
  const chips = await p.$$eval(`[data-akses^="${i}|"]`, a => a.map(x => x.parentElement.textContent.trim() + (x.checked ? '*' : '')));
  console.log('• opsi', chips.join(' | '));
  await p.click(`[data-akses="${i}|Traga Box"]`);
  console.log('• label:', await p.evaluate(i => document.querySelector(`[data-akses="${i}|*"]`).closest('details').querySelector('summary').textContent + ' open=' + document.querySelector(`[data-akses="${i}|*"]`).closest('details').open, i));
  await p.screenshot({ path: __dirname + '/../akses_dd.png' });
  console.log('• klik Traga:', JSON.stringify(await p.evaluate(i => state.stores[i].akses, i)));
  await p.click(`[data-akses="${i}|Traga Box"]`); console.log('• klik lagi -> Semua:', await p.evaluate(i => 'akses' in state.stores[i], i));
  await p.click(`[data-akses="${i}|Traga Box"]`);
  await p.click('#btnPlan'); await p.waitForTimeout(4000);
  const v = await p.evaluate(i => { const id = state.stores[i].id; return planWeeks.flatMap(P => P.trips.filter(t => t.stops.some(x => x.store.id === id)).map(t => t.veh.jenis)); }, i);
  console.log('• kendaraan yang melayani Panakkukang:', JSON.stringify(v), v.length && v.every(j => j === 'Traga Box') ? 'OK' : 'GAGAL');
  // jenis tidak ada -> peringatan + belum terlayani
  await p.evaluate(i => { state.stores[i].akses = ['Pickup']; runPlan(true); }, i); await p.waitForTimeout(500);
  console.log('• akses Pickup (tidak ada):', await p.evaluate(() => plan.warn.filter(w => /Pickup/.test(w)).join(' ')), '| unserved:', await p.evaluate(() => plan.unserved.map(u => u.store.nama + ' — ' + u.reason).join('; ')));
  await p.evaluate(i => { state.stores[i].akses = ['Traga Box']; }, i);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => exportExcel())]); const f = __dirname + '/dl/akses.xlsx'; await dl.saveAs(f);
  const wb = XLSX.readFile(f); const sh = wb.SheetNames.find(n => /store/i.test(n)); const rows = XLSX.utils.sheet_to_json(wb.Sheets[sh], { header: 1 });
  const ai = rows[0].indexOf('Akses kendaraan'); console.log('• export kolom', ai, [...new Set(rows.slice(1).map(r => r[ai]))].join(' | '));
  const up = [['Nama store', 'Akses kendaraan'], ['lazuna chicken panakkukang', 'Semua'], ['PRODUKSI', 'cdd box, traga box']];
  const w2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w2, XLSX.utils.aoa_to_sheet(up), 'Store'); XLSX.writeFile(w2, __dirname + '/dl/akses_up.xlsx');
  await p.setInputFiles('#fileStore', __dirname + '/dl/akses_up.xlsx'); await p.waitForTimeout(500);
  console.log('• upload:', JSON.stringify(await p.evaluate(i => [state.stores[i].akses, state.stores.find(s => s.nama === 'PRODUKSI').akses], i)));
  const [d2] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => storeTemplate())]); await d2.saveAs(__dirname + '/dl/tpl.xlsx');
  const t = XLSX.readFile(__dirname + '/dl/tpl.xlsx'); console.log('• template petunjuk:', XLSX.utils.sheet_to_json(t.Sheets[t.SheetNames[1]], { header: 1 }).find(r => r[0] === 'Akses kendaraan')[1]);
  console.log('ERRORS:', errs.length ? errs.join(' | ') : 'none'); await b.close();
})();
