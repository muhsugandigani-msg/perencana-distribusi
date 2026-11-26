const E=require('./engine.js');const d=require('/home/user/perencana-distribusi/data/plan-data.json');
const hav=(a,b)=>{const t=x=>x*Math.PI/180;const dl=t(b.lat-a.lat),dn=t(b.lng-a.lng);return 12742*Math.asin(Math.sqrt(Math.sin(dl/2)**2+Math.cos(t(a.lat))*Math.cos(t(b.lat))*Math.sin(dn/2)**2))};
for (const f of [true,false]) { const st=JSON.parse(JSON.stringify(d.state||d)); st.params.fairness.aktif=f; const t0=Date.now();
const W=E.buildWeeks(st,{mendalam:process.argv[2]==='deep'});let km=0,r=0,un=0;W.forEach(P=>{km+=P.trips.reduce((a,t)=>a+t.km,0);r+=P.trips.length;un+=P.unserved.length});
const P=W[0];const day={};P.trips.forEach(t=>t.stops.forEach(x=>(day[x.store.id]=day[x.store.id]||new Set()).add(t.day)));
const S=st.stores.filter(s=>s.antaran!=='Origin'&&s.aktif!==false);let tot=0,same=0;const split=[];
for(let i=0;i<S.length;i++)for(let j=i+1;j<S.length;j++)if(hav(S[i],S[j])<=1.5){tot++;const A=day[S[i].id]||new Set(),B=day[S[j].id]||new Set();if([...A].some(x=>B.has(x)))same++;else split.push(S[i].nama.replace('Lazuna Chicken ','')+'/'+S[j].nama.replace('Lazuna Chicken ',''))}
const rit={};P.trips.forEach((t,k)=>t.stops.forEach(x=>(rit[x.store.id]=rit[x.store.id]||new Set()).add(k)));let sr=0,sd=0;for(let i=0;i<S.length;i++)for(let j=i+1;j<S.length;j++)if(hav(S[i],S[j])<=1.5){const A=day[S[i].id]||new Set(),B=day[S[j].id]||new Set();if([...A].some(x=>B.has(x))){sd++;const X=rit[S[i].id]||new Set(),Y=rit[S[j].id]||new Set();if([...X].some(x=>Y.has(x)))sr++;}}
console.log('fair',f,'sehari-semobil',sr+'/'+sd,'rit',r,'km',km.toFixed(0),'un',un,'pasangan ≤1km sehari',same+'/'+tot,'pisah:',split.join(', '),'pindah',P.opt.pairMoved,(Date.now()-t0)+'ms');
P.trips.forEach(t=>{const n=t.stops.map(x=>x.store.nama.replace('Lazuna Chicken ',''));if(n.some(x=>/antang/i.test(x)))console.log('   ',['Sen','Sel','Rab','Kam','Jum','Sab'][t.day],t.veh.jenis,t.veh.plat,'kg',Math.round(t.kgDel),'jam',(t.dur/60).toFixed(1),n.join(' > '))});}
