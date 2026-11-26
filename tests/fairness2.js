const E=require(process.argv[2]);const d=require('/home/user/perencana-distribusi/data/plan-data.json');
const deep=process.argv[3]==='deep', all=process.argv[4]==='all';const f1=x=>x.toFixed(1);
function run(fp){const st=JSON.parse(JSON.stringify(d.state||d));st.params.fairness=fp;if(all)st.vehicles.forEach(v=>v.aktif=true);const P=E.buildWeeks(st,{mendalam:deep})[0];
 const V=P.vehicles.map(()=>({rit:0,toko:0,jam:0,km:0,s:{1:[0,0,0],2:[0,0,0]}}));P.trips.forEach(t=>{const v=V[t.vIdx];v.rit++;v.toko+=t.stops.length;v.jam+=t.dur/60;v.km+=t.km;const q=v.s[Math.min(2,t.shift)];q[0]+=t.stops.length;q[1]+=t.dur/60;q[2]+=t.km;});
 const km=P.trips.reduce((a,t)=>a+t.km,0),jam=P.trips.reduce((a,t)=>a+t.dur/60,0);
 console.log((fp.tingkat||'tanpa'),'km',f1(km),'jam',f1(jam),'rit',P.trips.length,'un',P.unserved.length);
 P.vehicles.forEach((v,i)=>{if(v.aktif===false&&!all)return;const x=V[i];console.log('   ',(v.jenis+' '+v.plat).padEnd(22),'tugas',x.toko,'jam',f1(x.jam),'km',f1(x.km),'| S1',x.s[1][0],'tg',f1(x.s[1][1]),'j',f1(x.s[1][2]),'km | S2',x.s[2][0],'tg',f1(x.s[2][1]),'j',f1(x.s[2][2]),'km');});}
run({});for(const t of ['ringan','sedang','kuat'])run({aktif:true,tingkat:t,jam:true,km:true,toko:true});
