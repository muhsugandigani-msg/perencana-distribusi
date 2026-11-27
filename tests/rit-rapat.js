const E=require(process.env.ENG||'./app/engine.js');const fs=require('fs');const sc=process.argv[2]||'now';
const d=JSON.parse(fs.readFileSync('/home/user/perencana-distribusi/data/plan-data.json'));const st=d.state||d;
const F=st.params.fairness;
if(sc==='nofair')F.aktif=false;
if(sc==='noshift'){F.antarShift=false;F.muatan=false;}
if(sc==='nomuatan'){F.muatan=false;}
if(sc==='ringan'){F.tingkat='ringan';}
if(sc==='rr'){st.params.ritRapat={aktif:true,km:5};}if(sc.startsWith('leg')){const [_,T,P,h]=sc.split('_');st.params._legT=+T;st.params._legP=+P;st.params._legHard=h==='h';}if(sc.endsWith('_r'))F.tingkat='ringan';
const hav=(a,b)=>{const r=Math.PI/180,dLa=(b[0]-a[0])*r,dLo=(b[1]-a[1])*r,x=Math.sin(dLa/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dLo/2)**2;return 12742*Math.asin(Math.sqrt(x))};
const W=E.buildWeeks(st,{mendalam:true});let km=0,j=0,r=0,un=0,legs=[],spr=[];const H=['Sen','Sel','Rab','Kam','Jum','Sab','Min'];
W.forEach(P=>{P.trips.forEach(t=>{km+=t.km;j+=t.dur/60;r++;const S=t.stops.map(x=>x.store).filter(s=>s.loading!=='Menaikkan');
 if(S.length>1){const c=[S.reduce((a,s)=>a+s.lat,0)/S.length,S.reduce((a,s)=>a+s.lng,0)/S.length];spr.push(S.reduce((a,s)=>a+hav([s.lat,s.lng],c),0)/S.length);}
 t.stops.forEach((x,i)=>{if(i>0)legs.push({km:x.km,txt:H[t.day]+' '+t.veh.jenis+' S'+t.shift+': '+t.stops[i-1].store.nama.replace('Lazuna Chicken ','')+' → '+x.store.nama.replace('Lazuna Chicken ','')+' '+x.km.toFixed(1)+' km'})})});un+=P.unserved.length});
legs.sort((a,b)=>b.km-a.km);const avgLeg=legs.reduce((a,l)=>a+l.km,0)/legs.length;
console.log(JSON.stringify({sc,fair:JSON.stringify(F),km:+km.toFixed(0),jam:+j.toFixed(1),rit:r,un,antarStoreRata:+avgLeg.toFixed(1),antarStoreMaks:+legs[0].km.toFixed(1),sebaranRit:+(spr.reduce((a,b)=>a+b,0)/spr.length).toFixed(1),legLebih8:legs.filter(l=>l.km>8).length}));
if(process.argv[3])legs.slice(0,8).forEach(l=>console.log('  '+l.txt));
