const d=require('/home/user/perencana-distribusi/data/plan-data.json');const st0=d.state||d;
const prep=()=>{const s=JSON.parse(JSON.stringify(st0));const i=s.params.aktivitas.findIndex(a=>/loading/i.test(a.nama)&&a.waktu!=='setelah');if(i>=0){s.params.posLoadingGudang=i;s.params.aktivitas.splice(i,1);}s.params.tingkatOptimasi='sedang';return s;};
const hav=(a,b)=>{const R=6371,r=Math.PI/180,dl=(b[0]-a[0])*r,dg=(b[1]-a[1])*r,x=Math.sin(dl/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dg/2)**2;return 2*R*Math.asin(Math.sqrt(x));};
const cv=a=>{const m=a.reduce((x,y)=>x+y,0)/a.length;return Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length)/m;};
function run(lbl,eng,mod){global.FAIRKG=mod.fairkg;const E=require(eng);const s=prep();Object.assign(s.params,mod.p||{});const t=Date.now();const W=E.buildWeeks(s,{mendalam:true});const P=W[0];
 let km=0,jam=0;P.trips.forEach(t=>{km+=t.km;jam+=t.dur/60});
 const dayKg=P.days.map(dd=>P.trips.filter(t=>t.day===dd).reduce((a,t)=>a+t.kgDel,0));
 const spr=[],far=[];P.trips.forEach(t=>{const X=t.stops.map(x=>x.store).filter(x=>x.loading!=='Menaikkan');if(X.length<2)return;const c=[X.reduce((a,x)=>a+x.lat,0)/X.length,X.reduce((a,x)=>a+x.lng,0)/X.length];const ds=X.map(x=>hav([x.lat,x.lng],c));spr.push(ds.reduce((a,b)=>a+b,0)/ds.length);far.push(Math.max(...ds));});
 const sh={1:[0,0,0,0],2:[0,0,0,0]};P.trips.filter(t=>t.vIdx===0).forEach(t=>{const q=sh[Math.min(2,t.shift)];q[0]+=t.stops.length;q[1]+=t.dur/60;q[2]+=t.km;q[3]+=t.kgDel+t.kgPick;});
 const n1=P.days.filter(dd=>!P.trips.some(t=>t.day===dd&&t.vIdx===0&&t.shift===2)||P.trips.some(t=>t.day===dd&&t.vIdx===0&&t.shift===1)).length;
 const f=x=>x.toFixed(1);
 console.log(lbl.padEnd(26),'km',f(km),'jam',f(jam),'rit',P.trips.length,'belum',P.unserved.length,'| muatan/hari CV',cv(dayKg).toFixed(2),'['+dayKg.map(x=>(x/1000).toFixed(1)).join(' ')+' t] | sebaran rit',f(spr.reduce((a,b)=>a+b,0)/spr.length),'km, terjauh',f(Math.max(...far)),'| CDD S1',sh[1].map((x,i)=>i==0?x:f(x)).join('/'),'S2',sh[2].map((x,i)=>i==0?x:f(x)).join('/'),((Date.now()-t)/1000).toFixed(0)+'s');
 delete require.cache[require.resolve(eng)];}
run('Mesin sekarang','./app/engine.js',{});

run('Zona + sub-zona','./zonetry/src/engine.js',{p:{metodeZona:true,subZona:true}});

