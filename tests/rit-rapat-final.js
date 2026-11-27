const E=require(process.argv[2]);const fs=require('fs');
const d=JSON.parse(fs.readFileSync('/home/user/perencana-distribusi/data/plan-data.json'));const st=d.state||d;st.params.ritRapat={aktif:true,km:5};if(process.argv[3])st.params._rrP=+process.argv[3];
const m=W=>{let mx=0,km=0,un=0,c=0;W.forEach(P=>{c+=P.opt.cost;P.trips.forEach(t=>{km+=t.km;t.stops.forEach((x,i)=>{if(i>0)mx=Math.max(mx,x.km)})});un+=P.unserved.length});return {cost:c,maks:+mx.toFixed(1),km:+km.toFixed(0),un}};
const q=m(E.buildWeeks(JSON.parse(JSON.stringify(st)),{mendalam:false})),dd=m(E.buildWeeks(JSON.parse(JSON.stringify(st)),{mendalam:true}));
console.log(process.argv[2],'cepat',JSON.stringify(q),'mendalam',JSON.stringify(dd),'=> dipakai',JSON.stringify(dd.cost<q.cost?dd:q));
