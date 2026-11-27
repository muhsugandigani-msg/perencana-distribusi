const E=require('./app/engine.js');const Eo=require('/home/user/perencana-distribusi/src/engine.js');const fs=require('fs');
const d=JSON.parse(fs.readFileSync('/home/user/perencana-distribusi/data/plan-data.json'));const st=d.state||d;st.vehicles.forEach(v=>v.aktif=true);
const sig=P=>JSON.stringify(P.trips.map(t=>[t.day,t.veh.id,t.shift,Math.round(t.dur),t.stops.map(x=>x.store.id)]));
const a=E.buildPlan(JSON.parse(JSON.stringify(st)),{mendalam:false}),b=Eo.buildPlan(JSON.parse(JSON.stringify(st)),{mendalam:false});
console.log('tanpa rasio gudang = lama:',sig(a)===sig(b));
const s2=JSON.parse(JSON.stringify(st));s2.params.rasioGudangKgMenit=st.params.rasioKgMenit;console.log('rasio gudang = store sama:',sig(E.buildPlan(s2,{mendalam:false}))===sig(b));
const s3=JSON.parse(JSON.stringify(st));s3.params.rasioGudangKgMenit=60;const c=E.buildPlan(s3,{mendalam:false});const t=c.trips[0];
console.log('rasio gudang 60:',t.segs.filter(x=>/di Lazuna|gudang|Gudang|Origin/.test(x.label)&&x.kg).map(x=>x.label+' '+x.kg+'kg '+Math.round(x.end-x.start)+'mnt').join(' | '), '| store:',t.segs.filter(x=>x.type==='bongkar').slice(0,1).map(x=>x.kg+'kg '+Math.round(x.end-x.start)+'mnt'));
