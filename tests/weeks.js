// Frekuensi 1x per 2–5 minggu: UI store, plan per minggu, pemilih minggu, Excel, upload
const { chromium } = require('playwright'); const XLSX = require('../deps/xlsx');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await p.goto('file://' + __dirname + '/local.html#store'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(600);
  const i = await p.evaluate(() => state.stores.findIndex(s => s.nama.includes('Panakkukang')));
  const opts = await p.$$eval(`[data-k="stores.${i}.frek"] option`, o => o.map(x => x.textContent));
  console.log('1 pilihan frek:', opts.slice(-4).join(' | '));
  await p.selectOption(`[data-k="stores.${i}.frek"]`, '0.5'); await p.waitForTimeout(200);
  console.log('  frek tersimpan', await p.evaluate(i => state.stores[i].frek, i), '| kolom minggu ke:', await p.$$eval(`[data-k="stores.${i}.mingguKe"] option`, o => o.map(x => x.textContent).join('/')));
  const j = await p.evaluate(() => state.stores.findIndex(s => s.nama.includes('Tamalanrea') || s.nama.includes('Perintis')));
  await p.selectOption(`[data-k="stores.${j}.frek"]`, '0.25'); await p.waitForTimeout(200);
  await p.selectOption(`[data-k="stores.${j}.mingguKe"]`, '3'); await p.waitForTimeout(100);
  console.log('  kunci minggu ke', await p.evaluate(j => state.stores[j].mingguKe, j));
  await p.click('#btnPlan'); await p.waitForTimeout(1500);
  const info = await p.evaluate(() => ({ H: planWeeks.length, rit: planWeeks.map(P => P.trips.length), bar: document.querySelectorAll('#p-plan .weekbar [data-week]').length, title: document.querySelector('#p-plan h2').textContent }));
  console.log('2 plan:', JSON.stringify(info));
  const appear = await p.evaluate(([i, j]) => [state.stores[i], state.stores[j]].map(s => planWeeks.map((P, w) => P.trips.some(t => t.stops.some(x => x.store.id === s.id)) ? w + 1 : 0).filter(Boolean).join(',')), [i, j]);
  console.log('  muncul di minggu: 1x2mgg =', appear[0], '| 1x4mgg kunci 3 =', appear[1]);
  await p.click('#p-plan .weekbar [data-week="2"]'); await p.waitForTimeout(300);
  console.log('3 pilih minggu 3:', await p.evaluate(() => [weekSel, plan.week, document.querySelector('#p-plan h2').textContent]));
  await p.click('[data-tab="gantt"]'); await p.waitForTimeout(300); console.log('  gantt judul:', await p.textContent('#p-gantt h2'), '| bar minggu', await p.$$eval('#p-gantt [data-week]', e => e.length));
  await p.click('[data-tab="peta"]'); await p.waitForTimeout(500); console.log('  peta bar minggu', await p.$$eval('#mapTools [data-week]', e => e.length));
  await p.click('[data-tab="store"]'); await p.waitForTimeout(300); console.log('  jadwal store:', await p.evaluate(i => document.querySelectorAll('#p-store tbody tr')[i].textContent.match(/M\d:[^·]+(· M\d:[^·]+)*/)?.[0], i));
  // excel
  await p.waitForFunction(() => !deepJob.run, null, { timeout: 120000 });
  console.log('4 deep selesai:', await p.evaluate(() => [planWeeks.length, planWeeks.map(P => P.trips.length + '/' + Math.round(P.trips.reduce((a, t) => a + t.km, 0))).join(' ')]), '|', await p.textContent('#toast'));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => exportExcel())]); const f = __dirname + '/dl/weeks.xlsx'; await dl.saveAs(f);
  const wb = XLSX.readFile(f); const r = XLSX.utils.sheet_to_json(wb.Sheets['Ringkasan Rit'], { header: 1 });
  console.log('5 excel sheets', wb.SheetNames.join(','), '| kolom1', r[0][0], r[1][0]);
  const st = XLSX.utils.sheet_to_json(wb.Sheets['Store'], { header: 1 }); const hi = st[0].indexOf('Frekuensi kirim');
  console.log('  store frek', [...new Set(st.slice(1).map(x => x[hi]))].join(' | '), '| minggu kirim kolom', st[0].includes('Minggu kirim ke'));
  // upload
  const up = [['Nama store', 'Frekuensi kirim', 'Minggu kirim ke'], ['PRODUKSI', '5x seminggu', ''], ['lazuna chicken panakkukang', '1x 3 minggu', '2'], ['Store Baru X', '1x/5 minggu', '']];
  const w2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w2, XLSX.utils.aoa_to_sheet(up), 'Store'); XLSX.writeFile(w2, __dirname + '/dl/weeks_up.xlsx');
  await p.setInputFiles('#fileStore', __dirname + '/dl/weeks_up.xlsx'); await p.waitForTimeout(500);
  console.log('6 upload:', JSON.stringify(await p.evaluate(i => [state.stores[i].frek, state.stores[i].mingguKe, state.stores.find(s => s.nama === 'Store Baru X').frek, state.stores.find(s => s.nama === 'PRODUKSI').frek], i)));
  // kembali semua mingguan -> 1 minggu, tanpa bar
  await p.evaluate(() => { state.stores.forEach(s => { if (s.frek > 0 && s.frek < 1) s.frek = 1; }); save(); }); await p.click('#btnPlan'); await p.waitForTimeout(800);
  console.log('7 tanpa periodik:', await p.evaluate(() => [planWeeks.length, document.querySelectorAll('.weekbar').length]));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
