const E=require('./engine.js');const base=require('./sample.json');
function run(name,mod){const S=JSON.parse(JSON.stringify(base));mod(S);const P=E.buildPlan(S);if(P.error){console.log(name,P.error);return}
const mx=Math.max(...P.trips.map(t=>t.dur));const km=P.trips.reduce((s,t)=>s+t.km,0);const late=Math.max(...P.trips.map(t=>t.end));
console.log(`\n== ${name}: rit ${P.trips.length} (S2 ${P.trips.filter(t=>t.shift>1).length}) | unserved ${P.unserved.length} | shift terpanjang ${(mx/60).toFixed(2)} j | ${km.toFixed(0)} km | selesai paling malam ${E.fmtJam(late)}`);
if(process.argv[2])for(const t of P.trips)console.log(E.HARI[t.day],t.veh.jenis,'S'+t.shift,E.fmtJam(t.shiftStart),'dep',E.fmtJam(t.dep),'ret',E.fmtJam(t.ret),'end',E.fmtJam(t.end),(t.dur/60).toFixed(2)+'j',t.stops.length+' titik');
P.unserved.forEach(u=>console.log('  X',E.HARI[u.day],u.store.nama,u.reason||''));}
const L=S=>S.params.aktivitas.find(a=>/Loading/.test(a.nama));
run('Loading sebelum berangkat (sekarang)',S=>{});
run('Loading setelah kembali, hari pertama = disiapkan Sabtu',S=>{L(S).waktu='setelah'});
run('Loading setelah kembali, hari pertama = pagi',S=>{L(S).waktu='setelah';S.params.loadingHariPertama='pagi'});
run('Loading setelah kembali, tidak masuk jam shift',S=>{L(S).waktu='setelah';L(S).dihitung=false});
