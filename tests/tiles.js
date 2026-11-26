const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
await p.goto('file://' + __dirname + '/local.html#plan'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
await p.evaluate(() => { state.params.optimasiMendalam = false; state.stores.find(s => s.nama.includes('Panakkukang')).frek = 0.5; save(); }); await p.click('#btnPlan'); await p.waitForTimeout(1500);
const tiles = () => p.$$eval('#p-plan .tile', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
console.log('baru:', await tiles());
console.log('gantt batas:', await p.evaluate(() => plan.H));
// simulasikan plan tersimpan versi lama (H = jumlah minggu)
await p.click('#btnSave'); await p.evaluate(() => { const s = JSON.parse(localStorage.getItem(LS_KEY)); s.savedPlan.weeks.forEach(P => P.H = 2); localStorage.setItem(LS_KEY, JSON.stringify(s)); }); await p.reload(); await p.waitForTimeout(600);
console.log('plan lama dimuat:', await tiles());
console.log('ERR', errs); await b.close(); })();
