const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => { errs.push('DIALOG ' + d.message()); d.dismiss(); });
  await p.goto('file://' + __dirname + '/local.html'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  const X = '<img src=x onerror="window.__x=(window.__x||0)+1">"\'<svg onload=window.__x=9>';
  await p.evaluate(X => {
    const skip = /^(id|antaran|loading|waktu|berlaku|buka|tutup|mulai|selesai|loadingHariPertama)$/;
    const walk = o => { for (const k in o) { const v = o[k]; if (typeof v === 'string' && !skip.test(k)) o[k] = v + X; else if (v && typeof v === 'object') walk(v); } };
    walk(state); save(); runPlan(true);
  }, X);
  const tabs = await p.$$eval('[data-tab]', e => e.map(x => x.dataset.tab));
  for (const t of tabs) { await p.click('[data-tab="' + t + '"]'); await p.waitForTimeout(400); }
  await p.click('[data-tab="gantt"]'); const bars = await p.$$('#p-gantt [data-tip]');
  for (const bb of bars.slice(0, 15)) { await bb.hover({ force: true }).catch(() => {}); }
  await p.click('[data-tab="peta"]'); await p.waitForTimeout(300); const mk = await p.$$('.leaflet-marker-icon');
  for (const m of mk.slice(0, 5)) { await m.click({ force: true }).catch(() => {}); await p.waitForTimeout(100); }
  await p.click('[data-tab="plan"]'); await p.waitForTimeout(300);
  console.log('xss fired:', await p.evaluate(() => window.__x || 0), 'tabs', tabs.length, 'bars', bars.length, 'markers', mk.length, errs.slice(0, 5));
  await b.close();
})();
