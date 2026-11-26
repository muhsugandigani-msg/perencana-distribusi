const E=require(process.argv[2]);const d=require('/home/user/perencana-distribusi/data/plan-data.json');const st=JSON.parse(JSON.stringify(d.state||d));
const H=['Sen','Sel','Rab','Kam','Jum','Sab','Min'];
const W=E.buildWeeks(st,{mendalam:process.argv[3]==='deep'});let tk=0,tr=0,idle=0;
W.forEach((P,w)=>{console.log('minggu',w+1,'rit',P.trips.length,'km',P.trips.reduce((a,t)=>a+t.km,0).toFixed(0),'un',P.unserved.length);tk+=P.trips.reduce((a,t)=>a+t.km,0);tr+=P.trips.length;
 P.days.forEach(dd=>{const row=P.vehicles.map((v,vi)=>{const T=P.trips.filter(t=>t.day===dd&&t.vIdx===vi);if(!T.length)idle++;return (v.jenis.split(' ')[0]+(v.plat||'').slice(3,7))+':'+T.length+'r/'+T.reduce((a,t)=>a+t.stops.length,0)+'t/'+(T.reduce((a,t)=>a+t.dur,0)/60).toFixed(1)+'j'});console.log('  ',H[dd],row.join('  '))});
 console.log('   warn',P.warn.filter(x=>/Fairness/.test(x)).join(' | '))});
console.log('TOTAL rit',tr,'km',tk.toFixed(0),'unit-hari kosong',idle);
