// Hari beroperasi: migrasi data lama, chip, peringatan, Excel, plan
const { chromium } = require('playwright'); const XLSX = require('../deps/xlsx');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 800 }, acceptDownloads: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/local.html'); await p.evaluate(() => localStorage.clear());
  // data lama: hariTetap
  await p.evaluate(() => { const s = JSON.parse(JSON.stringify(SAMPLE)); s.stores.forEach(x => { x.hariTetap = x.hariOperasi.length === 7 ? [] : x.hariOperasi; delete x.hariOperasi; }); localStorage.setItem(LS_KEY, JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(500);
  const mig = await p.evaluate(() => ({ prod: state.stores.find(s => s.nama === 'PRODUKSI').hariOperasi, any: state.stores.some(s => 'hariTetap' in s), all7: state.stores.filter(s => s.hariOperasi.length === 7).length }));
  console.log('• migrasi', JSON.stringify(mig));
  await p.click('[data-tab="store"]'); await p.waitForTimeout(300);
  const i = await p.evaluate(() => state.stores.findIndex(s => s.nama.includes('Panakkukang')));
  await p.evaluate(i => { state.stores[i].frek = 3; renderStore(); }, i);
  for (const d of [0, 1, 2, 3]) await p.click(`[data-chip="stores.${i}.hariOperasi|${d}"]`);
  const note = await p.textContent('#op' + i);
  console.log('• chip off Sen-Kam, frek 3 ->', JSON.stringify(await p.evaluate(i => state.stores[i].hariOperasi, i)), '| note:', note);
  await p.evaluate(() => document.querySelector('#p-store .tbl-wrap').scrollLeft = 5000); await p.waitForTimeout(100);
  await p.screenshot({ path: __dirname + '/../ops.png' });
  await p.click('#btnPlan'); await p.waitForTimeout(3500);
  const days = await p.evaluate(i => { const id = state.stores[i].id; return [...new Set(plan.trips.filter(t => t.stops.some(x => x.store.id === id)).map(t => t.day))]; }, i);
  console.log('• plan hari kirim Panakkukang', JSON.stringify(days), '| warn:', await p.evaluate(() => plan.warn.filter(w => /Panakkukang/.test(w)).join(' ')));
  // export -> cek kolom
  const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => exportExcel())]); const f = __dirname + '/dl/ops.xlsx'; await dl.saveAs(f);
  const wb = XLSX.readFile(f); const sh = wb.SheetNames.find(n => /store/i.test(n)); const rows = XLSX.utils.sheet_to_json(wb.Sheets[sh], { header: 1 });
  const hi = rows[0].indexOf('Hari beroperasi'); console.log('• export kolom', hi >= 0, rows.slice(1, 4).map(r => r[hi]).join(' | '));
  // upload: setiap hari & daftar
  const up = [['Nama store', 'Hari beroperasi'], ['lazuna chicken panakkukang', 'Setiap hari'], ['PRODUKSI', 'Sen, Rab, Jum']];
  const w2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w2, XLSX.utils.aoa_to_sheet(up), 'Store'); XLSX.writeFile(w2, __dirname + '/dl/ops_up.xlsx');
  await p.setInputFiles('#fileStore', __dirname + '/dl/ops_up.xlsx'); await p.waitForTimeout(500);
  console.log('• upload', JSON.stringify(await p.evaluate(i => [state.stores[i].hariOperasi, state.stores.find(s => s.nama === 'PRODUKSI').hariOperasi], i)));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
