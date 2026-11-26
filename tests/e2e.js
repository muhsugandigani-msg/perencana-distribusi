const { chromium } = require('playwright'); const fs=require('fs');
const log=(...a)=>console.log('•',...a);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ locale:'id-ID', viewport:{width:1400,height:900}, acceptDownloads:true });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push('PAGEERR '+e.message)); p.on('console',m=>{if(m.type()==='error'&&!/TUNNEL|Failed to load/.test(m.text()))errs.push(m.text())});
  await p.goto('file://'+__dirname+'/local.html'); await p.evaluate(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(500);
  const menu=async act=>{await p.click('#btnMenu');await p.click(`[data-act="${act}"]`);};
  const dl=async (fn)=>{const [d]=await Promise.all([p.waitForEvent('download'),fn()]);const f='dl/'+d.suggestedFilename();await d.saveAs(f);return f;};
  // 1 clear
  await menu('clear'); await p.click('[data-ci="0"]'); await p.waitForTimeout(200);
  log('after clear plan tab text:', (await p.textContent('#p-plan')).slice(0,80));
  // 2 vehicles
  await p.click('[data-tab="kendaraan"]'); await p.click('#addV'); await p.click('#addV');
  await p.fill('[data-k="vehicles.0.jenis"]','CDD Box'); await p.fill('[data-k="vehicles.0.plat"]','DD 1111 AB'); await p.fill('[data-k="vehicles.0.kapasitasKg"]','5500'); await p.fill('[data-k="vehicles.0.maksShift"]','2');
  await p.fill('[data-k="vehicles.1.jenis"]','Motor'); await p.fill('[data-k="vehicles.1.kapasitasKg"]','150'); await p.fill('[data-k="vehicles.1.kecepatan"]','30');
  log('ton display', await p.textContent('#vt0'));
  // 3 stores
  await p.click('[data-tab="store"]');
  const links=['https://www.google.com/maps/@-5.1019978,119.4786111,15z','https://www.google.com/maps/place/Toko+A/@-5.15,119.42,17z/data=!3m1!4b1!4m6!3m5!1s0x2dbee:0x1!8m2!3d-5.1631663!4d119.4525599!16s','https://maps.google.com/?q=-5.1823601,119.4453868','https://maps.app.goo.gl/AbCdEf123','-5.1169668, 119.5093495'];
  for(let i=0;i<links.length;i++){ await p.click('#addS'); await p.fill(`[data-k="stores.${i}.nama"]`, i?'Store '+i:'Gudang'); await p.fill(`[data-link="${i}"]`, links[i]); log('link',i, await p.inputValue('#lat'+i), await p.inputValue('#lng'+i), await p.textContent('#lm'+i)); }
  await p.selectOption('[data-k="stores.0.antaran"]','Origin'); await p.waitForTimeout(100);
  await p.fill('[data-link="3"]','-5.1374438, 119.5136457');
  await p.fill('[data-k="stores.1.beratKg"]','1200.5'); await p.selectOption('[data-k="stores.1.frek"]','2');
  await p.fill('[data-k="stores.2.beratKg"]','800'); await p.fill('[data-k="stores.2.tutup"]','11:00');
  await p.fill('[data-k="stores.3.beratKg"]','2500'); await p.click('[data-chip="stores.3.hariTetap|2"]');
  await p.selectOption('[data-k="stores.4.loading"]','Menaikkan'); await p.fill('[data-k="stores.4.beratKg"]','1500'); await p.selectOption('[data-k="stores.4.frek"]','5');
  // search + delete while filtered
  await p.click('#addS'); await p.fill('[data-k="stores.5.nama"]','Hapus Saya'); await p.fill('#storeSearch','hapus'); await p.waitForTimeout(100);
  await p.click('[data-del="stores|5"]'); await p.fill('#storeSearch','');
  log('stores count', await p.evaluate(()=>state.stores.length), await p.evaluate(()=>state.stores.map(s=>s.nama).join(',')));
  // 4 breaks
  await p.click('[data-tab="istirahat"]'); await p.click('[data-addb="0"]'); await p.click('[data-addb="0"]'); await p.fill('[data-k="breaks.0.1.mulai"]','15:00'); await p.fill('[data-k="breaks.0.1.selesai"]','15:30'); await p.click('[data-copyb="0"]');
  log('breaks', await p.evaluate(()=>JSON.stringify(state.breaks[4])));
  // 5 params
  await p.click('[data-tab="parameter"]'); await p.fill('#pShift','9'); await p.click('#addA'); await p.fill('[data-k="params.aktivitas.3.nama"]','Briefing'); await p.fill('[data-k="params.aktivitas.3.durasi"]','15'); await p.click('[data-tab="istirahat"]'); await p.click('[data-chip="params.hari|6"]');
  // 6 plan
  await p.click('#btnPlan'); await p.waitForTimeout(300);
  log('plan tiles', (await p.textContent('.tiles')).replace(/\s+/g,' '));
  const ban = await p.$$eval('#p-plan .banner', els=>els.map(e=>e.textContent.replace(/\s+/g,' ').trim())); log('banners', JSON.stringify(ban));
  await p.screenshot({path:'e_plan.png',fullPage:false});
  // dirty banner
  await p.click('[data-tab="kendaraan"]'); await p.fill('[data-k="vehicles.1.kapasitasKg"]','200'); await p.click('[data-tab="plan"]'); log('dirty banner hidden after auto-replan:', await p.isHidden('#dirtyBanner'));
  await p.click('[data-tab="gantt"]'); await p.waitForTimeout(200); log('gantt rects', await p.$$eval('#gantt rect', r=>r.length)); await p.screenshot({path:'e_gantt.png'});
  await p.click('[data-tab="peta"]'); await p.waitForTimeout(500); await p.click('[data-mday="2"]'); await p.waitForTimeout(400); log('map markers', await p.$$eval('.leaflet-marker-icon', r=>r.length), 'paths', await p.$$eval('path.leaflet-interactive', r=>r.length));
  await p.click('[data-mday="6"]'); await p.waitForTimeout(300);
  // excel
  const fx = await dl(()=>p.click('#btnMenu').then(()=>p.click('[data-act="excel"]'))); log('excel', fx, fs.statSync(fx).size);
  const fj = await dl(()=>p.click('#btnMenu').then(()=>p.click('[data-act="export"]'))); log('json', fj);
  const ft = await dl(()=>p.click('#btnMenu').then(()=>p.click('[data-act="template"]'))); log('template', ft);
  const fh = await dl(()=>p.click('#btnMenu').then(()=>p.click('[data-act="html"]'))); log('html', fh, fs.statSync(fh).size);
  const before = await p.evaluate(()=>JSON.stringify(state.stores.map(s=>[s.nama,s.beratKg,s.lat,s.lng,s.buka,s.tutup,s.frek,s.antaran,s.loading,s.hariTetap])));
  // import store from exported excel (Store sheet), replace
  await p.click('#btnMenu'); const [fc]=await Promise.all([p.waitForEvent('filechooser'), p.click('[data-act="importStore"]')]); await fc.setFiles(fx); await p.waitForTimeout(300); log('imp', await p.textContent('.imp')); await p.waitForTimeout(200);
  const after = await p.evaluate(()=>JSON.stringify(state.stores.map(s=>[s.nama,s.beratKg,s.lat,s.lng,s.buka,s.tutup,s.frek,s.antaran,s.loading,s.hariTetap])));
  log('excel roundtrip equal:', before===after); if(before!==after){console.log(before);console.log(after);}
  // template import
  await p.click('#btnMenu'); const [fc2]=await Promise.all([p.waitForEvent('filechooser'), p.click('[data-act="importStore"]')]); await fc2.setFiles(ft); await p.waitForTimeout(300); log('after template add', await p.evaluate(()=>JSON.stringify(state.stores.slice(-3).map(s=>[s.nama,s.lat,s.lng,s.beratKg,s.frek,s.antaran,s.loading,s.hariTetap,s.buka]))));
  // json import
  await p.click('#btnMenu'); const [fc3]=await Promise.all([p.waitForEvent('filechooser'), p.click('[data-act="import"]')]); await fc3.setFiles(fj); await p.waitForTimeout(300); log('json import stores', await p.evaluate(()=>state.stores.length));
  // sample reload
  await menu('sample'); await p.click('[data-ci="0"]'); await p.waitForTimeout(300); log('sample trips', await p.evaluate(()=>plan.trips.length));
  // mobile overflow
  await p.setViewportSize({width:390,height:844});
  for(const t of ['kendaraan','store','istirahat','parameter','plan','gantt','peta']){await p.click(`[data-tab="${t}"]`);await p.waitForTimeout(200);const o=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);if(o>0)log('OVERFLOW',t,o);}
  await p.emulateMedia({colorScheme:'dark'}); await p.setViewportSize({width:1400,height:900}); await p.click('[data-tab="gantt"]'); await p.screenshot({path:'e_dark.png'});
  // downloaded html opens with state
  const p2 = await ctx.newPage(); p2.on('pageerror',e=>errs.push('P2 '+e.message));p2.on('console',m=>{if(!/Failed to load/.test(m.text()))errs.push('P2c '+m.text())});
  let h=fs.readFileSync(fh,'utf8').replace(/ integrity="[^"]*" crossorigin="anonymous" referrerpolicy="no-referrer"/g,'').replace('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js','../deps/leaflet/dist/leaflet.js').replace('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js','../deps/xlsx/dist/xlsx.full.min.js'); fs.writeFileSync('dl/reopen.html',h);
  await p2.goto('file://'+__dirname+'/dl/reopen.html#plan'); await p2.waitForTimeout(500); log('reopened html: stores', await p2.evaluate(()=>state.stores.map(s=>s.nama).join(',')), 'trips', await p2.evaluate(()=>plan.trips.length));
  console.log('ERRORS:', errs.join('\n')||'none'); await b.close();
})();
