// cari elemen penyebab overflow horizontal di HP (tab plan, data bersama)
const { chromium } = require('playwright'); const fs = require('fs');
const DATA = JSON.parse(fs.readFileSync('/home/user/perencana-distribusi/data/plan-data.json', 'utf8'));
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 800 } });
  await p.route(/api\.github\.com|valhalla|tile|nominatim/, r => r.abort());
  await p.goto('file://' + __dirname + '/local.html');
  await p.evaluate(d => { localStorage.clear(); localStorage.setItem(LS_KEY, JSON.stringify(d.state || d)); }, DATA); await p.reload(); await p.waitForTimeout(800);
  for (const tb of (process.argv[2] || 'plan').split(',')) {
    await p.click(`[data-tab="${tb}"]`).catch(() => {}); await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const W = innerWidth, out = [];
      document.querySelectorAll('body *').forEach(el => { const b = el.getBoundingClientRect(); if (b.right > W + 1 && b.width > 0) { let q = el.parentElement, clipped = false; while (q && q !== document.body) { const cs = getComputedStyle(q); if (/(auto|scroll|hidden)/.test(cs.overflowX)) { clipped = true; break; } q = q.parentElement; } if (!clipped) out.push(el.tagName + '.' + el.className + ' #' + el.id + ' w=' + Math.round(b.width) + ' r=' + Math.round(b.right) + ' ' + (el.textContent || '').trim().slice(0, 40)); } });
      return { sw: document.documentElement.scrollWidth, list: out.slice(0, 12) };
    });
    console.log(tb, JSON.stringify(r, null, 1));
  }
  await p.screenshot({ path: __dirname + '/../qa3.png', fullPage: false });
  await b.close();
})();
