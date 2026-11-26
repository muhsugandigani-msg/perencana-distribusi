const E=require('./app/engine.js');const d=require('/home/user/perencana-distribusi/data/plan-data.json');const st0=d.state||d;
const prep=()=>{const s=JSON.parse(JSON.stringify(st0));const i=s.params.aktivitas.findIndex(a=>/loading/i.test(a.nama)&&a.waktu!=='setelah');if(i>=0){s.params.posLoadingGudang=i;s.params.aktivitas.splice(i,1);}return s;};
const sum=W=>{let km=0,jam=0,rit=0,un=0;W.forEach(P=>{P.trips.forEach(t=>{km+=t.km;jam+=t.dur/60;rit++});un+=P.unserved.length});return `km ${km.toFixed(1)} jam ${jam.toFixed(1)} rit ${rit} belum ${un}`;};
let t=Date.now();console.log('cepat   ',sum(E.buildWeeks(prep(),{mendalam:false})),((Date.now()-t)/1000).toFixed(1)+'s');
for(const k of (process.argv[2]||'rendah,sedang,tinggi').split(',')){const s=prep();s.params.tingkatOptimasi=k;t=Date.now();const W=E.buildWeeks(s,{mendalam:true});console.log(k.padEnd(8),sum(W),((Date.now()-t)/1000).toFixed(0)+'s');}
