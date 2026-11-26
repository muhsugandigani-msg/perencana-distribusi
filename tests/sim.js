// Simulasi skenario tepi: data rusak, tanpa kendaraan, tanpa origin, store tanpa koordinat, dsb.
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/TUNNEL|Failed to load|ERR_/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('file://' + __dirname + '/local.html'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  const tabs = await p.$$eval('[data-tab]', e => e.map(x => x.dataset.tab));
  for (const t of tabs) { await p.goto('file://' + __dirname + '/local.html#' + t); await p.waitForTimeout(700); }
  console.log('• buka langsung tiap tab lewat #hash', errs.length ? 'ERR ' + errs.join(' | ') : 'ok');
  const visitAll = async label => { for (const t of tabs) { await p.click('[data-tab="' + t + '"]'); await p.waitForTimeout(120); } const n = errs.length; console.log('•', label, n ? 'ERR ' + errs.slice(-3).join(' | ') : 'ok'); };
  const loadJson = async (obj, label) => {
    fs.writeFileSync('dl/sim.json', typeof obj === 'string' ? obj : JSON.stringify(obj));
    await p.setInputFiles('#fileJson', 'dl/sim.json'); await p.waitForTimeout(400);
    const t = await p.textContent('#toast'); await visitAll(label + ' [' + t + ']');
  };
  await loadJson('not json', 'json rusak');
  await loadJson('[1,2,3]', 'json array');
  await loadJson({ stores: 'x', vehicles: [null, 5, {}], breaks: 3, params: { hari: [1], aktivitas: 'x', lalin: { jamSibuk: 'x' }, jalanBlok: 7 } }, 'json tipe salah');
  await loadJson({ vehicles: [], stores: [] }, 'kosong');
  await p.click('#btnPlan'); await p.waitForTimeout(300); await visitAll('plan kosong');
  const base = JSON.parse(fs.readFileSync('sample.json', 'utf8'));
  const c1 = JSON.parse(JSON.stringify(base)); c1.stores.forEach(s => { if (s.antaran === 'Origin') s.antaran = 'Tujuan'; });
  await loadJson(c1, 'tanpa origin'); await p.click('#btnPlan'); await p.waitForTimeout(500); await visitAll('plan tanpa origin');
  const c2 = JSON.parse(JSON.stringify(base)); c2.vehicles = [];
  await loadJson(c2, 'tanpa kendaraan'); await p.click('#btnPlan'); await p.waitForTimeout(500); await visitAll('plan tanpa kendaraan');
  const c3 = JSON.parse(JSON.stringify(base)); c3.stores[5].lat = null; c3.stores[5].lng = 'abc'; c3.stores[6].beratKg = 999999; c3.stores[7].buka = '22:00'; c3.stores[7].tutup = '06:00'; c3.stores[8].frek = 0; c3.vehicles[0].kapasitasKg = 0; c3.vehicles[1].kecepatan = 0;
  await loadJson(c3, 'data aneh'); await p.click('#btnPlan'); await p.waitForTimeout(3000); await visitAll('plan data aneh');
  console.log('  banners:', (await p.$$eval('#p-plan .banner', e => e.map(x => x.textContent.trim().slice(0, 90)))).join(' || '));
  const c4 = JSON.parse(JSON.stringify(base)); c4.params.hari = [false, false, false, false, false, false, false];
  await loadJson(c4, 'semua hari libur'); await p.click('#btnPlan'); await p.waitForTimeout(800); await visitAll('plan semua libur');
  // localStorage rusak
  await p.evaluate(() => localStorage.setItem(LS_KEY, '{"stores":5,"params":"x"}')); await p.reload(); await p.waitForTimeout(500); await visitAll('localStorage rusak');
  await p.evaluate(() => localStorage.setItem(LS_KEY, '}{')); await p.reload(); await p.waitForTimeout(500); await visitAll('localStorage bukan json');
  // interaksi umum: tambah/hapus kendaraan & store, cari, chip hari, parameter
  await p.click('[data-tab="kendaraan"]'); const nv = await p.$$eval('#p-kendaraan tbody tr', e => e.length);
  await p.click('#addV').catch(() => {}); await p.waitForTimeout(150);
  await p.click('[data-tab="store"]'); await p.click('#addS'); await p.waitForTimeout(150);
  await p.fill('#storeSearch', 'panak'); await p.waitForTimeout(200); const ns = await p.$$eval('#p-store tbody tr', e => e.length);
  await p.fill('#storeSearch', ''); await p.waitForTimeout(150);
  const del = await p.$$('#p-store [data-del^="stores|"]'); await del[del.length - 1].click(); await p.waitForTimeout(200);
  await p.click('[data-tab="parameter"]'); await p.waitForTimeout(150);
  await p.click('#btnPlan'); await p.waitForTimeout(3000); await visitAll('interaksi umum (cari: ' + ns + ' baris)');
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
