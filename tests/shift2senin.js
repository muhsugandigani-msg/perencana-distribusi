// Uji: Senin shift 1 habis untuk pembersihan -> kendaraan 2 shift jalan di shift 2, kendaraan 1 shift libur
const E = require(process.argv[2] || './engine.js'); const st = JSON.parse(JSON.stringify(require(process.argv[3] || './sample.json')));
st.params.jamShift = 8; st.params.jamMulai = "08:00";
st.params.aktivitas = [{ id: "a1", nama: "Pembersihan", durasi: 240, hari: [true,false,false,false,false,false,false], berlaku: "shift1", dihitung: true, waktu: "sebelum" },
  { id: "a2", nama: "Loading", durasi: 60, hari: [true,true,true,true,true,true,true], berlaku: "semua", dihitung: true, waktu: "sebelum" },
  { id: "a3", nama: "BBM", durasi: 60, hari: [true,true,true,true,true,true,true], berlaku: "shift1", dihitung: true, waktu: "sebelum" }];
const P = E.buildWeeks(st, {})[0]; const sen = P.trips.filter(t => t.day === 0);
const bad = sen.filter(t => t.shift < 2 || (+t.veh.maksShift || 1) < 2 || t.shiftStart < 16 * 60 - 1e-6);
console.log("rit Senin", sen.length, "salah", bad.length, "warn", P.warn.some(w => /shift 1 habis/.test(w)));
if (!sen.length || bad.length) process.exit(1);
