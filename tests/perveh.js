const E=require(process.argv[2]);const d=require('/home/user/perencana-distribusi/data/plan-data.json');const st=JSON.parse(JSON.stringify(d.state||d));
if(process.argv[3]==='nofair') st.params.fairness.aktif=false;
console.log(st.vehicles.map((v,i)=>i+':'+v.jenis+' '+(v.plat||'')+(v.aktif===false?' (nonaktif)':'')).join(' | '));
const W=E.buildWeeks(st,{mendalam:process.argv[4]==='deep'});W.forEach((P,w)=>{const T={};P.trips.forEach(t=>{const k=t.vIdx+':'+t.veh.jenis+' '+(t.veh.plat||'');T[k]=T[k]||{rit:0,toko:0,kg:0,km:0,jam:0,hari:new Set()};T[k].rit++;T[k].toko+=t.stops.length;T[k].kg+=t.kgDel+t.kgPick;T[k].km+=t.km;T[k].jam+=t.dur/60;T[k].hari.add(t.day)});
console.log('minggu',w+1,'un',P.unserved.length,'km',P.trips.reduce((a,t)=>a+t.km,0).toFixed(0));Object.entries(T).forEach(([k,v])=>console.log('   ',k,'rit',v.rit,'toko',v.toko,'kg',Math.round(v.kg),'km',v.km.toFixed(0),'jam',v.jam.toFixed(1),'hari',v.hari.size))});
