// QA alur nyata dengan data bersama: plan + mendalam, minggu, simpan/muat, banner, Excel, XSS jenis kendaraan, layar HP
const { chromium } = require('playwright'); const XLSX = require('../deps/xlsx'); const fs = require('fs');
const DATA = JSON.parse(fs.readFileSync('/home/user/perencana-distribusi/data/plan-data.json', 'utf8'));
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 850 }, acceptDownloads: true });
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errs.push('console ' + m.text()); });
  await p.route(/api\.github\.com|valhalla|tile|nominatim/, r => r.abort());
  await p.goto('file://' + __dirname + '/local.html');
  await p.evaluate(d => { localStorage.clear(); const s = d.state || d; localStorage.setItem(LS_KEY, JSON.stringify(s)); }, DATA); await p.reload(); await p.waitForTimeout(800);
  const s0 = await p.evaluate(() => ({ weeks: planWeeks ? planWeeks.length : 0, dirty: planDirty, tab: tab }));
  console.log('• buka dengan plan tersimpan:', JSON.stringify(s0));
  await p.click('#btnPlan'); await p.waitForTimeout(1500);
  const t0 = Date.now(); while (await p.evaluate(() => deepJob.run) && Date.now() - t0 < 240000) await p.waitForTimeout(1000);
  const s1 = await p.evaluate(() => ({ weeks: planWeeks.length, rit: weeksTotal(planWeeks).rit, km: Math.round(weeksTotal(planWeeks).km), un: weeksTotal(planWeeks).un, dasar: !!plan.opt.dasar, warn: plan.warn }));
  console.log('• plan + mendalam (' + Math.round((Date.now() - t0) / 1000) + ' dtk):', JSON.stringify(s1));
  for (const tb of ['plan', 'gantt', 'peta', 'kendaraan', 'store', 'istirahat', 'parameter', 'plan']) { await p.click(`[data-tab="${tb}"]`); await p.waitForTimeout(300); }
  await p.locator('#p-plan [data-week]').last().click(); await p.waitForTimeout(300);
  const txt = await p.textContent('#p-plan'); console.log('• tab plan ada NaN/undefined/Infinity:', /NaN|undefined|Infinity|\[object/.test(txt), '| kartu fairness tampil:', /Fairness antar kendaraan/.test(txt));
  console.log('• teks optCard:', (txt.match(/Angka di bawah[^.]*\.|Mesin mencoba[^.]*\./g) || []).join(' / '));
  await p.click('#btnSave'); await p.waitForTimeout(500);
  await p.reload(); await p.waitForTimeout(800);
  const s2 = await p.evaluate(() => ({ weeks: planWeeks ? planWeeks.length : 0, rit: planWeeks ? weeksTotal(planWeeks).rit : 0, dirty: planDirty, unsaved }));
  console.log('• setelah simpan & muat ulang:', JSON.stringify(s2), s2.rit === s1.rit && !s2.dirty ? 'OK' : 'CEK');
  await p.click('[data-tab="kendaraan"]'); await p.waitForTimeout(200);
  await p.locator('[data-hakt="0|*"]').locator('xpath=ancestor::details/summary').click(); await p.click('[data-hakt="0|5"]');
  await p.click('[data-tab="plan"]'); await p.waitForTimeout(300);
  console.log('• ubah hari aktif -> banner plan berubah:', await p.evaluate(() => planDirty && !!document.querySelector('#p-plan .banner')));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => exportExcel())]); await dl.saveAs(__dirname + '/dl/qa2.xlsx');
  const wb = XLSX.readFile(__dirname + '/dl/qa2.xlsx'); console.log('• Excel sheet:', wb.SheetNames.join(', '));
  let bad = 0; wb.SheetNames.forEach(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 }).forEach(r => r.forEach(c => { if (/NaN|undefined|\[object/.test(String(c))) bad++; }))); console.log('• sel Excel rusak:', bad);
  // XSS lewat jenis kendaraan & akses
  await p.evaluate(() => { window.__x = 0; state.vehicles[0].jenis = '<img src=x onerror="window.__x=1">'; state.stores[2].akses = ['"><svg onload=window.__x=2>']; save(); });
  for (const tb of ['kendaraan', 'store', 'plan']) { await p.click(`[data-tab="${tb}"]`); await p.waitForTimeout(300); }
  await p.locator('details.akdd summary').first().click().catch(() => {}); await p.waitForTimeout(200);
  console.log('• XSS jenis/akses terpicu:', await p.evaluate(() => window.__x));
  // HP
  await p.setViewportSize({ width: 390, height: 800 });
  for (const tb of ['kendaraan', 'store', 'plan', 'gantt']) { await p.click(`[data-tab="${tb}"]`).catch(() => {}); await p.waitForTimeout(250); const o = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); if (o) console.log('  overflow HP di', tb); }
  console.log('ERRORS:', errs.length ? [...new Set(errs)].join(' | ') : 'none'); await b.close();
})();
