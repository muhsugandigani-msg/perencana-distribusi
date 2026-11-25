const E=require('./engine.js');const base=()=>JSON.parse(JSON.stringify(require('./sample.json')));
function run(name,mod){const S=base();mod(S);const t=Date.now();const P=E.buildPlan(S);
 if(P.error){console.log(name,'ERROR:',P.error);return P;}
 // sanity checks
 const issues=[];
 for(const tr of P.trips){ if(tr.dur>P.H+0.5)issues.push('overshift');if(tr.kgDel>tr.veh.kapasitasKg+0.1)issues.push('overcap');
   const n=tr.stops.length; const pk=tr.stops.map(s=>s.store.loading==='Menaikkan'); if(pk.indexOf(true)>=0 && pk.slice(pk.indexOf(true)).includes(false))issues.push('pickup not last');
   for(const s of tr.stops){const b=E.toMin(s.store.buka);if(b!=null&&s.start<b-0.01)issues.push('before open '+s.store.nama);}
 }
 // each vehicle shift chronology
 const byV={};P.trips.forEach(t=>{const k=t.day+'-'+t.vIdx;(byV[k]=byV[k]||[]).push(t)});
 Object.values(byV).forEach(l=>{for(let i=1;i<l.length;i++)if(l[i].t0<l[i-1].ret-0.01)issues.push('overlap shift');if(l.length>+l[0].veh.maksShift)issues.push('too many shifts')});
 // visit counts
 const cnt={};P.trips.forEach(t=>t.stops.forEach(s=>cnt[s.store.id]=(cnt[s.store.id]||0)+1));P.unserved.forEach(u=>cnt[u.store.id]=(cnt[u.store.id]||0)+1);
 S.stores.filter(s=>s.aktif!==false&&s.antaran!=='Origin'&&s.lat!=null&&+s.frek>0).forEach(s=>{const exp=s.hariTetap.length?s.hariTetap.filter(d=>S.params.hari[d]).length:Math.min(+s.frek,S.params.hari.filter(Boolean).length);if((cnt[s.id]||0)!==exp)issues.push('count '+s.nama+' '+(cnt[s.id]||0)+'/'+exp)});
 // same store twice same day
 const sd={};P.trips.forEach(t=>t.stops.forEach(s=>{const k=t.day+s.store.id;if(sd[k])issues.push('dup day '+s.store.nama);sd[k]=1}));
 console.log(name,'| rit',P.trips.length,'| unserved',P.unserved.map(u=>u.store.nama.replace('Lazuna Chicken ','')+'@'+E.HARI[u.day]+': '+u.reason).join('; '),'| warn',P.warn.length,P.warn.slice(0,3).join(' / '),'| issues',[...new Set(issues)].join(','),'|',Date.now()-t+'ms');return P;}
run('sample',S=>{});
run('overweight',S=>{S.stores[2].beratKg=7000});
run('overnight hours',S=>{S.stores.forEach(s=>{if(s.antaran!=='Origin'){s.buka='16:00';s.tutup='02:00'}})});
run('closes early',S=>{S.stores[3].tutup='09:00'});
run('opens late',S=>{S.stores[4].buka='19:00'});
run('frek0',S=>{S.stores[5].frek=0});
run('no origin',S=>{S.stores[0].antaran='Tujuan'});
run('no vehicles',S=>{S.vehicles=[]});
run('cap empty',S=>{S.vehicles[1].kapasitasKg=null});
run('speed empty',S=>{S.vehicles[0].kecepatan=null});
run('shift 2h',S=>{S.params.jamShift=2});
run('3 days only',S=>{S.params.hari=[true,false,true,false,true,false,false]});
run('sunday on',S=>{S.params.hari[6]=true});
run('freq7 no fixed',S=>{S.stores.forEach(s=>s.hariTetap=[]);S.stores[3].frek=7});
run('no coords',S=>{S.stores[6].lat=null});
run('rate 0',S=>{S.params.rasioKgMenit=0});
run('no breaks',S=>{for(const d in S.breaks)S.breaks[d]=[]});
run('pickup heavy',S=>{S.stores[1].beratKg=5000});
run('big fleet',S=>{for(let i=0;i<4;i++)S.vehicles.push({id:'x'+i,aktif:true,jenis:'Pickup',plat:'P'+i,kapasitasKg:1000,kecepatan:35,maksShift:2})});
run('150 stores',S=>{const st=S.stores.filter(s=>s.antaran!=='Origin'&&s.loading!=='Menaikkan');for(let i=0;i<110;i++){const b=st[i%st.length];S.stores.push(Object.assign({},b,{id:'n'+i,nama:'Extra '+i,lat:b.lat+(Math.random()-.5)*.03,lng:b.lng+(Math.random()-.5)*.03,beratKg:300,frek:1,hariTetap:[]}))}S.vehicles.push({id:'v9',aktif:true,jenis:'CDD',plat:'X',kapasitasKg:6000,kecepatan:40,maksShift:2})});
