// Audit: XSS dari data, error JS, overflow layar HP, semua tab + popup peta
const { chromium } = require('playwright'); const fs = require('fs');
const W = +(process.argv[2] || 1300), H = W < 600 ? 844 : 900, xssOn = process.argv[3] !== 'clean';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: H }, acceptDownloads: true }); const p = await ctx.newPage();
  const errs = [], cons = [];
  p.on('pageerror', e => errs.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 4).join(' / '))); p.on('console', m => { if ((m.type() === 'error' && !/tile|ERR_|Failed to load resource|net::/i.test(m.text())) || /Content Security Policy/i.test(m.text())) cons.push(m.text()); });
  p.on('dialog', d => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
  const d = JSON.parse(fs.readFileSync('/home/user/perencana-distribusi/data/plan-data.json')); const st = d.state || d; st.savedPlan = null; st.params.optimasiMendalam = false;
  if (xssOn) {
    const X = (k) => `"'><img src=x onerror="window.__x=(window.__x||[]).concat('${k}')"><svg onload="window.__x=(window.__x||[]).concat('${k}s')">`;
    st.stores.forEach((s, i) => { if (i % 3 === 1) { s.nama += X('nama' + i); s.alamat = (s.alamat || '') + X('alamat'); s.kota = X('kota'); s.buka = s.buka; s.akses = i === 4 ? ['CDD Box', X('akses')] : s.akses; } });
    st.stores[2].link = 'javascript:window.__x=(window.__x||[]).concat("link")';
    st.vehicles.forEach(v => { v.jenis += X('jenis'); v.plat = (v.plat || '') + X('plat'); });
    (st.params.aktivitas || []).forEach(a => a.nama += X('akt'));
    st.vehicles.forEach(v => v.aktif = v.id === 'v1' || v.id === 'vtt5ge9');
  }
  await p.addInitScript(s => { try { if (!sessionStorage.getItem('x')) { localStorage.setItem('perencana-distribusi-v1', s); sessionStorage.setItem('x', 1); } } catch (e) {} }, JSON.stringify(st));
  await p.goto(process.env.AU_URL || ('file://' + __dirname + '/app/local.html')); await p.waitForTimeout(1500);
  const over = [];
  const chkOverflow = async (name) => { const o = await p.evaluate(() => { const w = document.documentElement.clientWidth; const bad = []; document.querySelectorAll('body *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.right > w + 2 && !e.closest('.table-wrap,.tbl-wrap,.gantt-wrap,.scroll,[style*="overflow"],.leaflet-container') && getComputedStyle(e).position !== 'fixed') bad.push((e.id ? '#' + e.id : e.tagName + '.' + e.className).slice(0, 60) + '@' + Math.round(r.right)); }); return { sw: document.documentElement.scrollWidth, w, bad: bad.slice(0, 6) }; }); if (o.sw > o.w + 2 || o.bad.length) over.push(name + ' scrollW ' + o.sw + '/' + o.w + ' ' + o.bad.join(' ')); };
  for (const t of ['kendaraan', 'store', 'istirahat', 'parameter']) { await p.click(`[data-tab="${t}"]`); await p.waitForTimeout(400); await chkOverflow(t); if (W < 600 || t === 'store') await p.screenshot({ path: `au_${W}_${t}.png`, fullPage: t !== 'store' }); }
  await p.click('#btnPlan'); await p.waitForTimeout(4000);
  for (const t of ['plan', 'gantt', 'peta']) { await p.click(`[data-tab="${t}"]`); await p.waitForTimeout(1500); await chkOverflow(t); await p.screenshot({ path: `au_${W}_${t}.png` }); }
  // popup peta
  for (const sel of ['.storepin', '.seqpin', '.unpin', '.depotpin']) { const el = await p.$$(sel); for (const e of el.slice(0, 4)) { await e.click({ force: true }).catch(() => {}); await p.waitForTimeout(150); } }
  const nd = (await p.$$('[data-mday]')).length; for (let k = 0; k < nd; k++) { await p.locator('[data-mday]').nth(k).click(); await p.waitForTimeout(500); const el = await p.$$('.seqpin,.unpin'); for (const e of el.slice(0, 3)) { await e.click({ force: true }).catch(() => {}); await p.waitForTimeout(120); } }
  // gantt hover/klik
  await p.click('[data-tab="gantt"]'); await p.waitForTimeout(800); const bars = await p.$$('[data-tip]'); for (const e of bars.slice(0, 5)) await e.hover().catch(() => {});
  // menu Data + dialog token
  await p.click('#btnMenu'); await p.waitForTimeout(300); await p.screenshot({ path: `au_${W}_menu.png` });
  const items = await p.$$eval('#menuPop button, #menuPop a, #menuPop label', e => e.map(x => x.textContent.trim()));
  await p.keyboard.press('Escape');
  // excel
  let excel = 'n/a';
  try { await p.click('#btnMenu'); const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.click('#menuPop >> text=/Excel/i')]); excel = dl.suggestedFilename(); } catch (e) { excel = 'gagal: ' + e.message.slice(0, 80); }
  const x = await p.evaluate(() => window.__x || []);
  console.log(JSON.stringify({ W, xss: x, errs, cons: cons.slice(0, 8), overflow: over, menu: items, excel }, null, 1));
  await b.close();
})();
