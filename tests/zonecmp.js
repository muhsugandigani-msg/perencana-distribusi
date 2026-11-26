// ringkasan plan: km, rit, jam, keseimbangan zona/hari dan kendaraan
const d=require('/home/user/perencana-distribusi/data/plan-data.json');const H=['Sen','Sel','Rab','Kam','Jum','Sab','Min'];
const hav=(a,b)=>{const t=x=>x*Math.PI/180;const dl=t(b[0]-a[0]),dn=t(b[1]-a[1]);return 12742*Math.asin(Math.sqrt(Math.sin(dl/2)**2+Math.cos(t(a[0]))*Math.cos(t(b[0]))*Math.sin(dn/2)**2))};
for (const f of process.argv.slice(2)) { const [file,mode]=f.split(':'); const E=require(file); const st=JSON.parse(JSON.stringify(d.state||d)); const t0=Date.now();
 const W=E.buildWeeks(st,{mendalam:mode==='deep'}); let km=0,rit=0,jam=0,un=0; W.forEach(P=>{km+=P.trips.reduce((a,t)=>a+t.km,0);rit+=P.trips.length;jam+=P.trips.reduce((a,t)=>a+t.dur,0)/60;un+=P.unserved.length});
 const P=W[0]; const day=P.days.map(dd=>{const T=P.trips.filter(t=>t.day===dd);const S=T.flatMap(t=>t.stops.map(x=>x.store)).filter(s=>s.loading!=='Menaikkan');const kg=S.reduce((a,s)=>a+(+s.beratKg||0),0);
  const c=[S.reduce((a,s)=>a+s.lat,0)/S.length,S.reduce((a,s)=>a+s.lng,0)/S.length];const sp=S.length?S.reduce((a,s)=>a+hav([s.lat,s.lng],c),0)/S.length:0;return {d:H[dd],n:S.length,kg:Math.round(kg),sp:+sp.toFixed(2)}});
 const cv=a=>{const m=a.reduce((x,y)=>x+y,0)/a.length;return Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length)/m};
 console.log(file.split('/').pop(),mode||'quick','| rit',rit,'km',km.toFixed(0),'jam',jam.toFixed(1),'un',un,'|',((Date.now()-t0)/1000).toFixed(1)+'s');
 console.log('  per hari (mgg1):',day.map(x=>`${x.d} ${x.n}t ${(x.kg/1000).toFixed(1)}t r${x.sp}km`).join(' | '),' CV berat',cv(day.map(x=>x.kg)).toFixed(2),'CV toko',cv(day.map(x=>x.n)).toFixed(2),'sebaran rata2',(day.reduce((a,x)=>a+x.sp,0)/day.length).toFixed(2)+'km');
 const V={};P.trips.forEach(t=>{const k=t.veh.jenis.split(' ')[0]+(t.veh.plat||'').slice(3,7);V[k]=V[k]||{toko:0,kg:0,jam:0};V[k].toko+=t.stops.length;V[k].kg+=t.kgDel;V[k].jam+=t.dur/60});
 console.log('  per kendaraan (mgg1):',Object.entries(V).map(([k,v])=>`${k} ${v.toko}toko ${(v.kg/1000).toFixed(1)}t ${v.jam.toFixed(1)}j`).join(' | '));
}
