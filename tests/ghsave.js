// Simpan bersama GitHub: mock api.github.com
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const errs = []; const log = [];
  let remote = null, sha = null, n = 0, pushPerm = true, failPut = 0;
  await ctx.route('https://api.github.com/**', async (r) => {
    const req = r.request(), u = new URL(req.url()), auth = req.headers()['authorization'] || '';
    log.push(req.method() + ' ' + u.pathname + (auth ? ' [auth]' : ''));
    const H = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (u.pathname.endsWith('/contents/data/plan-data.json')) {
      if (req.method() === 'GET') return remote ? r.fulfill({ status: 200, headers: H, body: JSON.stringify({ sha, content: Buffer.from(remote, 'utf8').toString('base64').replace(/(.{60})/g, '$1\n'), download_url: 'x' }) }) : r.fulfill({ status: 404, headers: H, body: '{}' });
      if (req.method() === 'PUT') {
        if (!auth) return r.fulfill({ status: 401, headers: H, body: '{}' });
        if (failPut) { failPut--; return r.fulfill({ status: 409, headers: H, body: '{}' }); }
        const body = JSON.parse(req.postData()); if (sha && body.sha !== sha) return r.fulfill({ status: 409, headers: H, body: '{}' });
        remote = Buffer.from(body.content, 'base64').toString('utf8'); sha = 'sha' + (++n);
        return r.fulfill({ status: 200, headers: H, body: JSON.stringify({ content: { sha } }) });
      }
    }
    if (u.pathname === '/repos/muhsugandigani-msg/perencana-distribusi') return auth.includes('BAD') ? r.fulfill({ status: 401, headers: H, body: '{}' }) : r.fulfill({ status: 200, headers: H, body: JSON.stringify({ permissions: { push: pushPerm } }) });
    return r.fulfill({ status: 404, headers: H, body: '{}' });
  });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  const st = () => p.textContent('#saveState'); const toast = () => p.textContent('#toast');
  await p.goto('file://' + __dirname + '/local.html'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(600);
  console.log('1 buka tanpa data bersama:', await st());
  // tanpa token: simpan lokal
  await p.evaluate(() => { state.params.namaPlan = 'X'; save(); }); await p.click('#btnSave'); await p.waitForTimeout(300);
  console.log('2 simpan tanpa token:', await st(), '|', await toast(), '| remote?', !!remote);
  // pasang token salah format, lalu token buruk, lalu baik
  await p.click('#btnMenu'); await p.click('[data-act="github"]'); await p.waitForTimeout(200);
  console.log('3 dialog terbuka:', await p.evaluate(() => $('#ghDlg').open));
  await p.fill('#ghTok', 'abc def'); await p.click('#ghSaveTok'); console.log('  format salah:', await p.textContent('#ghStatus'));
  await p.fill('#ghTok', 'github_pat_BAD' + 'x'.repeat(30)); await p.click('#ghSaveTok'); await p.waitForTimeout(300); console.log('  token buruk:', await p.textContent('#ghStatus'));
  pushPerm = false; await p.fill('#ghTok', 'github_pat_' + 'a'.repeat(40)); await p.click('#ghSaveTok'); await p.waitForTimeout(300); console.log('  read-only:', await p.textContent('#ghStatus'));
  pushPerm = true; await p.click('#ghSaveTok'); await p.waitForTimeout(300); console.log('  ok:', await p.textContent('#ghStatus'), '| input kosong:', await p.inputValue('#ghTok') === '');
  await p.click('#ghForm button[value=close]'); await p.waitForTimeout(100);
  // simpan ke GitHub
  await p.evaluate(() => { state.stores[0].nama = 'TÉST ✓ ünïcode'; save(); }); await p.click('#btnSave'); await p.waitForTimeout(500);
  console.log('4 simpan ke GitHub:', await st(), '| sha', sha, '| remote nama:', JSON.parse(remote).stores[0].nama, '| token di data?', remote.includes('github_pat'));
  // orang lain membuka (browser baru, tanpa token)
  const p2 = await (await b.newContext()).newPage(); await p2.context().route('https://api.github.com/**', r => ctx._routes ? r.continue() : r.continue());
  await p2.close();
  const c2 = await b.newContext(); await c2.route('https://api.github.com/**', r => r.request().method() === 'GET' && r.request().url().includes('plan-data') ? r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ sha, content: Buffer.from(remote).toString('base64') }) }) : r.fulfill({ status: 404, body: '{}' }));
  const q = await c2.newPage(); q.on('pageerror', e => errs.push('Q ' + e.message));
  await q.goto('file://' + __dirname + '/local.html'); await q.waitForTimeout(1200);
  console.log('5 pengunjung lain:', await q.textContent('#saveState'), '| nama:', await q.evaluate(() => state.stores[0].nama), '| plan ok:', await q.evaluate(() => !!plan && plan.trips.length));
  await c2.close();
  // konflik: remote berubah oleh orang lain
  const other = JSON.parse(remote); other.stores[0].nama = 'DIUBAH ORANG LAIN'; other._savedAt = Date.now() + 5; remote = JSON.stringify(other); sha = 'sha' + (++n);
  await p.evaluate(() => { state.stores[1].nama = 'perubahan saya'; save(); }); await p.click('#btnSave'); await p.waitForTimeout(500);
  console.log('6 konflik:', await p.textContent('#confirmBox'));
  await p.click('#confirmBox [data-ci="1"]'); await p.waitForTimeout(800);
  console.log('  muat terbaru ->', await p.evaluate(() => state.stores[0].nama), '|', await st());
  await p.evaluate(() => { state.stores[1].nama = 'lagi'; save(); }); await p.click('#btnSave'); await p.waitForTimeout(500);
  console.log('7 simpan setelah muat:', await st(), sha);
  other.stores[0].nama = 'LAGI ORANG LAIN'; remote = JSON.stringify(other); sha = 'sha' + (++n);
  await p.evaluate(() => { state.stores[1].nama = 'timpa'; save(); }); await p.click('#btnSave'); await p.waitForTimeout(500);
  await p.click('#confirmBox [data-ci="0"]'); await p.waitForTimeout(600);
  console.log('8 timpa ->', JSON.parse(remote).stores[1].nama, JSON.parse(remote).stores[0].nama, '|', await st());
  // 409 dari PUT (balapan)
  failPut = 1; await p.evaluate(() => { save(); }); await p.click('#btnSave'); await p.waitForTimeout(600);
  console.log('9 PUT 409 -> konfirmasi muncul:', !(await p.evaluate(() => $('#confirmBox').hidden)));
  await p.click('#confirmBox [data-ci="x"]');
  // reload: data bersama dimuat lagi
  await p.reload(); await p.waitForTimeout(1000); console.log('10 reload:', await st());
  // hapus token
  await p.evaluate(() => ghDialog()); await p.click('#ghDel'); console.log('11 hapus token:', await p.evaluate(() => ghToken() === ''), await p.textContent('#ghStatus'));
  console.log('requests:', log.length, log.filter(x => /PUT/.test(x)).length, 'PUT');
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
