const E=require('./app/engine.js');const fs=require('fs');
const d=JSON.parse(fs.readFileSync('/home/user/perencana-distribusi/data/plan-data.json'));const st=d.state||d;st.vehicles.forEach(v=>v.aktif=true);
const P0=E.buildPlan(JSON.parse(JSON.stringify(st)),{mendalam:false});
const s=st.stores.find(x=>x.id==='s28'); s.kunci={kendaraan:'vtt5ge9',shift:2,kendaraanNama:'Pickup'};
const P1=E.buildPlan(JSON.parse(JSON.stringify(st)),{mendalam:false});
console.log('unserved base',P0.unserved.length,'locked',P1.unserved.filter(u=>u.store.id==='s28').map(u=>u.reason));
s.kunci={hari:[2],kendaraan:'v2'};const P2=E.buildPlan(JSON.parse(JSON.stringify(st)),{mendalam:false});
console.log(P2.trips.filter(t=>t.stops.some(x=>x.store.id==='s28')).map(t=>t.day+'|'+t.veh.id+'|'+t.shift), P2.unserved.filter(u=>u.store.id==='s28'));
