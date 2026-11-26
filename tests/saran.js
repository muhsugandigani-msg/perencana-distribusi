// Saran armada + prioritas store (data bersama)
const { chromium } = require('playwright'); const XLSX = require('../deps/xlsx'); const fs = require('fs');
const DATA = JSON.parse(fs.readFileSync('/home/user/perencana-distribusi/data/plan-data.json', 'utf8'));
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/api\.github\.com|valhalla|tile|nominatim/, r => r.abort());
  await p.goto('file://' + __dirname + '/local.html');
  await p.evaluate(d => { localStorage.clear(); localStorage.setItem(LS_KEY, JSON.stringify(d.state || d)); }, DATA); await p.reload(); await p.waitForTimeout(800);
  await p.click('[data-tab="kendaraan"]'); await p.waitForTimeout(300);
  const t0 = Date.now(); await p.click('#btnSaran');
  await p.waitForFunction(() => !saranRun && saranRes && saranRes.length, null, { timeout: 120000 });
  console.log('• saran selesai', Math.round((Date.now() - t0) / 1000) + ' dtk');
  console.log(await p.evaluate(() => saranRes.map(r => r.label + ': ' + (r.err ? 'ERR ' + r.err : r.unit + ' unit, ' + r.T.rit + ' rit, ' + Math.round(r.T.km) + ' km, un ' + r.T.un)).join('\n')));
  console.log('• banner:', (await p.textContent('#saranOut')).match(/Rekomendasi:[^)]*\)|Armada sekarang sudah[^.]*\./)?.[0]);
  await p.screenshot({ path: __dirname + '/../saran.png', fullPage: true });
  // stale note
  await p.evaluate(() => { state.vehicles[0].kecepatan = 41; save(); renderKendaraan(); });
  console.log('• catatan data berubah:', /Data sudah berubah/.test(await p.textContent('#saranOut')));
  // Pakai
  const btn = await p.$('[data-saran]'); const lbl = await p.evaluate(b => saranRes[+b.dataset.saran].label, btn); await btn.click(); await p.waitForTimeout(300);
  console.log('• pakai', lbl, '-> unit aktif:', await p.evaluate(() => state.vehicles.filter(v => v.aktif !== false).length));
  // prioritas
  await p.click('[data-tab="store"]'); await p.waitForTimeout(300);
  const sel = p.locator('select[data-k="stores.2.prioritas"]'); await sel.selectOption('Tinggi'); await p.waitForTimeout(100);
  console.log('• prioritas Tinggi:', await p.evaluate(() => state.stores[2].prioritas)); await sel.selectOption('Normal');
  console.log('• prioritas Normal -> tidak disimpan:', await p.evaluate(() => 'prioritas' in state.stores[2]));
  await sel.selectOption('Rendah');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => exportExcel())]); await dl.saveAs(__dirname + '/dl/saran.xlsx');
  const wb = XLSX.readFile(__dirname + '/dl/saran.xlsx'); const rows = XLSX.utils.sheet_to_json(wb.Sheets['Store'], { header: 1 }); const pi = rows[0].indexOf('Prioritas');
  console.log('• export Prioritas:', pi, [...new Set(rows.slice(1).map(r => r[pi]))].join('|'));
  const up = [['Nama store', 'Prioritas'], [await p.evaluate(() => state.stores[3].nama), 'tinggi'], [await p.evaluate(() => state.stores[2].nama), '']];
  const w2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w2, XLSX.utils.aoa_to_sheet(up), 'Store'); XLSX.writeFile(w2, __dirname + '/dl/saran_up.xlsx');
  await p.setInputFiles('#fileStore', __dirname + '/dl/saran_up.xlsx'); await p.waitForTimeout(500);
  console.log('• upload:', JSON.stringify(await p.evaluate(() => [state.stores[3].prioritas, state.stores[2].prioritas])));
  console.log('ERRORS:', errs.length ? errs.join(' | ') : 'none'); await b.close();
})();
