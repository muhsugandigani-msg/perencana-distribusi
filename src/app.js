/* ===== Aplikasi ===== */
const LS_KEY = "perencana-distribusi-v1";
const $ = (s, el = document) => el.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const uid = p => p + Math.random().toString(36).slice(2, 8);
const fmtNum = (n, d = 0) => (+n || 0).toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
const ton = kg => fmtNum((+kg || 0) / 1000, 2) + " t";
const dayColor = d => getComputedStyle(document.documentElement).getPropertyValue("--d" + d).trim() || "#2563eb";
const JENIS = ["CDD Box", "CDD Bak", "CDE", "Traga Box", "Traga Bak", "Engkel", "Pickup", "Blind Van", "Fuso", "Wingbox", "Motor"];

let state = loadState();
let plan = null, planDirty = true, ganttRs = null, ganttW = 0;
let planWeeks = null, weekSel = 0, planSavedAt = 0; const weekCache = { meta: null }; // plan per minggu (siklus 1x per 2–5 minggu)
let tab = "kendaraan";

function loadState() {
  let ls = null;
  try { const raw = localStorage.getItem(LS_KEY); if (raw) ls = JSON.parse(raw); } catch (e) {}
  try {
    if (window.INIT_STATE && !(ls && ls._stamp && ls._stamp === window.INIT_STATE._stamp)) return normalize(clone(window.INIT_STATE));
    if (ls) return normalize(ls);
  } catch (e) { console.warn("Data tersimpan rusak, memuat contoh", e); }
  return normalize(clone(SAMPLE));
}
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function arrObj(v) { return Array.isArray(v) ? v.filter(isObj) : []; }
function cleanJarak(J) { // matriks jarak jalan: {cfg, k:[titik], d:{"i:j": km}}
  if (!isObj(J) || typeof J.cfg !== "string" || !Array.isArray(J.k) || !isObj(J.d)) return undefined;
  const k = J.k.map(String).filter(x => /^-?\d+\.\d+,-?\d+\.\d+$/.test(x)); if (k.length !== J.k.length) return undefined;
  const d = {}; for (const key in J.d) { const v = J.d[key]; if (/^\d+:\d+$/.test(key) && typeof v === "number" && isFinite(v) && v >= 0 && v < 5000) d[key] = v; }
  return { cfg: J.cfg, k, d, t: +J.t || 0 };
}
function normalize(s) {
  if (!isObj(s)) throw new Error("format data tidak dikenali");
  s.vehicles = arrObj(s.vehicles); s.stores = arrObj(s.stores); s.breaks = isObj(s.breaks) ? s.breaks : {};
  for (let d = 0; d < 7; d++) s.breaks[d] = arrObj(s.breaks[d]);
  s.params = Object.assign(clone(SAMPLE.params), isObj(s.params) ? s.params : {});
  s.params.lalin = Object.assign(clone(SAMPLE.params.lalin), isObj(s.params.lalin) ? s.params.lalin : {});
  if (!Array.isArray(s.params.hari) || s.params.hari.length !== 7) s.params.hari = clone(SAMPLE.params.hari);
  s.params.aktivitas = arrObj(s.params.aktivitas);
  if (!Array.isArray(s.params.lalin.jamSibuk)) s.params.lalin.jamSibuk = clone(SAMPLE.params.lalin.jamSibuk);
  s.params.lalin.jamSibuk = arrObj(s.params.lalin.jamSibuk);
  ["pusat", "fPusat", "fPusatLuar", "fPinggir"].forEach(k => delete s.params.lalin[k]);
  const num = v => v === "" || v == null || isNaN(+v) ? null : +v;
  s.stores.forEach(x => { x.id = String(x.id || uid("s")); x.nama = String(x.nama ?? ""); const dl = v => [...new Set(v.map(Number).filter(d => d >= 0 && d < 7))].sort((a, b) => a - b); if (!Array.isArray(x.hariOperasi)) x.hariOperasi = Array.isArray(x.hariTetap) && x.hariTetap.length ? x.hariTetap : [0, 1, 2, 3, 4, 5, 6]; x.hariOperasi = dl(x.hariOperasi); delete x.hariTetap; x.lat = num(x.lat); x.lng = num(x.lng); if (x.lat != null && (Math.abs(x.lat) > 90 || Math.abs(x.lng ?? 0) > 180)) { x.lat = null; x.lng = null; } x.beratKg = num(x.beratKg) ?? 0; x.frek = num(x.frek) ?? 1; if (x.frek < 0) x.frek = 0; const mk = num(x.mingguKe); if (mk >= 1 && mk <= 5) x.mingguKe = Math.round(mk); else delete x.mingguKe; });
  // alamat lama "Makassar" pada store contoh -> pakai alamat hasil koordinat
  s.stores.forEach(x => { if (String(x.alamat || "").trim().toLowerCase() === "makassar") { const smp = SAMPLE.stores.find(y => y.id === x.id && Math.abs(y.lat - x.lat) < 1e-6 && Math.abs(y.lng - x.lng) < 1e-6); if (smp) { x.alamat = smp.alamat; x.alamatAuto = true; } } });
  // kolom Kota/Kabupaten baru: store contoh yang alamatnya otomatis ikut alamat & kota dari data contoh
  s.stores.forEach(x => { if (x.kota == null) { const smp = SAMPLE.stores.find(y => y.id === x.id && Math.abs(y.lat - x.lat) < 1e-6 && Math.abs(y.lng - x.lng) < 1e-6); if (smp) { x.kota = smp.kota; if (x.alamatAuto !== false) x.alamat = smp.alamat; } } });
  s.vehicles.forEach(x => { x.id = String(x.id || uid("v")); x.bbm = /bensin/i.test(x.bbm || "") ? "Bensin" : "Solar"; for (const k of ["maksKmRit", "maksRadiusKm"]) { const v = num(x[k]); if (v != null && v > 0) x[k] = v; else delete x[k]; } });
  s.params.fairness = Object.assign(clone(SAMPLE.params.fairness), isObj(s.params.fairness) ? s.params.fairness : {});
  s.params.prioritasSolar = Object.assign(clone(SAMPLE.params.prioritasSolar), isObj(s.params.prioritasSolar) ? s.params.prioritasSolar : {});
  s.params.aktivitas.forEach(x => { x.id = x.id || uid("a"); x.hari = x.hari || [true, true, true, true, true, true, true]; x.waktu = x.waktu === "setelah" ? "setelah" : "sebelum"; });
  if (s.params.loadingHariPertama !== "pagi") s.params.loadingHariPertama = "malam";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.params.mingguMulai || ""))) s.params.mingguMulai = SAMPLE.params.mingguMulai || "2026-11-30";
  s.params.jalanBlok = isObj(s.params.jalanBlok) ? s.params.jalanBlok : clone(SAMPLE.params.jalanBlok);
  s.params.jalanBlok.daftar = arrObj(s.params.jalanBlok.daftar).map(x => Object.assign({ id: uid("j"), aktif: true }, x));
  s.jarakJalan = cleanJarak(s.jarakJalan);
  if (!(isObj(s.savedPlan) && Array.isArray(s.savedPlan.weeks) && s.savedPlan.weeks.length && s.savedPlan.weeks.length <= 12 && s.savedPlan.weeks.every(isObj))) delete s.savedPlan;
  return s;
}
/* Simpan: perubahan baru tersimpan saat tombol "Simpan" (atau Ctrl+S) ditekan.
   Dengan token GitHub, data juga disimpan ke repo agar semua orang yang membuka link melihat data yang sama. */
let unsaved = false, saving = false;
function save() { // dipanggil di setiap perubahan input
  if (deepJob.run) stopDeep();
  planDirty = true; markDirty();
  unsaved = true; saveStatus();
}
const GH = { owner: "muhsugandigani-msg", repo: "perencana-distribusi", path: "data/plan-data.json", branch: "main" };
const GH_API = `https://api.github.com/repos/${GH.owner}/${GH.repo}`;
const shared = { sha: null, at: 0, ok: null, src: "lokal" }; // ok: null = belum dicek, false = tidak terjangkau
function ghToken() { try { return localStorage.getItem(LS_KEY + "-gh-token") || ""; } catch (e) { return ""; } }
function ghHeaders(json) {
  const h = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, t = ghToken();
  if (t) h.Authorization = "Bearer " + t;
  if (json) h["Content-Type"] = "application/json";
  return h;
}
function b64enc(str) { const u = new TextEncoder().encode(str); let bin = ""; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(bin); }
function b64dec(b64) { const bin = atob(String(b64).replace(/\s/g, "")); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); }
async function ghGetFile() { // -> {sha, data} | {sha:null} bila belum ada
  const r = await fetch(`${GH_API}/contents/${GH.path}?ref=${GH.branch}&t=${Date.now()}`, { headers: ghHeaders(), cache: "no-store" });
  if (r.status === 404) return { sha: null, data: null };
  if (!r.ok) throw Object.assign(new Error("GitHub " + r.status), { status: r.status });
  const j = await r.json(); let txt = j.content ? b64dec(j.content) : "";
  if (!txt && j.download_url) txt = await (await fetch(`${GH_API}/contents/${GH.path}?ref=${GH.branch}`, { headers: Object.assign(ghHeaders(), { Accept: "application/vnd.github.raw+json" }), cache: "no-store" })).text();
  return { sha: j.sha, data: txt ? JSON.parse(txt) : null };
}
async function ghPutFile(data, sha) {
  const body = { message: "Simpan data plan (" + new Date().toLocaleString("id-ID") + ")", content: b64enc(JSON.stringify(data, null, 1)), branch: GH.branch };
  if (sha) body.sha = sha;
  const r = await fetch(`${GH_API}/contents/${GH.path}`, { method: "PUT", headers: ghHeaders(true), body: JSON.stringify(body) });
  if (!r.ok) throw Object.assign(new Error("GitHub " + r.status), { status: r.status });
  return (await r.json()).content.sha;
}
function applyShared(f, quiet) {
  const keep = state.jarakJalan; state = normalize(f.data); mergeJarak(keep); try { mergeJarak(JSON.parse(localStorage.getItem(JARAK_LS) || "null")); } catch (e) {} shared.sha = f.sha; shared.at = +state._savedAt || 0; shared.src = "github";
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  unsaved = false; if (!loadSavedPlan()) planDirty = true; renderTab(); saveStatus(); // tampilkan plan terakhir yang disimpan; plan baru dibuat saat tombol "Buat Plan" diklik
  if (!quiet) toast("Data bersama terbaru dimuat dari GitHub.");
}
async function loadShared() { // saat web dibuka
  try {
    const f = await ghGetFile(); shared.ok = true; shared.sha = f.sha;
    if (!f.data) { saveStatus(); return; }
    let d; try { d = normalize(clone(f.data)); } catch (e) { console.warn("Data bersama rusak", e); saveStatus(); return; }
    shared.at = +d._savedAt || 0;
    if (unsaved) { saveStatus(); toast("Ada data bersama di GitHub. Simpan atau muat ulang untuk melihatnya.", 5000); return; }
    if (shared.at >= (+state._savedAt || 0)) applyShared({ sha: f.sha, data: f.data }, true);
    else saveStatus();
  } catch (e) { shared.ok = false; console.warn("Data bersama GitHub tidak bisa dimuat", e); saveStatus(); }
  finally { sharedChecked = true; } // jarak jalan diambil setelah "Buat Plan" diklik, bukan saat web dibuka
}
function saveLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); return true; }
  catch (e) { toast("Gagal menyimpan: penyimpanan browser penuh atau diblokir.", 5000); return false; }
}
/* Plan terakhir ikut disimpan (di browser & GitHub) agar langsung tampil saat web dibuka, tanpa menghitung ulang. */
function inputSig(st) { // sidik data input (tanpa plan tersimpan / cap waktu / cache jarak)
  const txt = JSON.stringify(st, (k, v) => k === "savedPlan" || k === "_savedAt" || k === "_stamp" || k === "jarakJalan" ? undefined : v);
  let h = 5381; for (let i = 0; i < txt.length; i++) h = (h * 33 + txt.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + ":" + txt.length;
}
function packPlans() {
  if (!planWeeks || !planWeeks.length || planWeeks.some(P => !P || P.error)) return undefined;
  const rep = (k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof v.id === "string") {
      if ("antaran" in v || "beratKg" in v) { const d = Object.assign({}, v); delete d.id; return { $s: v.id, d }; }
      if ("kapasitasKg" in v) { const d = Object.assign({}, v); delete d.id; return { $v: v.id, d }; }
    }
    return typeof v === "number" && !isFinite(v) ? null : v;
  };
  try { return { at: Date.now(), sig: inputSig(state), weekSel, meta: planWeeks.meta || null, weeks: JSON.parse(JSON.stringify(planWeeks.slice(), rep)) }; } catch (e) { console.warn("Plan tidak bisa disimpan", e); return undefined; }
}
function unpackPlans(SP) {
  const memo = {}, fix = o => {
    if (Array.isArray(o)) return o.map(fix);
    if (!o || typeof o !== "object") return o;
    if (typeof o.$s === "string") { const k = "s" + o.$s; if (memo[k]) return memo[k]; const d = isObj(o.d) ? o.d : {}; const st = state.stores.find(x => x.id === o.$s && x.lat === d.lat && x.lng === d.lng); return memo[k] = st || Object.assign({ id: o.$s }, d); }
    if (typeof o.$v === "string") { const k = "v" + o.$v; if (memo[k]) return memo[k]; const d = isObj(o.d) ? o.d : {}; return memo[k] = state.vehicles.find(x => x.id === o.$v) || Object.assign({ id: o.$v }, d); }
    const r = {}; for (const k in o) r[k] = fix(o[k]); return r;
  };
  const W = SP.weeks.map(fix); if (W.some(P => !isObj(P) || !Array.isArray(P.trips) || !Array.isArray(P.unserved) || !isObj(P.depot))) throw new Error("plan tersimpan rusak");
  W.forEach(P => { if (!(+P.H >= 60)) { P.nMinggu = P.H; P.H = (+state.params.jamShift || 8) * 60; } }); // plan lama: H sempat terisi jumlah minggu
  W.meta = isObj(SP.meta) ? SP.meta : { H: W.length, off: {} }; return W;
}
function loadSavedPlan() { // tampilkan plan terakhir yang disimpan (tanpa menghitung ulang)
  stopDeep(); plan = null; planWeeks = null;
  if (!state.savedPlan) return false;
  try { const W = unpackPlans(state.savedPlan); planWeeks = W; weekCache.meta = W.meta; weekSel = Math.min(W.length - 1, Math.max(0, +state.savedPlan.weekSel || 0)); plan = W[weekSel]; planDirty = state.savedPlan.sig !== inputSig(state); planSavedAt = +state.savedPlan.at || 0; mapDrawn = null; return true; }
  catch (e) { console.warn(e); plan = null; planWeeks = null; return false; }
}
async function commitSave(force) {
  if (saving) return false;
  state._savedAt = Date.now();
  { const SP = packPlans(); if (SP) state.savedPlan = SP; } // plan yang sedang tampil ikut disimpan
  if (!saveLocal()) return false;
  if (!ghToken()) {
    shared.src = "lokal"; unsaved = false; saveStatus();
    toast("Tersimpan di browser ini saja. Untuk menyimpan bersama, buka menu Data → Simpan bersama (GitHub).", 4500);
    return true;
  }
  saving = true; saveStatus();
  try {
    const cur = await ghGetFile();
    if (!force && cur.sha && cur.sha !== shared.sha) { saving = false; saveStatus(); ghConflict(cur); return false; }
    shared.sha = await ghPutFile(state, cur.sha); shared.at = state._savedAt; shared.ok = true; shared.src = "github";
    saving = false; unsaved = false; saveStatus(); toast("Tersimpan ke GitHub. Semua yang membuka link ini akan melihat data ini.", 3500);
    return true;
  } catch (e) {
    saving = false; unsaved = true; shared.src = "lokal";
    if (e.status === 409 || e.status === 422) { try { const cur = await ghGetFile(); saveStatus(); ghConflict(cur); return false; } catch (e2) {} }
    saveStatus();
    const why = e.status === 401 ? "token tidak valid atau kedaluwarsa" : e.status === 403 || e.status === 404 ? "token tidak punya izin tulis (Contents: Read and write) ke repo ini" : "koneksi ke GitHub gagal";
    toast("Tersimpan di browser ini, tetapi gagal ke GitHub: " + why + ".", 6000);
    return false;
  }
}
function ghConflict(cur) {
  askConfirm("Data di GitHub sudah diubah orang lain sejak Anda membukanya. Timpa dengan data Anda, atau muat data terbaru (perubahan Anda yang belum tersimpan akan hilang)?", [
    ["Timpa dengan data saya", () => { shared.sha = cur.sha; commitSave(true); }],
    ["Muat data terbaru", () => { if (cur.data) applyShared(cur); else toast("Data di GitHub kosong."); }]
  ]);
}
function saveStatus() {
  const b = document.getElementById("btnSave"), st = document.getElementById("saveState"); if (!b || !st) return;
  b.classList.toggle("primary", unsaved); b.classList.toggle("dirty", unsaved); b.disabled = saving;
  b.textContent = saving ? "Menyimpan…" : "💾 Simpan";
  const t = state._savedAt ? new Date(state._savedAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  const gh = shared.src === "github" && shared.at && shared.at === state._savedAt;
  st.textContent = saving ? "Menyimpan ke GitHub…" : unsaved ? "Belum disimpan" : !t ? "Belum pernah disimpan" : (gh ? "☁ Data bersama · " : ghToken() ? "Belum terkirim ke GitHub · " : "Tersimpan di browser ini · ") + t;
  st.title = ghToken() ? "Token GitHub terpasang: Simpan menyimpan ke repo." : "Tanpa token GitHub: Simpan hanya menyimpan di browser ini. Menu Data → Simpan bersama (GitHub).";
  st.className = "savestate" + (unsaved || (!gh && t && ghToken()) ? " warn" : gh ? " gh" : "");
}
/* Dialog token GitHub */
function ghDialog() {
  const d = $("#ghDlg"); $("#ghTok").value = ""; $("#ghTok").placeholder = ghToken() ? "Token sudah terpasang (isi untuk mengganti)" : "github_pat_…";
  ghStat(ghToken() ? "Token terpasang di browser ini." : "Belum ada token. Simpan hanya ke browser ini.", "");
  if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
}
function ghStat(msg, cls) { const g = $("#ghStatus"); g.textContent = msg; g.className = "gst" + (cls ? " " + cls : ""); }
async function ghTest() {
  const r = await fetch(GH_API, { headers: ghHeaders(), cache: "no-store" });
  if (r.status === 401) return [false, "Token tidak valid atau kedaluwarsa."];
  if (!r.ok) return [false, "Repo tidak bisa diakses dengan token ini (" + r.status + "). Pastikan repo perencana-distribusi dipilih."];
  const j = await r.json();
  return j.permissions && j.permissions.push ? [true, "Token aktif dan bisa menyimpan ke repo. Tekan 💾 Simpan untuk menyimpan bersama."] : [false, "Token hanya bisa membaca. Ubah izin Contents menjadi Read and write."];
}
$("#ghSaveTok").onclick = async () => {
  const v = $("#ghTok").value.trim();
  if (v) { if (!/^[A-Za-z0-9_]{20,255}$/.test(v)) return ghStat("Format token tidak dikenali. Salin ulang token dari GitHub.", "bad"); try { localStorage.setItem(LS_KEY + "-gh-token", v); } catch (e) { return ghStat("Browser memblokir penyimpanan token.", "bad"); } }
  if (!ghToken()) return ghStat("Tempel token terlebih dahulu.", "bad");
  ghStat("Mengetes token…", "");
  try { const [ok, msg] = await ghTest(); ghStat(msg, ok ? "ok" : "bad"); $("#ghTok").value = ""; $("#ghTok").placeholder = "Token sudah terpasang (isi untuk mengganti)"; }
  catch (e) { ghStat("Tidak bisa menghubungi GitHub dari sini. Token tetap tersimpan; coba lagi nanti.", "bad"); }
  saveStatus();
};
$("#ghDel").onclick = () => { try { localStorage.removeItem(LS_KEY + "-gh-token"); } catch (e) {} $("#ghTok").value = ""; $("#ghTok").placeholder = "github_pat_…"; ghStat("Token dihapus dari browser ini. Simpan hanya ke browser ini.", ""); saveStatus(); };
window.addEventListener("beforeunload", e => { if (unsaved) { e.preventDefault(); e.returnValue = ""; } });
document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); commitSave(); } });
function toast(msg, ms = 2600) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); }

/* ---------- binding generik ---------- */
function getPath(path) { return path.split(".").reduce((o, k) => o == null ? o : o[k], state); }
function setPath(path, val) { const ks = path.split("."); const last = ks.pop(); const o = ks.reduce((o, k) => o[k], state); o[last] = val; }
document.addEventListener("input", e => {
  const el = e.target; if (!el.dataset || !el.dataset.k) return;
  let v;
  if (el.type === "checkbox") v = el.checked;
  else if (el.dataset.t === "num") v = el.value === "" ? null : parseFloat(String(el.value).replace(",", "."));
  else v = el.value;
  setPath(el.dataset.k, v);
  // tampilan turunan
  if (el.dataset.ton) { const s = document.getElementById(el.dataset.ton); if (s) s.textContent = ton(v); }
  if (el.dataset.link) onLink(el, v);
  if (el.dataset.alamat != null) { const st = state.stores[+el.dataset.alamat]; if (st) st.alamatAuto = false; }
  save();
});
document.addEventListener("change", e => {
  const el = e.target; if (!el.dataset || !el.dataset.k) return;
  if (el.dataset.rerender) renderTab();
});
document.addEventListener("click", e => {
  const chip = e.target.closest("[data-chip]");
  if (chip) {
    const [path, idx] = chip.dataset.chip.split("|"); const i = +idx;
    if (chip.dataset.mode === "list") {
      const arr = getPath(path); const at = arr.indexOf(i);
      if (at >= 0) arr.splice(at, 1); else { arr.push(i); arr.sort((a, b) => a - b); }
      chip.classList.toggle("on", arr.includes(i));
    } else {
      const arr = getPath(path); arr[i] = !arr[i]; chip.classList.toggle("on", !!arr[i]);
    }
    save(); if (chip.dataset.rerender) renderTab();
    const m = path.match(/^stores\.(\d+)\.hariOperasi$/); if (m) { const n = document.getElementById("op" + m[1]); if (n) n.innerHTML = opsNote(state.stores[+m[1]]); }
    return;
  }
  const del = e.target.closest("[data-del]");
  if (del) { const [path, idx] = del.dataset.del.split("|"); getPath(path).splice(+idx, 1); save(); renderTab(); return; }
});

/* Alamat otomatis dari koordinat (reverse geocoding OpenStreetMap/Nominatim, maks. 1 permintaan per detik) */
let geoLast = 0; const geoTimers = {};
function fmtAlamat(ad) {
  if (!ad) return "";
  const jalan = ad.road ? ad.road + (ad.house_number ? " No. " + ad.house_number : "") : (ad.commercial || ad.industrial || ad.amenity || ad.neighbourhood || "");
  const parts = [jalan, ad.suburb || ad.village || ad.hamlet, ad.city_district || ad.district || ad.municipality || ad.town || ad.village];
  return parts.filter((x, i, arr) => x && arr.indexOf(x) === i).join(", ");
}
// 98 kota (bukan kabupaten) di Indonesia; OSM kadang menandai ibu kota kabupaten sebagai "city"
const KOTA_ID = new Set("banda aceh,langsa,lhokseumawe,sabang,subulussalam,binjai,gunungsitoli,medan,padangsidimpuan,pematangsiantar,sibolga,tanjungbalai,tebing tinggi,bukittinggi,padang,padang panjang,pariaman,payakumbuh,sawahlunto,solok,dumai,pekanbaru,batam,tanjungpinang,jambi,sungai penuh,bengkulu,lubuklinggau,pagar alam,palembang,prabumulih,pangkalpinang,bandar lampung,metro,cilegon,serang,tangerang,tangerang selatan,jakarta barat,jakarta pusat,jakarta selatan,jakarta timur,jakarta utara,bandung,banjar,bekasi,bogor,cimahi,cirebon,depok,sukabumi,tasikmalaya,magelang,pekalongan,salatiga,semarang,surakarta,solo,tegal,yogyakarta,batu,blitar,kediri,madiun,malang,mojokerto,pasuruan,probolinggo,surabaya,denpasar,bima,mataram,kupang,pontianak,singkawang,palangka raya,banjarbaru,banjarmasin,balikpapan,bontang,samarinda,tarakan,bitung,kotamobagu,manado,tomohon,gorontalo,palu,makassar,palopo,parepare,baubau,kendari,ambon,tual,ternate,tidore kepulauan,jayapura,sorong".split(","));
function fmtKota(ad) {
  if (!ad) return "";
  const pre = (n, p) => /^(kota|kabupaten|kab\.)\s/i.test(n) ? n.replace(/^kab\.\s*/i, "Kabupaten ") : p + " " + n;
  const kab = ad.county || ad.regency, kota = ad.city;
  if (kab) return pre(kab, "Kabupaten");
  if (kota) return pre(kota, KOTA_ID.has(kota.toLowerCase().replace(/^kota\s+/, "").trim()) ? "Kota" : "Kabupaten");
  return "";
}
async function reverseGeocode(lat, lng) {
  const wait = 1100 - (Date.now() - geoLast); if (wait > 0) await new Promise(r => setTimeout(r, wait));
  geoLast = Date.now();
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=id&lat=" + lat + "&lon=" + lng);
    if (r.ok) { const j = await r.json(); const s = fmtAlamat(j.address); if (s) return { alamat: s, kota: fmtKota(j.address) }; }
  } catch (e) {}
  try { // cadangan: Photon (Komoot)
    const r = await fetch("https://photon.komoot.io/reverse?lat=" + lat + "&lon=" + lng);
    const p = (await r.json()).features[0].properties;
    const al = [p.street || p.name, p.district || p.locality].filter(Boolean).join(", ");
    return al ? { alamat: al, kota: p.county ? fmtKota({ county: p.county }) : fmtKota({ city: p.city }) } : null;
  } catch (e) { return null; }
}
async function isiAlamat(s, i) {
  if (s.lat == null || s.lng == null) return false;
  let msg = document.getElementById("lm" + i);
  if (msg) { msg.className = "msg"; msg.textContent = "Mencari alamat…"; }
  const lat = s.lat, lng = s.lng;
  const g = await reverseGeocode(lat, lng);
  if (s.lat !== lat || s.lng !== lng) return false; // link sudah diganti lagi
  const al = g && g.alamat;
  if (!al) { if (msg) { msg.className = "msg bad"; msg.textContent = "Koordinat terbaca, alamat tidak ditemukan (isi manual)"; } return false; }
  if (s.alamatAuto !== false || !s.alamat) { s.alamat = al; s.alamatAuto = true; }
  if (g.kota) s.kota = g.kota;
  save();
  i = state.stores.indexOf(s); if (i < 0) return true; // baris bisa bergeser selama menunggu
  msg = document.getElementById("lm" + i);
  const inp = document.querySelector(`[data-k="stores.${i}.alamat"]`); if (inp) { inp.value = s.alamat; inp.title = s.alamat; }
  const kt = document.getElementById("kt" + i); if (kt) { kt.value = s.kota || ""; kt.title = s.kota || ""; }
  if (msg) { msg.className = "msg ok"; msg.textContent = "Koordinat, alamat & kota terisi otomatis"; }
  return true;
}
function onLink(el, v) {
  const i = +el.dataset.link; const s = state.stores[i]; const msg = document.getElementById("lm" + i);
  const r = parseKoordinat(v);
  if (r && r.lat != null) {
    const moved = s.lat !== r.lat || s.lng !== r.lng;
    s.lat = r.lat; s.lng = r.lng;
    if (moved) { // lokasi baru: kosongkan alamat/kota lama supaya tidak menyesatkan bila pencarian gagal
      s.kota = ""; const kt = document.getElementById("kt" + i); if (kt) kt.value = "";
      if (s.alamatAuto !== false) { s.alamat = ""; const ai = document.querySelector(`[data-k="stores.${i}.alamat"]`); if (ai) ai.value = ""; }
    }
    const la = document.getElementById("lat" + i), lo = document.getElementById("lng" + i);
    if (la) la.value = r.lat; if (lo) lo.value = r.lng;
    if (msg) { msg.className = "msg ok"; msg.textContent = "Koordinat terbaca"; }
    clearTimeout(geoTimers[i]); geoTimers[i] = setTimeout(() => isiAlamat(s, i), 700);
  } else if (msg) {
    if (!v) { msg.textContent = ""; }
    else if (r && r.short) { msg.className = "msg bad"; msg.textContent = "Link pendek: buka link, lalu salin URL lengkap dari address bar"; }
    else { msg.className = "msg bad"; msg.textContent = "Koordinat tidak ditemukan di link"; }
  }
}

/* ---------- tab ---------- */
function setTab(t) {
  tab = t;
  document.body.dataset.tab = t;
  document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"));
  document.querySelectorAll("main > .panel").forEach(p => p.hidden = p.id !== "p-" + t);
  try { localStorage.setItem(LS_KEY + "-tab", t); } catch (e) {}
  renderTab();
  try { if (location.hash.slice(1) !== t) history.replaceState(null, "", "#" + t); } catch (e) {}
}
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (h && h !== tab && document.getElementById("p-" + h)) setTab(h); });

function renderTab() {
  ({ kendaraan: renderKendaraan, store: renderStore, istirahat: renderIstirahat, parameter: renderParameter, plan: renderPlan, gantt: renderGantt, peta: renderPeta })[tab]();
}
function markDirty() {
  const b = document.getElementById("dirtyBanner"); if (b) b.hidden = !planDirty;
}
function dirtyBanner() { return `<div class="banner warn" id="dirtyBanner" ${planDirty ? "" : "hidden"}><b>Data input berubah.</b> Hasil di bawah memakai data lama. <button class="btn sm" type="button" onclick="runPlan();renderTab()">Buat ulang plan</button></div>`; }

/* Parameter: pembagian tugas kendaraan (prioritas solar & fairness) */
const FAIR_K = [["rit", "Jumlah shift (rit)"], ["toko", "Jumlah toko dikunjungi"], ["jam", "Jam kerja"], ["kg", "Total muatan"], ["km", "Jarak tempuh"], ["s2", "Jumlah Shift 2 (pulang malam)"]];
function tugasCard(p) {
  const F = p.fairness, PS = p.prioritasSolar;
  const lvl = (k, v) => `<select class="in" data-k="${k}" style="max-width:150px">${[["ringan", "Ringan"], ["sedang", "Sedang"], ["kuat", "Kuat"]].map(([a, b]) => `<option value="${a}" ${v === a ? "selected" : ""}>${b}</option>`).join("")}</select>`;
  const nB = state.vehicles.filter(v => v.aktif !== false && v.bbm === "Bensin").length, nS = state.vehicles.filter(v => v.aktif !== false && v.bbm !== "Bensin").length;
  return `<div class="card pad" style="display:grid;gap:14px;align-content:start">
      <h3>Pembagian tugas kendaraan</h3>
      <div class="field"><label class="chk"><input type="checkbox" data-k="params.optimasiMendalam" ${p.optimasiMendalam !== false ? "checked" : ""}> <b>Optimasi mendalam</b></label>
        <p class="hint">Setelah plan cepat tampil, mesin mencoba lebih banyak variasi awal (multi-start), memindah store antar hari di tiap variasi, lalu "bongkar &amp; susun ulang" sekelompok store berdekatan berulang kali. Butuh sekitar 10–20 detik di latar; plan diganti otomatis bila ditemukan yang lebih efisien. Semua aturan (kapasitas, jam, radius, solar, fairness) tetap dipatuhi.</p></div>
      <div class="field"><label class="chk"><input type="checkbox" data-k="params.prioritasSolar.aktif" ${PS.aktif !== false ? "checked" : ""} data-rerender="1"> <b>Utamakan kendaraan solar</b></label>
        <p class="hint">Tugas lebih banyak diberikan ke kendaraan berbahan bakar solar; kendaraan bensin dipakai bila perlu. Saat ini: ${nS} solar, ${nB} bensin (atur di tab Kendaraan).${nB && nS ? "" : " <i>Belum berpengaruh karena semua kendaraan aktif berbahan bakar sama.</i>"}</p>
        ${PS.aktif !== false ? `<div class="row"><span class="hint" style="min-width:80px">Tingkat</span>${lvl("params.prioritasSolar.tingkat", PS.tingkat)}</div>` : ""}</div>
      <div class="field"><label class="chk"><input type="checkbox" data-k="params.fairness.aktif" ${F.aktif ? "checked" : ""} data-rerender="1"> <b>Fairness (pemerataan beban antar kendaraan)</b></label>
        <p class="hint">Beban dibuat lebih adil antar kendaraan, setelah semua store terlayani. Makin kuat, makin merata, tetapi jarak & jam kerja total bisa sedikit bertambah.${PS.aktif !== false ? " Bila prioritas solar aktif, kendaraan bensin mendapat porsi lebih kecil." : ""}</p>
        ${F.aktif ? `<div class="row"><span class="hint" style="min-width:80px">Tingkat</span>${lvl("params.fairness.tingkat", F.tingkat)}</div>
        <div class="fairk">${FAIR_K.map(([k, l]) => `<label class="chk"><input type="checkbox" data-k="params.fairness.${k}" ${F[k] ? "checked" : ""}> ${l}</label>`).join("")}</div>
        <label class="chk"><input type="checkbox" data-k="params.fairness.kgRelatif" ${F.kgRelatif !== false ? "checked" : ""}> Muatan dihitung sebagai % kapasitas kendaraan <span class="hint">(disarankan bila kapasitas kendaraan berbeda)</span></label>` : ""}</div>
    </div>`;
}

/* ---------- 1. Kendaraan ---------- */
function renderKendaraan() {
  const el = $("#p-kendaraan");
  const rows = state.vehicles.map((v, i) => `<tr>
    <td><input type="checkbox" data-k="vehicles.${i}.aktif" ${v.aktif !== false ? "checked" : ""} aria-label="Aktif"></td>
    <td><input class="in" list="jenisList" data-k="vehicles.${i}.jenis" value="${esc(v.jenis)}" style="min-width:130px"></td>
    <td><input class="in mono" data-k="vehicles.${i}.plat" value="${esc(v.plat)}" style="min-width:110px"></td>
    <td><input class="in num" type="number" min="0" step="50" data-t="num" data-k="vehicles.${i}.kapasitasKg" data-ton="vt${i}" value="${v.kapasitasKg ?? ""}" style="min-width:90px"><span class="sub" id="vt${i}">${ton(v.kapasitasKg)}</span></td>
    <td><input class="in num" type="number" min="1" step="1" data-t="num" data-k="vehicles.${i}.kecepatan" value="${v.kecepatan ?? ""}" style="min-width:70px"></td>
    <td><input class="in num" type="number" min="1" max="4" step="1" data-t="num" data-k="vehicles.${i}.maksShift" value="${v.maksShift ?? 1}" style="min-width:60px"></td>
    <td><input class="in num" type="number" min="0" step="1" data-t="num" data-k="vehicles.${i}.maksKmRit" value="${v.maksKmRit ?? ""}" placeholder="bebas" style="min-width:80px"></td>
    <td><input class="in num" type="number" min="0" step="1" data-t="num" data-k="vehicles.${i}.maksRadiusKm" value="${v.maksRadiusKm ?? ""}" placeholder="bebas" style="min-width:80px"></td>
    <td><select class="in" data-k="vehicles.${i}.bbm" style="min-width:100px">${["Solar", "Bensin"].map(b => `<option ${v.bbm === b ? "selected" : ""}>${b}</option>`).join("")}</select></td>
    <td><button class="btn icon" type="button" data-del="vehicles|${i}" aria-label="Hapus">✕</button></td></tr>`).join("");
  const totCap = state.vehicles.filter(v => v.aktif !== false).reduce((a, v) => a + (+v.kapasitasKg || 0), 0);
  el.innerHTML = `<div class="head"><div><h2>1 · Data Kendaraan</h2><p>Jenis, plat, kapasitas muatan (kg, otomatis dikonversi ke ton), dan kecepatan rata-rata. <b>Maks shift/hari</b> = berapa rit (shift) yang boleh dijalankan unit ini dalam sehari. <b>Bahan bakar</b>: kendaraan solar diutamakan mendapat tugas. <b>Maks km/rit</b> dan <b>Maks radius</b> (km jalan dari gudang) membatasi kendaraan ke rute pendek, misalnya pickup agar hemat BBM. Kosongkan bila tanpa batas.</p></div>
    <button class="btn" type="button" id="addV">＋ Tambah kendaraan</button></div>
    <div class="card tbl-wrap lock"><table>
    <thead><tr><th>Aktif</th><th>Jenis kendaraan</th><th>Nomor plat</th><th class="num">Kapasitas (kg)</th><th class="num">Kecepatan (km/jam)</th><th class="num">Maks shift/hari</th><th class="num" title="Total km jalan pulang-pergi dalam satu rit. Kosong = tanpa batas">Maks km/rit</th><th class="num" title="Hanya store dalam jarak jalan ini dari gudang. Kosong = tanpa batas">Maks radius (km)</th><th title="Kendaraan solar diutamakan mendapat tugas (atur di tab Parameter)">Bahan bakar</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="10" class="empty">Belum ada kendaraan. Klik "Tambah kendaraan".</td></tr>`}</tbody></table></div>
    <p class="hint">Total kapasitas armada aktif: <b>${fmtNum(totCap)} kg (${ton(totCap)})</b> per rit. Kecepatan dipakai sebagai dasar, lalu disesuaikan dengan faktor macet di tab Parameter.</p>
    <datalist id="jenisList">${JENIS.map(j => `<option value="${j}">`).join("")}</datalist>`;
  $("#addV").onclick = () => { state.vehicles.push({ id: uid("v"), aktif: true, jenis: "Pickup", plat: "", kapasitasKg: 1000, kecepatan: 40, maksShift: 1, bbm: "Solar" }); save(); renderKendaraan(); };
}

/* ---------- 2. Store ---------- */
const PERIODE_VAL = { 2: 0.5, 3: 0.33333, 4: 0.25, 5: 0.2 };
function frekText(s) { const N = periodeOf(s); if (N > 1) return "1x " + N + " minggu"; const f = Math.round(+s.frek || 0); return f > 0 ? f + "x seminggu" : "Tidak dikirim"; }
function parseFrek(txt) { // "2x seminggu", "1x 2 minggu", "1x/3 minggu", "4 mingguan", "Tidak dikirim"
  const t = String(txt || "").toLowerCase().trim();
  if (/tidak/.test(t)) return 0;
  let m = t.match(/(?:1\s*x\s*[/ ]?\s*)?(?:per|tiap|setiap)?\s*([2-5])\s*(?:minggu|mgg|pekan)/); if (m && !/seminggu/.test(t)) return PERIODE_VAL[+m[1]];
  m = t.match(/(\d+)/); return m ? Math.max(0, Math.min(7, parseInt(m[1]))) : 0;
}
function frekOptions(v) {
  const D = state.params.hari.filter(Boolean).length, N = periodeOf({ frek: v }); v = N > 1 ? -1 : Math.round(+v || 0);
  let h = `<option value="0" ${v === 0 ? "selected" : ""}>Tidak dikirim</option>`;
  for (let n = 1; n <= 7; n++) h += `<option value="${n}" ${v === n ? "selected" : ""}>${n}x seminggu${n === D ? " (tiap hari)" : n > D ? " – melebihi hari kerja" : ""}</option>`;
  for (let k = 2; k <= 5; k++) h += `<option value="${PERIODE_VAL[k]}" ${N === k ? "selected" : ""}>1x ${k} minggu</option>`;
  return h;
}
function mingguSel(s, i) { // minggu kirim untuk store 1x per 2–5 minggu
  const N = periodeOf(s); if (N < 2) return "";
  const auto = weekCache.meta && weekCache.meta.off[s.id] != null ? " (" + (weekCache.meta.off[s.id] + 1) + ")" : "";
  return `<div class="row" style="gap:6px;margin-top:4px"><span class="hint">Minggu ke</span><select class="in" data-k="stores.${i}.mingguKe" data-t="num" style="max-width:110px" title="Minggu pertama pengiriman dalam siklus ${N} minggu. Otomatis = dibagi rata agar beban tiap minggu seimbang."><option value="" ${!s.mingguKe ? "selected" : ""}>Otomatis${auto}</option>${Array.from({ length: N }, (_, k) => `<option value="${k + 1}" ${+s.mingguKe === k + 1 ? "selected" : ""}>${k + 1}</option>`).join("")}</select></div>`;
}
function opsNote(s) {
  const n = (s.hariOperasi || []).filter(d => state.params.hari[d]).length, f = Math.round(+s.frek || 0);
  if (!n) return '<span class="bad">Tidak ada hari aktif: store tidak diantar</span>';
  if (f > n) return `<span class="bad">Frekuensi ${f}x &gt; ${n} hari aktif, dibatasi ${n}x</span>`;
  return "";
}
function jadwalCell(s) {
  if (!plan || plan.error || !plan.trips) return '<span class="off">klik Buat Plan</span>';
  if (planWeeks && planWeeks.length > 1) { // tampilkan per minggu
    const parts = []; let miss = 0;
    planWeeks.forEach((P, w) => { if (!P || P.error) return; const ds = [...new Set(P.trips.filter(t => t.stops.some(x => x.store.id === s.id)).map(t => t.day))].sort((a, b) => a - b); miss += P.unserved.filter(u => u.store.id === s.id).length; if (ds.length) parts.push("M" + (w + 1) + ": " + ds.map(d => HARI3[d]).join(", ")); });
    if (!parts.length && !miss) return '<span class="off">–</span>';
    const txt = periodeOf(s) > 1 ? parts.join(" · ") : (parts.length === planWeeks.length && new Set(parts.map(x => x.split(": ")[1])).size === 1 ? "Tiap minggu: " + parts[0].split(": ")[1] : parts.join(" · "));
    return `<span title="${esc(parts.join("\n"))}">${esc(txt)}</span>` + (miss ? ` <span class="pill bad">${miss} tak terlayani</span>` : "");
  }
  const ds = [...new Set(plan.trips.filter(t => t.stops.some(x => x.store.id === s.id)).map(t => t.day))].sort((a, b) => a - b);
  const miss = plan.unserved.filter(u => u.store.id === s.id).length;
  if (!ds.length && !miss) return '<span class="off">–</span>';
  return ds.map(d => HARI3[d]).join(", ") + (miss ? ` <span class="pill bad">${miss} tak terlayani</span>` : "");
}

let storeFilter = "";
function renderStore() {
  try { weekCache.meta = weekMeta(state); } catch (e) {}
  const el = $("#p-store");
  const f = storeFilter.toLowerCase();
  const list = state.stores.map((s, i) => [s, i]).filter(([s]) => !f || (s.nama || "").toLowerCase().includes(f) || (s.alamat || "").toLowerCase().includes(f) || (s.kota || "").toLowerCase().includes(f));
  const rows = list.map(([s, i]) => {
    const origin = s.antaran === "Origin";
    return `<tr>
    <td><input type="checkbox" data-k="stores.${i}.aktif" ${s.aktif !== false ? "checked" : ""} aria-label="Aktif"></td>
    <td><input class="in" data-k="stores.${i}.nama" value="${esc(s.nama)}" style="min-width:190px"></td>
    <td><input class="in" data-k="stores.${i}.alamat" data-alamat="${i}" value="${esc(s.alamat)}" title="${esc(s.alamat || "")}" placeholder="Terisi otomatis dari link" style="min-width:240px"></td>
    <td><input class="in auto" id="kt${i}" data-k="stores.${i}.kota" value="${esc(s.kota || "")}" title="${esc(s.kota || "Terisi otomatis dari link titik maps")}" placeholder="Otomatis" readonly tabindex="-1" style="min-width:150px"></td>
    <td><input class="in mono" data-k="stores.${i}.link" data-link="${i}" value="${esc(s.link)}" placeholder="Tempel link Google Maps" style="min-width:200px"><div class="msg" id="lm${i}"></div></td>
    <td><input class="in num auto" id="lat${i}" type="number" step="any" data-t="num" data-k="stores.${i}.lat" value="${s.lat ?? ""}" readonly tabindex="-1" title="Terisi otomatis dari link titik maps" style="min-width:118px"></td>
    <td><input class="in num auto" id="lng${i}" type="number" step="any" data-t="num" data-k="stores.${i}.lng" value="${s.lng ?? ""}" readonly tabindex="-1" title="Terisi otomatis dari link titik maps" style="min-width:128px"></td>
    <td><input class="in mono" type="time" data-k="stores.${i}.buka" value="${esc(s.buka)}" style="min-width:86px"></td>
    <td><input class="in mono" type="time" data-k="stores.${i}.tutup" value="${esc(s.tutup)}" style="min-width:86px"></td>
    <td><input class="in num" type="number" min="0" step="any" data-t="num" data-k="stores.${i}.beratKg" data-ton="st${i}" value="${s.beratKg ?? ""}" ${origin ? "disabled" : ""} style="min-width:80px"><span class="sub" id="st${i}">${origin ? "" : ton(s.beratKg)}</span></td>
    <td>${origin ? '<span class="off">–</span>' : `<select class="in" data-k="stores.${i}.frek" data-t="num" data-rerender="1" style="min-width:150px">${frekOptions(s.frek)}</select>${mingguSel(s, i)}`}</td>
    <td class="mono" style="white-space:nowrap">${origin ? "" : jadwalCell(s)}</td>
    <td><select class="in" data-k="stores.${i}.antaran" data-rerender="1" style="min-width:96px"><option ${!origin ? "selected" : ""}>Tujuan</option><option ${origin ? "selected" : ""}>Origin</option></select></td>
    <td><select class="in" data-k="stores.${i}.loading" ${origin ? "disabled" : ""} style="min-width:150px"><option value="Menurunkan" ${s.loading !== "Menaikkan" ? "selected" : ""}>Menurunkan barang</option><option value="Menaikkan" ${s.loading === "Menaikkan" ? "selected" : ""}>Menaikkan barang</option></select></td>
    <td>${origin ? '<span class="off">gudang</span>' : `<div class="days">${HARI3.map((h, d) => `<button type="button" class="dchip ${s.hariOperasi.includes(d) ? "on" : ""}" data-mode="list" data-chip="stores.${i}.hariOperasi|${d}" title="${HARI[d]}${state.params.hari[d] ? "" : " (bukan hari distribusi)"}" ${state.params.hari[d] ? "" : "disabled"}>${h}</button>`).join("")}</div><div class="msg" id="op${i}">${opsNote(s)}</div>`}</td>
    <td><button class="btn icon" type="button" data-del="stores|${i}" aria-label="Hapus">✕</button></td></tr>`;
  }).join("");
  const act = state.stores.filter(s => s.aktif !== false && s.antaran !== "Origin");
  const wk = act.reduce((a, s) => a + (+s.beratKg || 0) * (+s.frek || 0), 0);
  const nOrigin = state.stores.filter(s => s.aktif !== false && s.antaran === "Origin").length;
  el.innerHTML = `<div class="head"><div><h2>2 · Data Store</h2><p>Tempel link Google Maps: alamat, kota/kabupaten, latitude, dan longitude terisi otomatis. Satu baris <b>Origin</b> = gudang asal.</p><details class="help"><summary>Petunjuk kolom</summary>Jenis Antaran <b>Origin</b> = gudang asal (titik berangkat &amp; kembali). Loading <b>Menaikkan barang</b> (mis. ambil dari PRODUKSI) selalu jadi titik terakhir rit. <b>Frekuensi kirim</b> (1x–7x seminggu, atau 1x per 2/3/4/5 minggu) menentukan berapa kali store dikunjungi. Untuk 1x per 2–5 minggu, plan dibuat per minggu dalam satu siklus dan minggu kirimnya dibagi rata otomatis (bisa dikunci di "Minggu ke"); harinya dibagi rata otomatis (mis. 2x = Senin &amp; Kamis, 3x = Senin, Rabu, Jumat) sambil menyeimbangkan beban armada. <b>Hari beroperasi</b> = hari store buka/menerima kiriman; store hanya diantar di hari yang aktif (hitam). Hari kirim dipilih otomatis di antara hari aktif sesuai frekuensi, mis. aktif Sen–Jum dengan 2x seminggu = Senin &amp; Kamis.</details></div>
    <input class="in" id="storeSearch" placeholder="Cari store…" value="${esc(storeFilter)}" style="max-width:200px;padding:9px">
    <button class="btn" type="button" id="geoAll" title="Isi alamat semua store dari koordinatnya">⟳ Isi alamat otomatis</button>
    </div>
    <div class="addways">
      <div class="card way"><div><b>Cara 1 · Manual</b><span class="hint">Tambah satu baris, lalu isi nama dan tempel link titik maps.</span></div><button class="btn primary" type="button" id="addS">＋ Tambah store</button></div>
      <div class="card way"><div><b>Cara 2 · Upload Excel</b><span class="hint">Nama sama = diperbarui, nama baru = ditambah, store lain tetap ada.</span>${lastImport ? `<span class="imp ok">✓ ${esc(lastImport)}</span>` : ""}</div><div class="btns"><button class="btn" type="button" id="tplS">⤓ Unduh template</button><button class="btn primary" type="button" id="upS">⤒ Upload Excel</button></div></div>
    </div>
    ${nOrigin === 0 ? `<div class="banner bad"><b>Belum ada Origin.</b> Tandai gudang dengan Jenis Antaran "Origin".</div>` : nOrigin > 1 ? `<div class="banner warn">Ada ${nOrigin} titik Origin aktif. Yang dipakai hanya yang paling atas.</div>` : ""}
    <div class="card tbl-wrap lock pin2"><table>
    <thead><tr><th>Aktif</th><th>Nama store</th><th>Alamat</th><th>Kota/Kabupaten</th><th>Link titik Maps</th><th class="num">Latitude</th><th class="num">Longitude</th><th>Buka</th><th>Tutup</th><th class="num">Berat (kg)</th><th>Frekuensi kirim</th><th title="Hari kirim yang dibentuk otomatis saat Buat Plan">Jadwal hasil plan</th><th>Antaran</th><th>Jenis loading</th><th title="Hari store buka/menerima kiriman. Store hanya diantar di hari yang aktif.">Hari beroperasi</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="15" class="empty">Tidak ada store.</td></tr>`}</tbody></table></div>
    <p class="hint">${act.length} store tujuan aktif · total muatan per minggu <b>${fmtNum(wk)} kg (${ton(wk)})</b>. Link pendek (maps.app.goo.gl) tidak bisa dibaca langsung: buka dulu di browser lalu salin URL lengkapnya, atau isi latitude/longitude manual. Untuk banyak store sekaligus, pakai <b>Cara 2 · Upload Excel</b> di atas.</p>`;
  $("#tplS").onclick = storeTemplate;
  $("#upS").onclick = () => { if (typeof XLSX === "undefined") return toast("Library Excel gagal dimuat."); $("#fileStore").click(); };
  $("#addS").onclick = () => { state.stores.push({ id: uid("s"), aktif: true, nama: "Store baru", alamat: "", link: "", lat: null, lng: null, buka: "08:00", tutup: "21:00", beratKg: 500, frek: 1, antaran: "Tujuan", loading: "Menurunkan", hariOperasi: [0, 1, 2, 3, 4, 5, 6] }); storeFilter = ""; save(); renderStore(); };
  $("#geoAll").onclick = async () => {
    const b = $("#geoAll"); if (b.disabled) return;
    const todo = state.stores.map((s, i) => [s, i]).filter(([s]) => s.lat != null && s.lng != null && (!s.alamat || !s.kota || s.alamatAuto !== false));
    if (!todo.length) { toast("Tidak ada store yang perlu diisi alamatnya"); return; }
    b.disabled = true; let ok = 0, n = 0;
    for (const [s, i] of todo) { n++; b.textContent = "Mengisi alamat " + n + "/" + todo.length + "…"; if (await isiAlamat(s, i)) ok++; }
    b.disabled = false; b.textContent = "⟳ Isi alamat otomatis"; toast(ok + " dari " + todo.length + " alamat terisi");
  };
  const ss = $("#storeSearch"); ss.oninput = () => { storeFilter = ss.value; const pos = ss.selectionStart; renderStore(); const n = $("#storeSearch"); n.focus(); n.setSelectionRange(pos, pos); };
}

/* ---------- 3. Istirahat ---------- */
function renderIstirahat() {
  const el = $("#p-istirahat");
  const cards = HARI.map((h, d) => {
    const rows = state.breaks[d].map((b, i) => `<div class="brow"><input class="in mono" type="time" data-k="breaks.${d}.${i}.mulai" value="${esc(b.mulai)}"><span class="hint">s/d</span><input class="in mono" type="time" data-k="breaks.${d}.${i}.selesai" value="${esc(b.selesai)}"><button class="btn icon" type="button" data-del="breaks.${d}|${i}" aria-label="Hapus">✕</button></div>`).join("");
    return `<div class="card daycard ${state.params.hari[d] ? "" : "off"}"><div class="hrow"><span class="dot" style="background:var(--d${d})"></span><h3>${h}</h3>${state.params.hari[d] ? "" : '<span class="pill">libur</span>'}</div>
      ${rows || '<span class="off">Tanpa jam istirahat</span>'}
      <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" type="button" data-addb="${d}">＋ Tambah istirahat</button><button class="btn sm ghost" type="button" data-copyb="${d}">Salin ke semua hari</button></div></div>`;
  }).join("");
  el.innerHTML = `<div class="head"><div><h2>3 · Hari Distribusi &amp; Jam Istirahat</h2><p>Selama jam istirahat tidak ada loading, perjalanan, maupun bongkar/muat; aktivitas berhenti lalu dilanjutkan setelahnya. Tiap hari bisa punya jam istirahat berbeda (mis. Jumat istirahat siang lebih panjang).</p></div></div>
    <div class="card pad" style="display:grid;gap:14px;align-content:start">
      <h3>Hari distribusi</h3>
      <div class="days" style="flex-wrap:wrap;gap:6px">${HARI.map((h, d) => `<button type="button" class="dchip big ${state.params.hari[d] ? "on" : ""}" data-chip="params.hari|${d}" data-rerender="1">${h}</button>`).join("")}</div>
      <span class="hint">Hari yang tidak dipilih dianggap libur (contoh: Minggu). Frekuensi antar store dibagi rata ke hari yang dipilih.</span>
    </div>
    <div class="grid3">${cards}</div>`;
  el.querySelectorAll("[data-addb]").forEach(b => b.onclick = () => { const arr = state.breaks[+b.dataset.addb]; const last = arr.reduce((m, x) => Math.max(m, toMin(x.selesai) ?? 0), 0); const st = arr.length ? Math.min(last + 60, 23 * 60) : 720; arr.push({ mulai: fmtJam(st), selesai: fmtJam(Math.min(st + 30, 1439)) }); save(); renderIstirahat(); });
  el.querySelectorAll("[data-copyb]").forEach(b => b.onclick = () => { const src = state.breaks[+b.dataset.copyb]; for (let d = 0; d < 7; d++) state.breaks[d] = clone(src); save(); renderIstirahat(); toast("Jam istirahat " + HARI[+b.dataset.copyb] + " disalin ke semua hari"); });
}

/* ---------- 4. Parameter ---------- */
function renderParameter() {
  const el = $("#p-parameter"), p = state.params, L = p.lalin;
  const acts = p.aktivitas.map((a, i) => `<tr>
    <td><input class="in" data-k="params.aktivitas.${i}.nama" value="${esc(a.nama)}" style="min-width:190px"></td>
    <td><input class="in num" type="number" min="0" step="5" data-t="num" data-k="params.aktivitas.${i}.durasi" value="${a.durasi ?? ""}" style="min-width:70px"></td>
    <td><div class="days">${HARI3.map((h, d) => `<button type="button" class="dchip ${a.hari[d] ? "on" : ""}" data-chip="params.aktivitas.${i}.hari|${d}" title="${HARI[d]}">${h}</button>`).join("")}</div></td>
    <td><select class="in" data-k="params.aktivitas.${i}.waktu" data-rerender="1" style="min-width:170px"><option value="sebelum" ${a.waktu !== "setelah" ? "selected" : ""}>Sebelum berangkat</option><option value="setelah" ${a.waktu === "setelah" ? "selected" : ""}>Setelah kembali ke gudang</option></select></td>
    <td><select class="in" data-k="params.aktivitas.${i}.berlaku" style="min-width:120px"><option value="semua" ${a.berlaku !== "shift1" ? "selected" : ""}>Setiap shift</option><option value="shift1" ${a.berlaku === "shift1" ? "selected" : ""}>Shift 1 saja</option></select></td>
    <td style="text-align:center"><input type="checkbox" data-k="params.aktivitas.${i}.dihitung" ${a.dihitung ? "checked" : ""} aria-label="Masuk jam shift"></td>
    <td><button class="btn icon" type="button" data-del="params.aktivitas|${i}" aria-label="Hapus">✕</button></td></tr>`).join("");
  const peaks = L.jamSibuk.map((j, i) => `<div class="brow" style="grid-template-columns:1fr auto 1fr 80px auto"><input class="in mono" type="time" data-k="params.lalin.jamSibuk.${i}.mulai" value="${esc(j.mulai)}"><span class="hint">s/d</span><input class="in mono" type="time" data-k="params.lalin.jamSibuk.${i}.selesai" value="${esc(j.selesai)}"><input class="in num" type="number" step="0.05" min="1" data-t="num" data-k="params.lalin.jamSibuk.${i}.faktor" value="${j.faktor}" title="Faktor pengali waktu"><button class="btn icon" type="button" data-del="params.lalin.jamSibuk|${i}" aria-label="Hapus">✕</button></div>`).join("");
  const num = (k, v, step = "0.05", extra = "") => `<input class="in num" type="number" step="${step}" data-t="num" data-k="${k}" value="${v ?? ""}" ${extra}>`;
  el.innerHTML = `<div class="head"><div><h2>4 · Parameter</h2><p>Aturan shift, aktivitas harian, dan kecepatan bongkar/muat.</p></div></div>
  <div class="grid2">
    ${tugasCard(p)}
    <div class="card pad" style="display:grid;gap:14px;align-content:start">
      <h3>Shift &amp; waktu</h3>
      <div class="field"><label for="pShift">Jam kerja per shift (termasuk loading &amp; istirahat)</label><div class="row"><input id="pShift" class="in num" type="number" min="1" max="16" step="0.5" data-t="num" data-k="params.jamShift" value="${p.jamShift}" style="max-width:110px"><span>jam</span></div><span class="hint">Dihitung dari aktivitas pertama yang "masuk jam shift" sampai kendaraan kembali ke gudang, termasuk aktivitas "setelah kembali" yang dicentang masuk jam shift.</span></div>
      <div class="field"><label for="pMulai">Jam mulai aktivitas</label><input id="pMulai" class="in mono" type="time" data-k="params.jamMulai" value="${esc(p.jamMulai)}" style="max-width:130px"></div>
      <div class="field" ${p.aktivitas.some(a => a.waktu === "setelah") ? "" : "hidden"}><label for="pHari1">Hari distribusi pertama dalam minggu (untuk aktivitas "setelah kembali")</label><select id="pHari1" class="in" data-k="params.loadingHariPertama" style="max-width:480px"><option value="malam" ${p.loadingHariPertama !== "pagi" ? "selected" : ""}>Disiapkan di akhir hari terakhir minggu lalu (mis. Sabtu sore)</option><option value="pagi" ${p.loadingHariPertama === "pagi" ? "selected" : ""}>Dilakukan pagi hari, sebelum berangkat</option></select><span class="hint">Jika pilih pagi hari, hari distribusi terakhir (mis. Sabtu) tidak perlu loading sore untuk esok hari.</span></div>
      <div class="field"><label for="pMgg">Minggu 1 siklus dimulai</label><input id="pMgg" class="in mono" type="date" data-k="params.mingguMulai" value="${esc(p.mingguMulai || "")}" style="max-width:170px"><span class="hint">Dipakai bila ada store 1x per 2–5 minggu: plan dibuat per minggu (Minggu 1, 2, …) dan label tanggalnya dihitung dari hari ini. Pilih hari Senin.</span></div>
      <div class="field"><label for="pRasio">Rasio waktu loading di store</label><div class="row"><input id="pRasio" class="in num" type="number" min="1" step="1" data-t="num" data-k="params.rasioKgMenit" value="${p.rasioKgMenit}" style="max-width:110px"><span>kg per menit</span></div><span class="hint">Berlaku untuk menurunkan maupun menaikkan barang. Contoh: 900 kg ÷ ${p.rasioKgMenit || 30} = ${fmtNum(900 / (p.rasioKgMenit || 30))} menit.</span></div>
    </div>
  </div>
  <div class="card pad" style="display:grid;gap:12px">
    <div class="head"><div><h3>Jalan yang diblok</h3><p class="hint" style="margin-top:4px">Rute di peta tidak akan melewati jalan-jalan ini. Tulis nama jalan seperti di peta (contoh: <b>Tol Reformasi</b>, <b>Ir. Sutami</b>, <b>Jalan Andi Pangeran Pettarani</b>); cukup sebagian nama yang khas. Hitungan waktu plan memakai model jarak tanpa tol di Lalu lintas &amp; jalan.</p></div><button class="btn" type="button" id="addJB">＋ Tambah jalan</button></div>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-k="params.jalanBlok.semuaTol" ${p.jalanBlok.semuaTol !== false ? "checked" : ""}> <span><b>Blok semua jalan tol</b> <span class="hint">(Tol Reformasi, Tol Ir. Sutami, Tol Pelabuhan, dan tol lain)</span></span></label>
    <div style="display:grid;gap:6px">${p.jalanBlok.daftar.map((j, i) => `<div class="brow" style="grid-template-columns:auto minmax(0,1fr) auto"><input type="checkbox" data-k="params.jalanBlok.daftar.${i}.aktif" ${j.aktif !== false ? "checked" : ""} aria-label="Aktif"><input class="in" data-k="params.jalanBlok.daftar.${i}.nama" value="${esc(j.nama || "")}" placeholder="Nama jalan, mis. Tol Reformasi"><button class="btn icon" type="button" data-del="params.jalanBlok.daftar|${i}" aria-label="Hapus">✕</button></div>`).join("") || '<span class="off">Belum ada jalan yang diblok.</span>'}</div>
  </div>
  <div class="card">
    <div class="head" style="padding:14px 16px 0"><div><h3>Aktivitas per hari</h3><p class="hint" style="margin-top:4px">Contoh: loading di gudang 60 menit, antri BBM 60 menit. Aktivitas <b>sebelum berangkat</b> dijalankan berurutan sebelum rit; yang <b>tidak</b> masuk jam shift dijalankan lebih dulu (mis. pembersihan Senin pagi) dan menggeser jam mulai shift. Aktivitas <b>setelah kembali ke gudang</b> (mis. loading untuk esok hari) dijalankan begitu kendaraan pulang dari rit dan menyiapkan rit berikutnya, jadi tidak perlu dilakukan lagi pagi harinya.</p></div><button class="btn" type="button" id="addA">＋ Tambah aktivitas</button></div>
    <div class="tbl-wrap lock"><table><thead><tr><th>Jenis aktivitas</th><th class="num">Durasi (menit)</th><th>Hari</th><th title="Setelah kembali = disiapkan untuk rit berikutnya (shift berikutnya atau esok hari)">Waktu pelaksanaan</th><th>Berlaku</th><th>Masuk jam shift</th><th></th></tr></thead><tbody>${acts || `<tr><td colspan="7" class="empty">Belum ada aktivitas.</td></tr>`}</tbody></table></div>
  </div>
  <div class="card pad">
    <details class="adv"><summary>Lalu lintas &amp; jalan (lanjutan)</summary>
      <div class="grid2">
        <div style="display:grid;gap:12px;align-content:start">
          <div class="field"><label>Faktor jarak jalan (tanpa tol)</label>${num("params.lalin.faktorJalan", L.faktorJalan)}<span class="hint">Plan memakai jarak rute jalan sebenarnya (tanpa tol) dari server rute. Faktor ini hanya dipakai sebagai cadangan bila jarak jalan belum bisa diambil: jarak garis lurus × faktor = perkiraan jarak jalan.</span></div>
          <div class="field"><label>Batas antar kota</label><div class="row">${num("params.lalin.batasAntarKotaKm", L.batasAntarKotaKm, "1", 'style="max-width:110px"')}<span>km garis lurus</span></div><span class="hint">Perjalanan antar titik yang lebih jauh dari batas ini memakai faktor antar kota; yang lebih dekat memakai faktor dalam kota.</span></div>
        </div>
        <div style="display:grid;gap:12px;align-content:start">
          <div class="field"><label>Faktor macet (pengali waktu tempuh)</label><span class="hint">Waktu tempuh = jarak jalan ÷ kecepatan kendaraan × faktor ini. Contoh: 40 km/jam × faktor 1,65 ≈ rata-rata 24 km/jam di dalam kota.</span>
            <div class="brow" style="grid-template-columns:1fr 90px"><span>Dalam kota</span>${num("params.lalin.fDalamKota", L.fDalamKota)}</div>
            <div class="brow" style="grid-template-columns:1fr 90px"><span>Antar kota</span>${num("params.lalin.fAntarKota", L.fAntarKota)}</div></div>
          <div class="field"><label>Jam sibuk (faktor tambahan)</label>${peaks || '<span class="off">Tidak ada</span>'}<div><button class="btn sm" type="button" id="addPeak">＋ Tambah jam sibuk</button></div></div>
        </div>
      </div>
    </details>
  </div>`;
  $("#addA").onclick = () => { p.aktivitas.push({ id: uid("a"), nama: "Aktivitas baru", durasi: 30, hari: [true, true, true, true, true, true, true], waktu: "sebelum", berlaku: "semua", dihitung: true }); save(); renderParameter(); };
  $("#addJB").onclick = () => { p.jalanBlok.daftar.push({ id: uid("j"), nama: "", aktif: true }); save(); renderParameter(); const ins = document.querySelectorAll('[data-k^="params.jalanBlok.daftar."][data-k$=".nama"]'); if (ins.length) ins[ins.length - 1].focus(); };
  $("#addPeak").onclick = () => { L.jamSibuk.push({ mulai: "07:00", selesai: "09:00", faktor: 1.2 }); save(); renderParameter(); $("details.adv").open = true; };
}

/* ---------- Plan ---------- */
/* Optimasi mendalam: plan biasa tampil langsung, lalu versi mendalam dihitung bertahap di latar (layar tetap responsif). */
const deepJob = { id: 0, run: false, k: 0, n: 0, fase: "", g: null };
function stopDeep() { if (deepJob.g) { try { deepJob.g.return(); } catch (e) {} } deepJob.g = null; deepJob.run = false; deepJob.id++; deepNote(); }
function startDeep() {
  stopDeep(); if (!plan || plan.error || state.params.optimasiMendalam === false) return;
  const id = deepJob.id, base = plan.opt ? plan.opt.akhir : null;
  const baseW = planWeeks ? planWeeks.map(P => P && P.opt ? P.opt.akhir : null) : [base];
  let g; try { g = deepWeeks(); } catch (e) { return; }
  Object.assign(deepJob, { run: true, k: 0, n: 0, fase: "variasi", g }); deepNote();
  const step = () => {
    if (id !== deepJob.id) return;
    const t = Date.now(); let r;
    try { do { r = g.next(); if (!r.done) Object.assign(deepJob, r.value); } while (!r.done && Date.now() - t < 60); }
    catch (e) { console.error(e); deepJob.g = null; deepJob.run = false; deepNote(); return; }
    if (!r.done) { deepNote(); setTimeout(step, 0); return; }
    deepJob.g = null; deepJob.run = false;
    const W = r.value; if (!W || !W.length || W.some(P => !P || P.error)) { deepNote(); return; }
    const quick = planWeeks || [];
    W.forEach((P, w) => { const Q = quick[w]; if (Q && Q.opt && P.opt && Q.opt.cost < P.opt.cost) W[w] = Q; else if (P.opt) P.opt.biasa = baseW[w] || null; }); // jangan pernah lebih buruk dari plan cepat
    planWeeks = W; weekCache.meta = W.meta; if (weekSel >= W.length) weekSel = 0; plan = W[weekSel]; mapDrawn = null;
    if (["plan", "gantt", "peta"].includes(tab)) renderTab(); else deepNote();
    const tot = weeksTotal(W), b0 = baseW.filter(Boolean);
    if (b0.length) toast("Optimasi mendalam selesai: " + tot.rit + " rit, " + fmtNum(tot.km) + " km" + (W.length > 1 ? " dalam " + W.length + " minggu" : "") + " (plan cepat: " + b0.reduce((a, x) => a + x.rit, 0) + " rit, " + fmtNum(b0.reduce((a, x) => a + x.km, 0)) + " km).", 5000);
  };
  setTimeout(step, 30);
}
function deepNoteHtml() {
  if (!deepJob.run) return "";
  const pct = deepJob.n ? Math.round(deepJob.k / deepJob.n * 100) : 0;
  return `<div class="banner info"><span class="spin" aria-hidden="true"></span><div><b>Optimasi mendalam berjalan… <span id="deepPct">${pct}% (${esc(deepJob.fase)})</span></b>. Plan di bawah adalah hasil cepat; akan diganti otomatis bila ditemukan yang lebih efisien.</div><button class="btn sm" type="button" id="btnStopDeep">Hentikan</button></div>`;
}
function deepNote() {
  const el = document.getElementById("deepNote"), pc = document.getElementById("deepPct");
  if (el && deepJob.run && pc) pc.textContent = (deepJob.n ? Math.round(deepJob.k / deepJob.n * 100) : 0) + "% (" + deepJob.fase + ")"; // perbarui teks saja, tombol tidak dibuat ulang
  else if (el) el.innerHTML = deepNoteHtml();
  const sb = document.getElementById("btnStopDeep"); if (sb && !sb.onclick) sb.onclick = () => { stopDeep(); toast("Optimasi mendalam dihentikan. Plan cepat tetap dipakai."); };
  const bp = document.getElementById("btnPlan"); if (bp) bp.textContent = deepJob.run ? "⏳ Mengoptimasi " + (deepJob.n ? Math.round(deepJob.k / deepJob.n * 100) : 0) + "%" : "▶ Buat Plan";
}
function* deepWeeks() { // optimasi mendalam untuk tiap minggu dalam siklus
  const meta = weekMeta(state), out = [];
  for (let w = 0; w < meta.H; w++) {
    const g = planGen(weekState(state, meta, w), { mendalam: true, skala: 1 / meta.H }); let r;
    while (!(r = g.next()).done) { const v = r.value; yield { fase: v.fase + (meta.H > 1 ? ", minggu " + (w + 1) + "/" + meta.H : ""), k: w * 100 + (v.n ? v.k / v.n * 100 : 0), n: meta.H * 100 }; }
    const P = r.value; if (P && !P.error) { P.week = w; P.nMinggu = meta.H; } out.push(P);
  }
  out.meta = meta; return out;
}
function weeksTotal(W) { const T = { rit: 0, km: 0, jam: 0, kunj: 0, un: 0 }; (W || []).forEach(P => { if (!P || P.error) return; T.rit += P.trips.length; T.km += P.trips.reduce((a, t) => a + t.km, 0); T.jam += P.trips.reduce((a, t) => a + t.dur, 0) / 60; T.kunj += P.trips.reduce((a, t) => a + t.stops.length, 0); T.un += P.unserved.length; }); return T; }
function weekDate(w, d) { const m = String(state.params.mingguMulai || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return null; return new Date(+m[1], +m[2] - 1, +m[3] + w * 7 + (d || 0)); }
function weekLabel(w, short) {
  const a = weekDate(w, 0), lastD = Math.max(0, ...state.params.hari.map((x, i) => x ? i : 0)), b = weekDate(w, lastD);
  const f = x => x.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  return "Minggu " + (w + 1) + (a && !short ? " · " + f(a) + "–" + f(b) : "");
}
function weekBarHtml() {
  if (!planWeeks || planWeeks.length < 2) return "";
  return `<div class="weekbar" role="tablist" aria-label="Pilih minggu">${planWeeks.map((P, w) => `<button type="button" class="dchip big ${w === weekSel ? "on" : ""}" data-week="${w}" title="${esc(weekLabel(w))}">${esc(weekLabel(w))}${P && !P.error ? ` <span class="hint">${P.trips.length} rit</span>` : ""}</button>`).join("")}</div>`;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-week]"); if (!b || !planWeeks) return; weekSel = +b.dataset.week; plan = planWeeks[weekSel]; mapDrawn = null; renderTab(); });
function runPlan(silent) {
  stopDeep();
  try { const W = buildWeeks(state, { mendalam: false }); planWeeks = W; weekCache.meta = W.meta; if (weekSel >= W.length) weekSel = 0; plan = W[weekSel] || W[0]; }
  catch (e) { plan = { error: "Gagal membuat plan: " + e.message }; planWeeks = null; console.error(e); }
  planDirty = false; mapDrawn = null; planSavedAt = 0;
  if (!plan.error) { unsaved = true; saveStatus(); } // plan baru: tekan Simpan agar tampil lagi saat web dibuka
  if (!plan.error && state.params.optimasiMendalam !== false) startDeep();
  if (!silent) { if (plan.error) toast(plan.error, 4000); else { const T = weeksTotal(planWeeks); toast("Plan dibuat: " + T.rit + " rit" + (planWeeks.length > 1 ? " dalam " + planWeeks.length + " minggu" : "") + (T.un ? ", " + T.un + " kunjungan belum terlayani" : "")); } }
  setTimeout(maybeHitungJarak, 0);
}
$("#btnSave").onclick = () => commitSave(); saveStatus();
$("#btnPlan").onclick = () => { runPlan(); if (!["plan", "gantt", "peta"].includes(tab)) setTab("plan"); else renderTab(); };

function weeksCard() {
  if (!planWeeks || planWeeks.length < 2) return "";
  const T = weeksTotal(planWeeks), M = weekCache.meta || {};
  const rows = planWeeks.map((P, w) => { const t = weeksTotal([P]); return `<tr class="${w === weekSel ? "sel" : ""}"><td><button type="button" class="btn sm ghost" data-week="${w}">${esc(weekLabel(w))}</button></td><td class="num mono">${t.rit}</td><td class="num mono">${t.kunj}</td><td class="num mono">${fmtNum(t.km)} km</td><td class="num mono">${fmtNum(t.jam, 1)} jam</td><td class="num mono" style="${t.un ? "color:var(--bad);font-weight:600" : ""}">${t.un}</td></tr>`; }).join("");
  return `<div class="card pad" style="display:grid;gap:10px"><div><h3>Siklus ${planWeeks.length} minggu</h3><p class="hint" style="margin-top:4px">Ada store dengan frekuensi 1x per 2–5 minggu, jadi plan dibuat per minggu dan berulang setiap ${planWeeks.length} minggu${M.exact === false ? " (kombinasi periode terlalu panjang, siklus dipotong " + planWeeks.length + " minggu)" : ""}. Minggu kirim store dibagi rata otomatis agar beban tiap minggu seimbang; bisa dikunci di tab Store (kolom Minggu ke). Minggu 1 dimulai ${esc((weekDate(0) || new Date()).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))} (ubah di Parameter).</p></div>
    <div class="tbl-wrap" style="max-width:760px"><table><thead><tr><th>Minggu</th><th class="num">Rit</th><th class="num">Kunjungan</th><th class="num">Jarak</th><th class="num">Jam kerja</th><th class="num">Belum terlayani</th></tr></thead><tbody>${rows}<tr class="tot"><td><b>Total siklus</b></td><td class="num mono"><b>${T.rit}</b></td><td class="num mono"><b>${T.kunj}</b></td><td class="num mono"><b>${fmtNum(T.km)} km</b></td><td class="num mono"><b>${fmtNum(T.jam, 1)} jam</b></td><td class="num mono"><b>${T.un}</b></td></tr></tbody></table></div></div>`;
}
function vehLabel(v) { return (v.jenis || "Kendaraan") + (v.plat ? " · " + v.plat : ""); }
function gmapsLink(t) {
  const d = plan.depot; const pts = [[d.lat, d.lng]].concat(t.stops.map(s => [s.store.lat, s.store.lng]), [[d.lat, d.lng]]);
  return "https://www.google.com/maps/dir/" + pts.map(p => p[0] + "," + p[1]).join("/") + "/data=!4m4!4m3!2m1!2b1!3e0";
}
function tripColor(t, i) { const pal = ["#2563eb", "#e11d48", "#16a34a", "#9333ea", "#ea8c00", "#0891b2", "#be185d", "#4d7c0f", "#7c3aed", "#c2410c"]; return pal[i % pal.length]; }

/* Ringkasan per kendaraan (dipakai tab Plan & Excel) */
function vehSummary(plan) {
  const H = plan.H || 480;
  const sum = T => {
    const rit = T.length, kunj = T.reduce((a, t) => a + t.stops.length, 0), del = T.reduce((a, t) => a + t.kgDel, 0), pick = T.reduce((a, t) => a + t.kgPick, 0), km = T.reduce((a, t) => a + t.km, 0), dur = T.reduce((a, t) => a + t.dur, 0);
    const jamPct = rit ? dur / (rit * H) : 0;
    const muatPct = rit ? T.reduce((a, t) => a + Math.max(t.kgDel, t.kgPick) / (+t.veh.kapasitasKg || 1), 0) / rit : 0;
    return { rit, kunj, del, pick, km, jam: dur / 60, jamPct, muatPct };
  };
  const rows = plan.vehicles.map((v, vi) => Object.assign({ v }, sum(plan.trips.filter(t => t.vIdx === vi))));
  return { rows, total: sum(plan.trips) };
}
function vehTable(plan) {
  const S = vehSummary(plan);
  const pctCell = p => `<td class="num mono">${fmtNum(p * 100)}% <span class="meter"><i style="width:${Math.min(100, p * 100)}%"></i></span></td>`;
  const tr = (lbl, r, b) => `<tr${b ? ' style="font-weight:700;background:var(--surface2)"' : ""}><td>${lbl}</td><td class="num mono">${r.rit}</td><td class="num mono">${r.kunj}</td><td class="num mono">${fmtNum(r.del)} kg <span class="sub">${ton(r.del)}</span></td><td class="num mono">${fmtNum(r.pick)} kg <span class="sub">${ton(r.pick)}</span></td><td class="num mono">${fmtNum(r.km, 1)} km</td>${pctCell(r.jamPct)}${pctCell(r.muatPct)}</tr>`;
  return `<div class="card"><div class="head" style="padding:14px 16px 0"><div><h3>Ringkasan per kendaraan</h3><p class="hint" style="margin-top:4px">% jam kerja = rata-rata durasi per shift dibanding ${fmtNum(+state.params.jamShift, +state.params.jamShift % 1 ? 1 : 0)} jam kerja per shift. % muatan = rata-rata isi per rit dibanding kapasitas kendaraan (muatan diantar atau dinaikkan, yang lebih besar).</p></div></div>
    <div class="tbl-wrap"><table><thead><tr><th>Kendaraan</th><th class="num">Total rit</th><th class="num">Total kunjungan</th><th class="num">Muatan diantar</th><th class="num">Muatan dinaikkan</th><th class="num">Jarak tempuh</th><th class="num">% jam kerja</th><th class="num">% muatan</th></tr></thead><tbody>
    ${S.rows.map(r => tr(`<div style="display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;min-width:150px"><b>${esc(r.v.jenis)}</b>${r.v.plat ? `<span class="plate">${esc(r.v.plat)}</span>` : ""}<span class="pill">${esc(r.v.bbm || "Solar")}</span></div>`, r)).join("")}
    ${S.rows.length > 1 ? tr("Total", S.total, true) : ""}
    </tbody></table></div></div>`;
}

function optCard(plan) {
  const A = plan.opt.awal, B = plan.opt.akhir;
  const row = (lbl, a, b, fmt, unit, lowerBetter = true) => {
    const ch = a ? (b - a) / a * 100 : 0; const good = lowerBetter ? b < a - 1e-9 : b > a + 1e-9; const bad = lowerBetter ? b > a + 1e-9 : b < a - 1e-9;
    return `<tr><td>${lbl}</td><td class="num mono">${fmt(a)} ${unit}</td><td class="num mono"><b>${fmt(b)} ${unit}</b></td><td class="num mono" style="color:${good ? "var(--ok)" : bad ? "var(--bad)" : "var(--muted)"}">${Math.abs(ch) < 0.05 ? "–" : (ch > 0 ? "+" : "") + fmtNum(ch, 1) + "%"}</td></tr>`;
  };
  const f0 = x => fmtNum(x), f1 = x => fmtNum(x, 1), fp = x => fmtNum(x * 100);
  return `<div class="card pad" style="display:grid;gap:12px">
    <div class="head"><div><h3>Hasil optimasi otomatis</h3><p class="hint" style="margin-top:4px">Dibandingkan dengan rute awal (penyusunan biasa tanpa optimasi). Mesin mencoba ${plan.opt.starts} variasi${plan.opt.mendalam ? " + " + plan.opt.rr + " kali susun ulang (optimasi mendalam)" : ""} dalam ${fmtNum(plan.opt.ms / 1000, 1)} detik.${plan.opt.biasa ? " Dibanding plan cepat: " + plan.opt.biasa.rit + " → " + plan.opt.akhir.rit + " rit, " + fmtNum(plan.opt.biasa.km) + " → " + fmtNum(plan.opt.akhir.km) + " km, " + fmtNum(plan.opt.biasa.jam, 1) + " → " + fmtNum(plan.opt.akhir.jam, 1) + " jam kerja." : ""} Urutan prioritas: semua store terlayani, lalu jumlah rit paling sedikit, lalu jam kerja dan jarak paling pendek.</p></div></div>
    <div>
      <div class="tbl-wrap" style="max-width:760px"><table><thead><tr><th>Ukuran</th><th class="num">Rute awal</th><th class="num">Hasil optimasi</th><th class="num">Perubahan</th></tr></thead><tbody>
        ${row("Belum terlayani", A.unserved, B.unserved, f0, "kunjungan")}
        ${row("Jumlah rit", A.rit, B.rit, f0, "rit")}
        ${row("Jarak tempuh", A.km, B.km, f0, "km")}
        ${row("Total jam kerja", A.jam, B.jam, f1, "jam")}
        ${row("Rata-rata isi muatan", A.isi, B.isi, fp, "%", false)}
        ${row("Rata-rata jam kerja / shift", A.rit ? A.jam / A.rit : 0, B.rit ? B.jam / B.rit : 0, x => fmtNum(x, 1) + " jam (" + fmtNum(x / (plan.H / 60) * 100) + "%)", "", false)}
      </tbody></table></div>
    </div>
  </div>`;
}

function fairCard(plan) {
  const F = plan.opt && plan.opt.fair; if (!F) return "";
  const V = plan.vehicles, H = 60;
  const val = (T, i, k) => k === "jam" ? T[i].jam / H : k === "kg" ? (F.kgRelatif ? T[i].kg / F.cap[i] : T[i].kg / 1000) : T[i][k];
  const unit = { rit: "rit", toko: "toko", jam: "jam", kg: F.kgRelatif ? "× kapasitas" : "ton", km: "km", s2: "shift 2" };
  const lbl = Object.fromEntries(FAIR_K);
  const fmt = (k, x) => fmtNum(x, k === "jam" || k === "kg" ? 1 : 0);
  const spread = (T, k) => { const xs = V.map((v, i) => val(T, i, k)); return Math.max(...xs) - Math.min(...xs); };
  const rows = F.kriteria.map(k => `<tr><td>${lbl[k]}</td>${V.map((v, i) => `<td class="num mono">${fmt(k, val(F.sebelum, i, k))} → <b>${fmt(k, val(F.sesudah, i, k))}</b></td>`).join("")}<td class="num mono">${fmt(k, spread(F.sebelum, k))} → <b>${fmt(k, spread(F.sesudah, k))}</b> ${unit[k]}</td></tr>`).join("");
  const A = F.mSebelum, B = plan.opt.akhir;
  return `<div class="card pad" style="display:grid;gap:12px">
    <div class="head"><div><h3>Fairness antar kendaraan</h3><p class="hint" style="margin-top:4px">Sebelum → sesudah pemerataan (tingkat ${esc(F.tingkat)}).${F.kgRelatif ? " Total muatan ditulis sebagai kelipatan kapasitas kendaraan (diantar + dinaikkan selama seminggu)." : ""} Selisih = beban kendaraan paling berat dikurangi paling ringan; makin kecil makin adil. Biaya pemerataan: jarak ${fmtNum(A.km)} → ${fmtNum(B.km)} km, jam kerja ${fmtNum(A.jam, 1)} → ${fmtNum(B.jam, 1)} jam, rit ${A.rit} → ${B.rit}.</p></div></div>
    <div class="tbl-wrap"><table><thead><tr><th>Kriteria</th>${V.map(v => `<th class="num">${esc(v.jenis)} <span class="plate">${esc(v.plat || "")}</span></th>`).join("")}<th class="num">Selisih</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div>`;
}
function renderPlan() {
  const el = $("#p-plan");
  if (!plan) { el.innerHTML = '<div class="head"><div><h2>Plan Distribusi Mingguan</h2></div></div><div class="empty">Belum ada plan. Periksa data di tab 1–4, lalu klik <b>▶ Buat Plan</b> di kanan atas.</div>'; return; }
  if (plan.error) { el.innerHTML = `<div class="head"><div><h2>Plan Distribusi</h2></div></div><div class="banner bad"><b>Plan belum bisa dibuat.</b> ${esc(plan.error)}</div>`; return; }
  const T = plan.trips;
  const kg = T.reduce((a, t) => a + t.kgDel, 0), pk = T.reduce((a, t) => a + t.kgPick, 0), km = T.reduce((a, t) => a + t.km, 0);
  const capUsed = T.length ? T.reduce((a, t) => a + Math.max(t.kgDel, t.kgPick) / (+t.veh.kapasitasKg || 1), 0) / T.length : 0;
  const nVisit = T.reduce((a, t) => a + t.stops.length, 0);
  const avgDur = T.length ? T.reduce((a, t) => a + t.dur, 0) / T.length : 0, avgPct = avgDur / (plan.H || 480);
  let html = weekBarHtml() + `<div class="head"><div><h2>Plan Distribusi Mingguan${planWeeks && planWeeks.length > 1 ? " · " + esc(weekLabel(weekSel)) : ""}</h2><p>Gudang asal: <b>${esc(plan.depot.nama)}</b>. Disusun dan dioptimasi otomatis dari data input.</p><details class="help"><summary>Cara mesin menyusun plan</summary>Mesin mencoba banyak variasi pembagian hari dan rute, memindah serta menukar store antar rit, kendaraan, dan hari, lalu memilih yang paling efisien (semua terlayani, rit paling sedikit, jam kerja dan jarak terpendek) tanpa melanggar kapasitas, jam shift, jam istirahat, dan jam buka store.</details></div>
    <button class="btn" type="button" onclick="exportExcel()">⬇ Unduh Excel</button></div>
    ${dirtyBanner()}
    ${planSavedAt ? `<div class="hint" style="margin:-4px 0 12px">📌 Menampilkan plan terakhir yang disimpan (${esc(new Date(planSavedAt).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }))}). Klik ▶ Buat Plan untuk menghitung ulang.</div>` : ""}
    <div id="deepNote">${deepNoteHtml()}</div>
    <div id="roadNote">${roadNoteHtml()}</div>
    <div class="tiles">
      <div class="tile"><div class="k">Total rit</div><div class="v">${T.length}<small>rit/mgg</small></div></div>
      <div class="tile"><div class="k">Kunjungan</div><div class="v">${nVisit}<small>titik</small></div></div>
      <div class="tile"><div class="k">Muatan diantar</div><div class="v">${fmtNum(kg / 1000, 1)}<small>ton</small></div></div>
      <div class="tile"><div class="k">Barang dinaikkan</div><div class="v">${fmtNum(pk / 1000, 1)}<small>ton</small></div></div>
      <div class="tile"><div class="k">Jarak tempuh</div><div class="v">${fmtNum(km)}<small>km</small></div></div>
      <div class="tile" title="Rata-rata durasi kerja per shift dibanding batas ${state.params.jamShift} jam per shift"><div class="k">Jam kerja / shift (dari ${fmtNum(+state.params.jamShift, +state.params.jamShift % 1 ? 1 : 0)} jam)</div><div class="v">${fmtNum(avgPct * 100)}<small>% · ${fmtNum(avgDur / 60, 1)} jam</small></div></div>
      <div class="tile"><div class="k">Rata-rata isi muatan</div><div class="v">${fmtNum(capUsed * 100)}<small>%</small></div></div>
      <div class="tile ${plan.unserved.length ? "alert" : ""}"><div class="k">Belum terlayani</div><div class="v">${plan.unserved.length}<small>kunjungan</small></div></div>
    </div>`;
  html += weeksCard();
  html += vehTable(plan);
  html += fairCard(plan);
  if (plan.opt) html += optCard(plan);
  if (plan.unserved.length) html += `<div class="banner bad"><div><b>${plan.unserved.length} kunjungan tidak muat di jadwal.</b> <br>${plan.unserved.map(u => "• " + esc(u.store.nama) + " (" + HARI[u.day] + "): " + esc(u.reason)).join("<br>")}<br>Coba tambah kendaraan/shift, tambah hari beroperasi store, atau perpanjang jam kerja shift.</div></div>`;
  if (plan.warn.length) html += `<div class="banner warn"><div>${plan.warn.map(esc).join("<br>")}</div></div>`;
  for (const d of plan.days) {
    const td = T.filter(t => t.day === d);
    const dkg = td.reduce((a, t) => a + t.kgDel, 0);
    html += `<div class="dayblock"><div class="dayhead"><span class="dot" style="background:var(--d${d})"></span><h3>${HARI[d]}</h3><span class="pill">${td.length} rit</span><span class="pill">${ton(dkg)}</span><span class="pill">${fmtNum(td.reduce((a, t) => a + t.km, 0))} km</span><span class="hint">Istirahat: ${(state.breaks[d] || []).map(b => b.mulai + "–" + b.selesai).join(", ") || "-"}</span></div>`;
    if (!td.length) html += `<div class="card empty">Tidak ada rit.</div>`;
    for (const t of td) {
      const pct = t.kgDel / (+t.veh.kapasitasKg || 1);
      const over = t.dur > plan.H + 0.5;
      html += `<div class="card trip"><div class="trip-h"><span class="veh">${esc(t.veh.jenis)}</span>${t.veh.plat ? `<span class="plate">${esc(t.veh.plat)}</span>` : ""}<span class="pill ok">Shift ${t.shift}</span>
        <div class="meta"><span>Mulai shift <b>${fmtJam(t.shiftStart)}</b></span><span>Berangkat <b>${fmtJam(t.dep)}</b></span><span>Kembali <b>${fmtJam(t.ret)}</b></span>${t.end > t.ret + 0.5 ? `<span>Selesai di gudang <b>${fmtJam(t.end)}</b></span>` : ""}<span>Durasi <b class="${over ? "" : ""}">${fmtNum(t.dur / 60, 1)} jam</b></span><span>Muatan <b>${fmtNum(t.kgDel)} kg</b> <span class="meter"><i style="width:${Math.min(100, pct * 100)}%"></i></span> ${fmtNum(pct * 100)}%</span>${t.kgPick ? `<span>Dinaikkan <b>${fmtNum(t.kgPick)} kg</b></span>` : ""}<span><b>${fmtNum(t.km, 1)}</b> km</span></div>
        <a href="${gmapsLink(t)}" target="_blank" rel="noopener">Buka di Google Maps ↗</a></div>
        <div class="tbl-wrap"><table><thead><tr><th>#</th><th>Store</th><th>Kegiatan</th><th class="num">Berat</th><th class="num">Jarak</th><th class="num">Tempuh</th><th class="num">Jam berangkat</th><th class="num">Jam tiba</th><th class="num">Mulai bongkar/muat</th><th class="num">Jam selesai</th><th class="num" title="Jam istirahat yang terpotong antara berangkat dan selesai">Istirahat</th><th>Jam buka</th></tr></thead><tbody>
        ${t.stops.map((s, i) => `<tr><td class="mono">${i + 1}</td><td>${esc(s.store.nama)}</td><td>${s.store.loading === "Menaikkan" ? '<span class="tag pick">Menaikkan</span>' : '<span class="tag drop">Menurunkan</span>'}</td><td class="num mono">${fmtNum(s.store.beratKg)} kg</td><td class="num mono">${fmtNum(s.km, 1)} km</td><td class="num mono">${fmtNum(s.drive)} mnt</td><td class="num mono">${fmtJam(s.depart)}</td><td class="num mono">${fmtJam(s.arr)}</td><td class="num mono">${fmtJam(s.start)}${s.wait > 0.5 ? `<span class="sub">tunggu buka ${fmtNum(s.wait)} mnt</span>` : ""}</td><td class="num mono"><b>${fmtJam(s.fin)}</b></td><td class="num mono">${s.brk > 0.5 ? fmtNum(s.brk) + " mnt" : "–"}</td><td class="mono">${esc(s.store.buka || "")}–${esc(s.store.tutup || "")}</td></tr>`).join("")}
        <tr><td class="mono">↩</td><td colspan="3" class="hint">Kembali ke ${esc(plan.depot.nama)}</td><td class="num mono">${fmtNum(t.backKm, 1)} km</td><td class="num mono">${fmtNum(t.backMin)} mnt</td><td class="num mono">${fmtJam(t.backDep)}</td><td class="num mono"><b>${fmtJam(t.ret)}</b></td><td></td><td></td><td class="num mono">${t.backBrk > 0.5 ? fmtNum(t.backBrk) + " mnt" : "–"}</td><td></td></tr>
        ${t.segs.filter(g => g.after).map(g => `<tr><td class="mono">⟳</td><td colspan="5" class="hint">${esc(g.label)}</td><td class="num mono">${fmtJam(g.start)}</td><td></td><td></td><td class="num mono"><b>${fmtJam(g.end)}</b></td><td class="num mono">${(() => { const b = (plan.ctxBreaks[t.day] || []).reduce((s, [p, q]) => s + Math.max(0, Math.min(q, g.end) - Math.max(p, g.start)), 0); return b > 0.5 ? fmtNum(b) + " mnt" : "–"; })()}</td><td></td></tr>`).join("")}
        </tbody></table></div></div>`;
    }
    html += `</div>`;
  }
  el.innerHTML = html; roadNote(); deepNote();
}

/* ---------- Gantt ---------- */
function renderGantt() {
  const el = $("#p-gantt");
  if (!plan || plan.error) { el.innerHTML = `<div class="head"><div><h2>Gantt Armada</h2></div></div><div class="banner bad">${esc(plan ? plan.error : "Belum ada plan. Klik ▶ Buat Plan di kanan atas.")}</div>`; return; }
  const rows = [];
  // satu baris per hari × kendaraan × shift
  let grp = 0;
  plan.days.forEach(d => plan.vehicles.forEach((v, vi) => {
    const tv = plan.trips.filter(t => t.day === d && t.vIdx === vi);
    const nSh = Math.max(1, ...tv.map(t => t.shift));
    for (let sh = 1; sh <= nSh; sh++) rows.push({ d, v, vi, sh, grp, firstOfVeh: sh === 1, trips: tv.filter(t => t.shift === sh) });
    grp++;
  }));
  let tMin = Infinity, tMax = -Infinity;
  plan.trips.forEach(t => { t.segs.forEach(s => { tMin = Math.min(tMin, s.start); tMax = Math.max(tMax, s.end); }); });
  if (!isFinite(tMin)) { tMin = 360; tMax = 1320; }
  tMin = Math.floor(Math.min(tMin, toMin(state.params.jamMulai) ?? 480) / 60) * 60; tMax = Math.ceil(tMax / 60) * 60;
  const narrow = (el.clientWidth || 999) < 640;
  const LW = narrow ? 178 : 250, RH = 30, TOP = 34, LBL = 190, NM = narrow ? 12 : 22;
  ganttW = el.clientWidth || 0;
  const avail = (el.clientWidth || 0) - 22 - LW - LBL; // lebar sumbu waktu agar Gantt muat tanpa geser ke samping
  const PX = avail > 0 ? Math.max(26, Math.min(96, avail / ((tMax - tMin) / 60))) : 64;
  const W = LW + (tMax - tMin) / 60 * PX + LBL;
  let labels = "";
  const H = TOP + rows.length * RH + 10;
  const x = m => LW + (m - tMin) / 60 * PX;
  const segCol = { aktivitas: "var(--seg-act)", jalan: "var(--seg-drive)", bongkar: "var(--seg-drop)", muat: "var(--seg-pick)", tunggu: "var(--seg-wait)" };
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gantt jadwal armada">`;
  for (let m = tMin; m <= tMax; m += 60) svg += `<line x1="${x(m)}" x2="${x(m)}" y1="${TOP - 6}" y2="${H - 10}" stroke="var(--line)"/>` + (PX >= 42 || (m - tMin) % 120 === 0 ? `<text x="${x(m)}" y="${TOP - 12}" text-anchor="middle" font-size="11" fill="var(--muted)">${fmtJam(m)}</text>` : "");
  let prevD = null;
  rows.forEach((r, i) => {
    const y = TOP + i * RH;
    if (r.d !== prevD) { if (prevD !== null) svg += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="var(--muted)" stroke-width="1"/>`; prevD = r.d; }
    if (r.grp % 2 === 0) svg += `<rect x="0" y="${y}" width="${W}" height="${RH}" fill="var(--surface2)" opacity=".5"/>`;
    if (r.firstOfVeh && i > 0 && rows[i - 1].d === r.d) svg += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="1"/>`;
    if (!r.firstOfVeh) svg += `<line x1="${LW - 8}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-dasharray="3 3"/>`;
    (plan.ctxBreaks[r.d] || []).forEach(([a, b]) => { if (b > tMin && a < tMax) svg += `<rect x="${x(Math.max(a, tMin))}" y="${y}" width="${(Math.min(b, tMax) - Math.max(a, tMin)) / 60 * PX}" height="${RH}" fill="var(--brk)" data-tip="${esc("<b>Istirahat</b><br>" + HARI[r.d] + " " + fmtJam(a) + "–" + fmtJam(b))}"/>`; });
    const first = rows.findIndex(q => q.d === r.d) === i;
    svg += `<text x="10" y="${y + RH / 2 + 4}" font-size="12" fill="var(--fg)">${first ? `<tspan font-weight="700" fill="${dayColor(r.d)}">${HARI3[r.d]}</tspan>  ` : `<tspan fill="transparent">${HARI3[r.d]}</tspan>  `}${r.firstOfVeh ? esc((r.v.jenis + " " + (r.v.plat || "")).slice(0, NM) + ((r.v.jenis + " " + (r.v.plat || "")).length > NM ? "…" : "")) : `<tspan fill="transparent">${esc((r.v.jenis + " " + (r.v.plat || "")).slice(0, NM) + ((r.v.jenis + " " + (r.v.plat || "")).length > NM ? "…" : ""))}</tspan>`}</text><rect x="${LW - 62}" y="${y + 7}" width="50" height="16" rx="8" fill="${r.trips.length ? "var(--sel)" : "none"}" stroke="${r.trips.length ? "none" : "var(--line)"}"/><text x="${LW - 37}" y="${y + RH / 2 + 4}" font-size="10.5" font-weight="600" text-anchor="middle" fill="${r.trips.length ? "var(--sel-fg)" : "var(--muted)"}">Shift ${r.sh}</text>${r.trips.length ? "" : `<text x="${LW + 6}" y="${y + RH / 2 + 4}" font-size="11" fill="var(--muted)" font-style="italic">tidak ada rit</text>`}`;
    r.trips.forEach(t => {
      t.segs.forEach(s => {
        // pecah segmen di jam istirahat agar bar tidak menutupi istirahat
        const parts = splitByBreaks(s.start, s.end, plan.ctxBreaks[r.d] || []);
        parts.forEach(([a, b]) => {
          const w = Math.max(1, (b - a) / 60 * PX);
          const tip = `<b>${esc(s.label)}</b><br>${HARI[r.d]} · Shift ${t.shift}<br>${fmtJam(s.start)}–${fmtJam(s.end)}${s.kg ? "<br>" + fmtNum(s.kg) + " kg" : ""}${s.km ? "<br>" + fmtNum(s.km, 1) + " km" : ""}`;
          svg += `<rect x="${x(a)}" y="${y + 6}" width="${w}" height="${RH - 12}" rx="2" fill="${segCol[s.type]}" data-tip="${esc(tip)}"/>`;
        });
      });
      if (t === r.trips[r.trips.length - 1]) labels += `<text x="${x(t.end) + 5}" y="${y + RH / 2 + 4}" font-size="10.5" fill="var(--muted)" paint-order="stroke" stroke="var(--surface)" stroke-width="4" stroke-linejoin="round">Shift ${t.shift} · ${fmtJam(t.shiftStart)}–${fmtJam(t.endShift)} (${fmtNum(t.dur / 60, 1)} jam)</text>`;
      const lim = t.shiftStart + plan.H;
      if (lim <= tMax) svg += `<line x1="${x(lim)}" x2="${x(lim)}" y1="${y + 3}" y2="${y + RH - 3}" stroke="var(--bad)" stroke-width="1.5" stroke-dasharray="2 2" data-tip="${esc("<b>Batas jam shift " + t.shift + "</b><br>" + fmtJam(lim))}"/>`;
    });
  });
  svg += labels + `</svg>`;
  el.innerHTML = weekBarHtml() + `<div class="head"><div><h2>Gantt Armada${planWeeks && planWeeks.length > 1 ? " · " + esc(weekLabel(weekSel)) : ""}</h2><p>Satu baris per kendaraan per shift per hari (Shift 1 dan Shift 2 terpisah). Arahkan kursor ke bar untuk detail. Garis putus merah = batas ${state.params.jamShift} jam shift.</p></div></div>
    ${dirtyBanner()}
    <div class="legend"><span><i class="sw" style="background:var(--seg-act)"></i>Aktivitas gudang (loading, BBM, dll.)</span><span><i class="sw" style="background:var(--seg-drive)"></i>Perjalanan</span><span><i class="sw" style="background:var(--seg-drop)"></i>Menurunkan barang</span><span><i class="sw" style="background:var(--seg-pick)"></i>Menaikkan barang</span><span><i class="sw" style="background:var(--seg-wait)"></i>Menunggu store buka</span><span><i class="sw" style="background:var(--brk);outline:1px solid var(--line)"></i>Istirahat</span></div>
    <div class="card gantt-wrap" id="gantt">${svg}</div>`;
}
function splitByBreaks(a, b, brs) {
  let parts = [[a, b]];
  for (const [x, y] of brs) { const np = []; for (const [p, q] of parts) { if (y <= p || x >= q) np.push([p, q]); else { if (x > p) np.push([p, x]); if (y < q) np.push([y, q]); } } parts = np; }
  return parts.filter(([p, q]) => q - p > 0.01);
}
document.addEventListener("mousemove", e => {
  const tg = e.target.closest && e.target.closest("[data-tip]"); const tip = $("#tip");
  if (!tg) { tip.hidden = true; return; }
  tip.innerHTML = tg.getAttribute("data-tip"); tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(window.innerWidth - r.width - 8, e.clientX + 12) + "px";
  tip.style.top = Math.min(window.innerHeight - r.height - 8, e.clientY + 14) + "px";
});

/* ---------- Jarak jalan sebenarnya ----------
   Matriks jarak antar semua titik diambil dari server rute Valhalla (sources_to_targets), tanpa tol dan menghindari
   titik jalan yang diblok. Disimpan di state.jarakJalan (ikut tersimpan ke GitHub) dan di browser ini. Pasangan
   yang gagal diambil memakai perkiraan garis lurus × faktor jarak jalan. */
const JARAK_LS = LS_KEY + "-jarak";
const MAXP = 100; // batas server: "Exceeded max locations: 100" = sumber × tujuan per permintaan
const roadJob = { run: false, done: 0, total: 0, failKey: "", err: "" };
let sharedChecked = false;
function jarakPts() { return [...new Set(state.stores.filter(s => s.aktif !== false && s.lat != null && s.lng != null && !isNaN(s.lat) && !isNaN(s.lng)).map(s => ptKey(s.lat, s.lng)))]; }
function mergeJarak(src) { // gabungkan matriks lain (cache browser / data bersama) ke state
  src = cleanJarak(src); const cfg = roadCfgKey(state); if (!src || src.cfg !== cfg) return 0;
  let J = state.jarakJalan; if (!J || J.cfg !== cfg) J = state.jarakJalan = { cfg, k: [], d: {}, t: 0 };
  const idx = new Map(J.k.map((k, i) => [k, i])); const at = k => { let i = idx.get(k); if (i == null) { i = J.k.length; J.k.push(k); idx.set(k, i); } return i; };
  let n = 0; for (const key in src.d) { const [a, b] = key.split(":").map(Number); if (src.k[a] == null || src.k[b] == null) continue; const kk = at(src.k[a]) + ":" + at(src.k[b]); if (J.d[kk] == null) { J.d[kk] = src.d[key]; n++; } }
  J.t = Math.max(J.t || 0, src.t || 0); return n;
}
function jarakMissing() { // pasangan titik (dari -> ke) yang belum punya jarak jalan
  const cfg = roadCfgKey(state), pts = jarakPts(); const J = state.jarakJalan && state.jarakJalan.cfg === cfg ? state.jarakJalan : null;
  const idx = J ? new Map(J.k.map((k, i) => [k, i])) : new Map(); const miss = [];
  pts.forEach(a => pts.forEach(b => { if (a === b) return; const i = idx.get(a), j = idx.get(b); if (i == null || j == null || J.d[i + ":" + j] == null) miss.push([a, b]); }));
  return { pts, miss };
}
function saveJarakLocal() { try { localStorage.setItem(JARAK_LS, JSON.stringify(state.jarakJalan || null)); } catch (e) {} }
async function valhallaMatrix(src, tgt) {
  const cfg = blokCfg(); const zona = cfg.nama.flatMap(n => blokTitik[n] || []).slice(-50);
  const loc = k => { const [la, ln] = k.split(",").map(Number); return { lat: la, lon: ln }; };
  const body = { sources: src.map(loc), targets: tgt.map(loc), costing: "auto", costing_options: { auto: cfg.tol ? { exclude_tolls: true, use_tolls: 0 } : {} }, units: "kilometers" };
  if (zona.length) body.exclude_locations = zona.map(([la, ln]) => ({ lat: la, lon: ln }));
  const wait = 1100 - (Date.now() - lastRouteReq); if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRouteReq = Date.now();
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 30000);
  try {
    // GET ?json= (cara yang sama dengan rute di peta, sudah terbukti lolos CORS); blok kecil agar URL tetap pendek
    const r = await fetch("https://valhalla1.openstreetmap.de/sources_to_targets?json=" + encodeURIComponent(JSON.stringify(body)), { signal: ctl.signal });
    let j; try { j = await r.json(); } catch (e) { throw new Error("HTTP " + r.status); } if (!j.sources_to_targets) throw new Error(j.error || ("HTTP " + r.status)); return j.sources_to_targets;
  } finally { clearTimeout(to); }
}
async function hitungJarak(manual) {
  if (roadJob.run) return;
  const { pts, miss } = jarakMissing(); if (!miss.length) { if (manual) toast("Semua jarak sudah memakai rute jalan sebenarnya."); return; }
  const cfg = roadCfgKey(state); if (!state.jarakJalan || state.jarakJalan.cfg !== cfg) state.jarakJalan = { cfg, k: [], d: {}, t: 0 };
  const J = state.jarakJalan, idx = new Map(J.k.map((k, i) => [k, i])); const at = k => { let i = idx.get(k); if (i == null) { i = J.k.length; J.k.push(k); idx.set(k, i); } return i; };
  // permintaan seminimal mungkin: baris penuh untuk titik baru, sisanya per kolom; tiap permintaan maks. 100 pasangan (batas server publik)
  const bySrc = new Map(); miss.forEach(([a, b]) => { if (!bySrc.has(a)) bySrc.set(a, new Set()); bySrc.get(a).add(b); });
  const full = pts.filter(a => bySrc.has(a) && bySrc.get(a).size > pts.length / 2), fullSet = new Set(full);
  const rest = miss.filter(([a]) => !fullSet.has(a)), blocks = [];
  const chunk = (S, T) => { const tsz = Math.max(1, Math.min(T.length, S.length < 10 ? Math.floor(MAXP / S.length) : 10)); for (let j = 0; j < T.length; j += tsz) { const Tc = T.slice(j, j + tsz), n = Math.max(1, Math.floor(MAXP / Tc.length)); for (let i = 0; i < S.length; i += n) blocks.push([S.slice(i, i + n), Tc]); } };
  if (full.length) chunk(full, pts);
  if (rest.length) chunk([...new Set(rest.map(x => x[0]))], [...new Set(rest.map(x => x[1]))]);
  const wasUnsaved = unsaved; let got = 0, failed = 0;
  Object.assign(roadJob, { run: true, done: 0, total: blocks.length, err: "" }); roadNote();
  for (const [S, T] of blocks) {
    try {
      const rows = await valhallaMatrix(S, T);
      rows.forEach((row, si) => (row || []).forEach((c, ti) => { if (!c || S[si] === T[ti]) return; if (typeof c.distance === "number" && c.distance >= 0) { J.d[at(S[si]) + ":" + at(T[ti])] = +c.distance.toFixed(2); got++; } }));
    } catch (e) { failed++; roadJob.err = e.name === "AbortError" ? "server rute tidak menjawab" : String(e.message || e).slice(0, 120); }
    roadJob.done++; roadNote();
  }
  J.t = Date.now(); roadJob.run = false;
  if (failed || got < miss.length) roadJob.failKey = cfg + "|" + pts.length;
  saveJarakLocal();
  if (got) {
    if (plan && !plan.error) runPlan(true); renderTab();
    if (ghToken() && !wasUnsaved) { await commitSave(); }
    else if (ghToken()) { save(); toast("Jarak jalan sebenarnya sudah dipakai. Tekan 💾 Simpan agar tersimpan untuk semua.", 5000); }
    else toast("Plan dihitung ulang memakai jarak jalan sebenarnya (" + got + " pasangan titik).", 4000);
  } else { roadNote(); toast("Jarak jalan belum bisa diambil" + (roadJob.err ? " (" + roadJob.err + ")" : "") + ". Plan memakai perkiraan.", 5000); }
}
function maybeHitungJarak() { // otomatis bila ada pasangan titik yang belum punya jarak jalan
  if (roadJob.run || !sharedChecked || !plan || plan.error) return;
  const { pts, miss } = jarakMissing(); if (!miss.length) return;
  if (roadJob.failKey === roadCfgKey(state) + "|" + pts.length) return; // sudah dicoba dan gagal: tunggu tombol
  hitungJarak(false);
}
function roadNoteHtml() {
  if (roadJob.run) return `<div class="banner info"><span class="spin" aria-hidden="true"></span><div><b>Menghitung jarak jalan sebenarnya…</b> ${roadJob.done}/${roadJob.total} bagian. Plan akan dihitung ulang otomatis setelah selesai.</div></div>`;
  const J = plan && plan.jarak; if (!J) return "";
  const tot = J.real + J.est;
  if (!J.est) return tot ? `<div class="hint" style="margin:-4px 0 12px">🛣 Jarak dan waktu tempuh memakai <b>rute jalan sebenarnya</b> (tanpa tol${blokCfg().nama.length ? ", menghindari jalan yang diblok" : ""}).</div>` : "";
  return `<div class="banner warn"><div><b>${J.real ? fmtNum(J.est) + " dari " + fmtNum(tot) + " perjalanan" : "Jarak"} masih memakai perkiraan</b> (garis lurus × ${fmtNum(+state.params.lalin.faktorJalan || 1.65, 2)}).${roadJob.err ? " Server rute: " + esc(roadJob.err) + "." : ""}</div><button class="btn sm" type="button" id="btnJarak">🛣 Hitung jarak jalan</button></div>`;
}
function roadNote() {
  const el = document.getElementById("roadNote"); if (!el) return;
  el.innerHTML = roadNoteHtml(); const b = document.getElementById("btnJarak"); if (b) b.onclick = () => { roadJob.failKey = ""; hitungJarak(true); };
}
/* ---------- Peta ---------- */
let mapBounds = null, map = null, mapLayer = null, mapDay = "all", mapDrawn = null, tileOk = false, tileErr = 0, useRoad = true;
const osrmCache = {};
try { localStorage.removeItem(LS_KEY + "-osrm"); Object.assign(osrmCache, JSON.parse(localStorage.getItem(LS_KEY + "-rute-tanpa-tol") || "{}")); } catch (e) {}
function ensureMap() {
  if (map || typeof L === "undefined") return;
  const el = $("#map"); el.innerHTML = ""; el.classList.add("map-gray");
  map = L.map(el, { preferCanvas: false, zoomControl: true, zoomSnap: 0.25, zoomDelta: 0.5 }).setView([plan.depot.lat, plan.depot.lng], 12);
  if (window.ResizeObserver) { let rt = null; new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (!map || tab !== "peta") return; map.invalidateSize(); if (mapBounds && !map._userMoved) map.fitBounds(mapBounds, { padding: [30, 30] }); }, 80); }).observe(el); }
  map.on("dragstart", () => { map._userMoved = true; }); el.addEventListener("wheel", () => { map._userMoved = true; }, { passive: true });
  const tl = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, subdomains: "abc", attribution: "© OpenStreetMap" }).addTo(map);
  tl.on("tileload", () => { if (!tileOk) { tileOk = true; updateMapNote(); } });
  tl.on("tileerror", () => { tileErr++; if (tileErr === 3) updateMapNote(); });
  mapLayer = L.layerGroup().addTo(map);
  setTimeout(updateMapNote, 4000);
}
function updateMapNote() {
  const n = $("#mapNote"); if (!n) return;
  if (!tileOk && tileErr >= 1) n.innerHTML = `<div class="banner info"><div><b>Peta dasar tidak bisa dimuat di halaman ini</b> (akses ke server peta dibatasi), jadi rute digambar sebagai garis lurus antar titik. Untuk peta dasar abu-abu dan rute mengikuti jalan, unduh aplikasi ini lewat <b>Data → Unduh aplikasi ini (HTML)</b> lalu buka file-nya di Chrome/Edge.</div></div>`;
  else n.innerHTML = "";
}
/* Rute jalan: Valhalla (FOSSGIS) dengan jalan tol DIBLOK (exclude_tolls) — termasuk Tol Reformasi, Tol Ir. Sutami, Tol Pelabuhan. */
function decodePoly6(str) {
  const out = []; let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let b, sh = 0, r = 0;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
      const d = (r & 1) ? ~(r >> 1) : (r >> 1);
      if (k === 0) lat += d; else lng += d;
    }
    out.push([+(lat / 1e6).toFixed(5), +(lng / 1e6).toFixed(5)]);
  }
  return out;
}
let lastRouteReq = 0;
/* Jalan yang diblok (Parameter): "blok semua tol" + daftar nama jalan. Nama jalan diblok secara adaptif:
   jika rute masih melewati jalan itu, titik-titik di ruas tsb. dikeluarkan (exclude_locations) lalu rute dihitung ulang. Titik yang dipelajari disimpan. */
const blokTitik = {};
try { Object.assign(blokTitik, JSON.parse(localStorage.getItem(LS_KEY + "-blok-titik") || "{}")); } catch (e) {}

function blokCfg() {
  const b = state.params.jalanBlok || {};
  return { tol: b.semuaTol !== false, nama: (b.daftar || []).filter(x => x.aktif !== false && String(x.nama || "").trim()).map(x => normJalan(x.nama)) };
}
function cincin(lat, lng, m) { const dl = m / 111320, dg = m / (111320 * Math.cos(lat * Math.PI / 180)); const r = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * 2 * Math.PI; r.push([+(lng + dg * Math.cos(a)).toFixed(6), +(lat + dl * Math.sin(a)).toFixed(6)]); } return r; }
async function valhalla(body) {
  const wait = 1100 - (Date.now() - lastRouteReq); if (wait > 0) await new Promise(r => setTimeout(r, wait)); // batas pemakaian server publik
  lastRouteReq = Date.now();
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 12000);
  try { const r = await fetch("https://valhalla1.openstreetmap.de/route?json=" + encodeURIComponent(JSON.stringify(body)), { signal: ctl.signal }); return await r.json(); }
  finally { clearTimeout(to); }
}
async function osrmRoute(pts) {
  const cfg = blokCfg();
  const key = (cfg.tol ? "T" : "t") + (cfg.nama.length ? "[" + cfg.nama.join("|") + "]" : "") + pts.map(p => p[0].toFixed(5) + "," + p[1].toFixed(5)).join(";");
  if (osrmCache[key]) return osrmCache[key];
  try {
    for (let iter = 0; iter < 5; iter++) {
      const zona = cfg.nama.flatMap(n => blokTitik[n] || []);
      const body = { locations: pts.map(p => ({ lat: p[0], lon: p[1], type: "break" })), costing: "auto", costing_options: { auto: cfg.tol ? { exclude_tolls: true, use_tolls: 0 } : {} }, directions_options: { units: "km" } };
      if (zona.length) body.exclude_locations = zona.slice(-50).map(([la, ln]) => ({ lat: la, lon: ln })); // ruas jalan di titik ini dikeluarkan (maks. 50 titik di server publik)
      const j = await valhalla(body);
      if (!j.trip || !j.trip.legs) return null;
      if (cfg.tol && j.trip.summary && j.trip.summary.has_toll) return null; // jangan pernah tampilkan rute lewat tol
      // cek nama jalan yang diblok
      let baru = 0;
      j.trip.legs.forEach(l => {
        const shp = decodePoly6(l.shape);
        (l.maneuvers || []).forEach(m => {
          const nms = (m.street_names || []).map(normJalan);
          const hit = cfg.nama.find(n => nms.some(x => x.includes(n))); if (!hit) return;
          const seg = shp.slice(m.begin_shape_index, m.end_shape_index + 1);
          const inner = seg.length > 2 ? seg.slice(1, -1) : seg; // hindari titik persimpangan
          const step = Math.max(1, Math.floor(inner.length / 3));
          const list = blokTitik[hit] = blokTitik[hit] || [];
          for (let i = 0; i < inner.length; i += step) { const p = inner[i]; if (!list.some(q => Math.abs(q[0] - p[0]) < 2e-4 && Math.abs(q[1] - p[1]) < 2e-4)) { list.push(p); baru++; } }
        });
      });
      if (!baru) {
        const g = j.trip.legs.flatMap(l => decodePoly6(l.shape));
        osrmCache[key] = g;
        try { localStorage.setItem(LS_KEY + "-rute-tanpa-tol", JSON.stringify(osrmCache)); } catch (e) {}
        return g;
      }
      try { localStorage.setItem(LS_KEY + "-blok-titik", JSON.stringify(blokTitik)); } catch (e) {}
    }
    return null; // masih melewati jalan yang diblok: tampilkan garis lurus
  } catch (e) { return null; }
}
function renderPeta() {
  if (!plan || plan.error) { if (mapLayer) mapLayer.clearLayers(); $("#mapTools").innerHTML = ""; $("#mapLegend").innerHTML = ""; $("#mapNote").innerHTML = `<div class="banner bad">${esc(plan ? plan.error : "Belum ada plan. Klik ▶ Buat Plan di kanan atas.")}</div>`; return; }
  if (mapDay !== "all" && !plan.days.includes(+mapDay)) mapDay = "all";
  if (typeof L === "undefined") { $("#mapNote").innerHTML = `<div class="banner bad">Library peta (Leaflet) gagal dimuat. Periksa koneksi internet.</div>`; return; }
  $("#mapTools").innerHTML = (planWeeks && planWeeks.length > 1 ? weekBarHtml() + '<span style="flex-basis:100%"></span>' : "") + `<button type="button" class="dchip big ${mapDay === "all" ? "on" : ""}" data-mday="all">Semua hari</button>` + plan.days.map(d => `<button type="button" class="dchip big ${mapDay === String(d) ? "on" : ""}" data-mday="${d}"><span class="dot" style="background:var(--d${d});margin-right:6px;width:9px;height:9px"></span>${HARI[d]}</button>`).join("") + `<label class="hint" style="display:flex;gap:6px;align-items:center;margin-left:auto"><input type="checkbox" id="useRoad" ${useRoad ? "checked" : ""}> Rute ikuti jalan (hindari jalan yang diblok)</label>`;
  document.querySelectorAll("[data-mday]").forEach(b => b.onclick = () => { mapDay = b.dataset.mday; mapDrawn = null; renderPeta(); });
  $("#useRoad").onchange = e => { useRoad = e.target.checked; mapDrawn = null; renderPeta(); };
  ensureMap();
  setTimeout(() => { const sz = map.getSize(); map.invalidateSize(); const nz = map.getSize(); if (mapBounds && (sz.x !== nz.x || sz.y !== nz.y)) map.fitBounds(mapBounds, { padding: [30, 30] }); }, 60);
  if (!window._mapRs) { window._mapRs = 1; window.addEventListener("resize", () => { if (tab === "peta" && map) map.invalidateSize(); }); }

  const sig = mapDay + "|" + useRoad;
  if (mapDrawn === sig) return;
  mapDrawn = sig;
  drawMap();
}
async function drawMap() {
  const sig = mapDrawn;
  mapLayer.clearLayers();
  const d0 = plan.depot;
  const trips = plan.trips.filter(t => mapDay === "all" || String(t.day) === mapDay);
  const bounds = [[d0.lat, d0.lng]];
  const legend = [];
  const visitDays = {};
  trips.forEach((t, i) => t.stops.forEach((s, k) => { (visitDays[s.store.id] = visitDays[s.store.id] || { s: s.store, list: [] }).list.push({ t, k, i }); }));
  // garis rute
  const lines = [];
  trips.forEach((t, i) => {
    const col = mapDay === "all" ? dayColor(t.day) : tripColor(t, i);
    const pts = [[d0.lat, d0.lng]].concat(t.stops.map(s => [s.store.lat, s.store.lng]), [[d0.lat, d0.lng]]);
    pts.forEach(p => bounds.push(p));
    const dash = t.shift > 1 ? "8 6" : null;
    const pl = L.polyline(pts, { color: col, weight: mapDay === "all" ? 3 : 4, opacity: .85, dashArray: dash }).addTo(mapLayer);
    pl.bindTooltip(`${HARI[t.day]} · ${esc(vehLabel(t.veh))} · Shift ${t.shift}`, { sticky: true });
    lines.push({ pl, pts, t });
    if (mapDay !== "all") legend.push(`<span><i class="sw" style="background:${col}"></i>${esc(vehLabel(t.veh))} · Shift ${t.shift} (${t.stops.length} titik, ${fmtNum(t.km, 1)} km)</span>`);
  });
  if (mapDay === "all") plan.days.forEach(d => legend.push(`<span><i class="sw" style="background:${dayColor(d)}"></i>${HARI[d]}</span>`));
  legend.push(`<span><i class="sw" style="background:none;border-top:2px dashed var(--muted);height:0;width:18px"></i>Shift 2 dst.</span>`);
  // titik store
  Object.values(visitDays).forEach(({ s, list }) => {
    const days = [...new Set(list.map(x => x.t.day))];
    let html;
    if (mapDay === "all") { const col = days.length > 1 ? "#17201d" : dayColor(days[0]); html = `<div class="storepin" style="background:${col}"></div>`; }
    else { const x = list[0]; html = `<div class="seqpin" style="background:${tripColor(x.t, x.i)}">${x.k + 1}</div>`; }
    const icon = L.divIcon({ html, className: "", iconSize: mapDay === "all" ? [12, 12] : [18, 18] });
    L.marker([s.lat, s.lng], { icon }).addTo(mapLayer).bindPopup(`<b>${esc(s.nama)}</b><br>${esc([s.alamat, s.kota].filter(Boolean).join(", "))}<br>${fmtNum(s.beratKg)} kg · ${s.loading === "Menaikkan" ? "Menaikkan barang" : "Menurunkan barang"}<br>Hari: ${days.map(d => HARI[d]).join(", ")}<br>Buka ${esc(s.buka || "-")}–${esc(s.tutup || "-")}`);
  });
  L.marker([d0.lat, d0.lng], { icon: L.divIcon({ html: '<div class="depotpin"><span>G</span></div>', className: "", iconSize: [22, 22] }), zIndexOffset: 1000 }).addTo(mapLayer).bindPopup(`<b>${esc(d0.nama)}</b><br>Origin / gudang`);
  if (mapDay === "all") legend.push(`<span><i class="sw" style="background:#17201d;border-radius:50%;width:10px;height:10px"></i>Store dikunjungi &gt;1 hari</span>`);
  $("#mapLegend").innerHTML = legend.join("");
  mapBounds = bounds.length > 1 ? bounds : null; map._userMoved = false;
  if (mapBounds) map.fitBounds(mapBounds, { padding: [30, 30] });
  // rute jalan (bertahap)
  if (useRoad) {
    for (const ln of lines) {
      if (mapDrawn !== sig) return;
      const g = await osrmRoute(ln.pts);
      if (mapDrawn !== sig) return;
      if (g) ln.pl.setLatLngs(g); else break;
    }
  }
}

/* ---------- Unduhan ---------- */
let dlApi;
async function saveFile(name, data, mime) {
  if (window.claude && window.claude.use) {
    if (dlApi === undefined) { try { dlApi = await window.claude.use("downloads"); } catch (e) { dlApi = null; } }
    if (dlApi) { try { await dlApi.save({ filename: name, data }); return; } catch (e) { if (e && e.code === "declined") return; toast("Unduhan gagal: " + (e && e.message || e)); return; } }
  }
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || "application/octet-stream" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function stamp() { const d = new Date(); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0"); }
function exportExcel() {
  if (typeof XLSX === "undefined") { toast("Library Excel gagal dimuat."); return; }
  if (!plan || plan.error) { toast("Belum ada plan. Klik ▶ Buat Plan dulu.", 3500); return; }
  if (plan.error) { toast(plan.error); return; }
  const wb = XLSX.utils.book_new();
  const WK = planWeeks && planWeeks.length > 1 ? planWeeks.filter(P => P && !P.error) : [plan], multi = WK.length > 1;
  const H0 = multi ? ["Minggu"] : [], pre = P => multi ? [weekLabel(P.week)] : [];
  const ring = [[...H0, "Hari", "Kendaraan", "Plat", "Shift", "Mulai shift", "Berangkat", "Kembali", "Durasi (jam)", "Jumlah titik", "Muatan diantar (kg)", "Muatan (ton)", "Kapasitas (kg)", "Isi muatan (%)", "Dinaikkan (kg)", "Jarak (km)", "Rute", "Link Google Maps"]];
  WK.forEach(P => P.trips.forEach(t => ring.push([...pre(P), HARI[t.day], t.veh.jenis, t.veh.plat, t.shift, fmtJam(t.shiftStart), fmtJam(t.dep), fmtJam(t.ret), +(t.dur / 60).toFixed(2), t.stops.length, Math.round(t.kgDel), +(t.kgDel / 1000).toFixed(2), +t.veh.kapasitasKg, Math.round(t.kgDel / t.veh.kapasitasKg * 100), Math.round(t.kgPick), +t.km.toFixed(1), t.stops.map(s => s.store.nama).join(" > "), gmapsLink(t)])));
  const det = [[...H0, "Hari", "Kendaraan", "Plat", "Shift", "Urutan", "Store", "Alamat", "Kota/Kabupaten", "Kegiatan", "Berat (kg)", "Berat (ton)", "Jarak dari titik sebelumnya (km)", "Waktu tempuh (menit)", "Jam berangkat", "Jam tiba", "Mulai bongkar/muat", "Jam selesai", "Istirahat terpotong (menit)", "Tunggu buka (menit)", "Jam buka", "Latitude", "Longitude"]];
  WK.forEach(P => P.trips.forEach(t => { t.stops.forEach((s, i) => det.push([...pre(P), HARI[t.day], t.veh.jenis, t.veh.plat, t.shift, i + 1, s.store.nama, s.store.alamat || "", s.store.kota || "", s.store.loading === "Menaikkan" ? "Menaikkan barang" : "Menurunkan barang", +s.store.beratKg, +(s.store.beratKg / 1000).toFixed(3), +s.km.toFixed(1), Math.round(s.drive), fmtJam(s.depart), fmtJam(s.arr), fmtJam(s.start), fmtJam(s.fin), Math.round(s.brk), Math.round(s.wait), (s.store.buka || "") + "-" + (s.store.tutup || ""), s.store.lat, s.store.lng])); det.push([...pre(P), HARI[t.day], t.veh.jenis, t.veh.plat, t.shift, "↩", "Kembali ke " + plan.depot.nama, "", "", "Kembali ke gudang", "", "", +t.backKm.toFixed(1), Math.round(t.backMin), fmtJam(t.backDep), fmtJam(t.ret), "", "", Math.round(t.backBrk), "", "", P.depot.lat, P.depot.lng]); }));
  const gan = [[...H0, "Hari", "Kendaraan", "Plat", "Shift", "Kegiatan", "Jenis", "Mulai", "Selesai", "Durasi (menit)"]];
  WK.forEach(P => P.trips.forEach(t => t.segs.forEach(s => gan.push([...pre(P), HARI[t.day], t.veh.jenis, t.veh.plat, t.shift, s.label, s.type, fmtJam(s.start), fmtJam(s.end), Math.round(s.end - s.start)]))));
  const veh = [["Jenis", "Plat", "Kapasitas (kg)", "Kapasitas (ton)", "Kecepatan (km/jam)", "Maks shift/hari", "Maks km/rit", "Maks radius dari gudang (km)", "Bahan bakar", "Aktif"]];
  state.vehicles.forEach(v => veh.push([v.jenis, v.plat, +v.kapasitasKg, +(v.kapasitasKg / 1000).toFixed(2), +v.kecepatan, +v.maksShift, +v.maksKmRit > 0 ? +v.maksKmRit : "Bebas", +v.maksRadiusKm > 0 ? +v.maksRadiusKm : "Bebas", v.bbm || "Solar", v.aktif !== false ? "Ya" : "Tidak"]));
  const sto = storeRows();
  const par = [["Parameter", "Nilai"], ["Jam kerja per shift (jam)", state.params.jamShift], ["Jam mulai aktivitas", state.params.jamMulai], ["Rasio loading di store (kg/menit)", state.params.rasioKgMenit], ["Hari distribusi", HARI.filter((h, d) => state.params.hari[d]).join(", ")], [], ["Aktivitas", "Durasi (menit)", "Hari", "Waktu pelaksanaan", "Berlaku", "Masuk jam shift"]];
  state.params.aktivitas.forEach(a => par.push([a.nama, a.durasi, HARI3.filter((h, d) => a.hari[d]).join(", "), a.waktu === "setelah" ? "Setelah kembali ke gudang" : "Sebelum berangkat", a.berlaku === "shift1" ? "Shift 1 saja" : "Setiap shift", a.dihitung ? "Ya" : "Tidak"]));
  { const F = state.params.fairness, PS = state.params.prioritasSolar;
    par.push([], ["Pembagian tugas kendaraan", ""], ["Utamakan kendaraan solar", PS.aktif !== false ? "Ya (" + (PS.tingkat || "sedang") + ")" : "Tidak"], ["Fairness", F.aktif ? "Ya (" + (F.tingkat || "sedang") + ")" : "Tidak"]);
    if (F.aktif) par.push(["Kriteria fairness", FAIR_K.filter(([k]) => F[k]).map(x => x[1]).join(", ")], ["Muatan sebagai % kapasitas", F.kgRelatif !== false ? "Ya" : "Tidak"]); }
  par.push([], ["Jalan yang diblok", ""], ["Blok semua jalan tol", state.params.jalanBlok.semuaTol !== false ? "Ya" : "Tidak"]);
  state.params.jalanBlok.daftar.forEach(j => par.push([j.nama, j.aktif !== false ? "Aktif" : "Nonaktif"]));
  par.push([], ["Jam istirahat", "Hari"]);
  HARI.forEach((h, d) => par.push([(state.breaks[d] || []).map(b => b.mulai + "-" + b.selesai).join(", ") || "-", h]));
  if (multi) par.push([], ["Siklus (minggu)", WK.length], ["Minggu 1 dimulai", state.params.mingguMulai]);
  const UN = WK.flatMap(P => P.unserved.map(u => [u.store.nama, (multi ? weekLabel(P.week, true) + " · " : "") + HARI[u.day], u.reason]));
  if (UN.length) { par.push([], ["Belum terlayani", "Hari", "Alasan"]); UN.forEach(r => par.push(r)); }
  const VS = vehSummary(multi ? Object.assign({}, plan, { trips: WK.flatMap(P => P.trips) }) : plan);
  const vs = [["Jenis kendaraan", "Plat", "Total rit", "Total kunjungan", "Muatan diantar (kg)", "Muatan diantar (ton)", "Muatan dinaikkan (kg)", "Muatan dinaikkan (ton)", "Jarak tempuh (km)", "Total jam kerja", "% jam kerja (thd " + state.params.jamShift + " jam/shift)", "% muatan"]];
  const vsRow = (j, p, r) => [j, p, r.rit, r.kunj, Math.round(r.del), +(r.del / 1000).toFixed(2), Math.round(r.pick), +(r.pick / 1000).toFixed(2), +r.km.toFixed(1), +r.jam.toFixed(2), Math.round(r.jamPct * 100), Math.round(r.muatPct * 100)];
  VS.rows.forEach(r => vs.push(vsRow(r.v.jenis, r.v.plat, r)));
  vs.push(vsRow("TOTAL", "", VS.total));
  const add = (name, aoa, widths) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = widths.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); };
  if (multi) { const wk = [["Minggu", "Rit", "Kunjungan", "Jarak (km)", "Jam kerja", "Belum terlayani"]]; WK.forEach(P => { const t = weeksTotal([P]); wk.push([weekLabel(P.week), t.rit, t.kunj, +t.km.toFixed(1), +t.jam.toFixed(1), t.un]); }); const T = weeksTotal(WK); wk.push(["TOTAL SIKLUS", T.rit, T.kunj, +T.km.toFixed(1), +T.jam.toFixed(1), T.un]); add("Ringkasan per Minggu", wk, [30, 8, 11, 12, 11, 15]); }
  add("Ringkasan Kendaraan", vs, [16, 12, 9, 13, 16, 16, 18, 18, 15, 13, 22, 10]);
  add("Ringkasan Rit", ring, [...(multi ? [26] : []), 9, 12, 12, 6, 10, 10, 10, 10, 10, 14, 10, 12, 10, 12, 10, 80, 40]);
  add("Detail Rute", det, [...(multi ? [26] : []), 9, 12, 12, 6, 7, 34, 20, 18, 10, 10, 14, 12, 12, 9, 12, 10, 12, 12, 12, 11, 11]);
  add("Gantt", gan, [...(multi ? [26] : []), 9, 12, 12, 6, 44, 10, 8, 8, 10]);
  add("Kendaraan", veh, [12, 14, 14, 14, 16, 14, 8]);
  add("Store", sto, [8, 34, 22, 40, 11, 11, 8, 8, 10, 10, 9, 10, 18, 16]);
  add("Parameter", par, [40, 18, 30, 14, 14]);
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveFile("Plan_Distribusi_" + stamp() + ".xlsx", new Uint8Array(out), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
const STORE_HEAD = ["Aktif", "Nama store", "Alamat", "Kota/Kabupaten", "Link maps", "Latitude", "Longitude", "Jam buka", "Jam tutup", "Berat (kg)", "Berat (ton)", "Frekuensi kirim", "Jenis antaran", "Jenis loading", "Hari beroperasi", "Minggu kirim ke"];
function storeRows() {
  const rows = [STORE_HEAD];
  state.stores.forEach(s => rows.push([s.aktif !== false ? "Ya" : "Tidak", s.nama, s.alamat || "", s.kota || "", s.link || "", s.lat, s.lng, s.buka, s.tutup, +s.beratKg || 0, +((+s.beratKg || 0) / 1000).toFixed(3), (s.antaran === "Origin" ? "" : frekText(s)), s.antaran, s.loading === "Menaikkan" ? "Menaikkan barang" : "Menurunkan barang", ((s.hariOperasi || []).length === 7 ? "Setiap hari" : (s.hariOperasi || []).map(d => HARI3[d]).join(", ")), periodeOf(s) > 1 ? (s.mingguKe || "Otomatis") : ""]));
  return rows;
}
function parseNum(v, coord) {
  if (typeof v === "number") return v;
  let s = String(v ?? "").trim().replace(/\s|kg/gi, ""); if (!s) return NaN;
  if (coord) return parseFloat(s.replace(",", "."));
  if (s.includes(".") && s.includes(",")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  return parseFloat(s);
}
const normNama = n => String(n || "").toLowerCase().replace(/\s+/g, " ").trim();
function storeTemplate() {
  if (typeof XLSX === "undefined") return toast("Library Excel gagal dimuat.");
  const wb = XLSX.utils.book_new();
  const contoh = [
    ["Ya", "Gudang Utama", "", "", "https://www.google.com/maps/place/@-5.1019978,119.4786111,17z", "", "", "06:00", "23:00", 0, "", "", "Origin", "Menurunkan barang", "Setiap hari"],
    ["Ya", "Store A", "", "", "https://www.google.com/maps/place/@-5.1631663,119.4525599,17z", "", "", "08:00", "21:00", 950, "", "2x seminggu", "Tujuan", "Menurunkan barang", "Sen, Sel, Rab, Kam, Jum"],
    ["Ya", "Produksi", "", "", "", -5.1169668, 119.5093495, "07:00", "22:00", 1500, "", "5x seminggu", "Tujuan", "Menaikkan barang", "Sen, Sel, Rab, Kam, Jum, Sab", ""],
    ["Ya", "Store B", "", "", "https://www.google.com/maps/place/@-5.135,119.43,17z", "", "", "08:00", "21:00", 400, "", "1x 2 minggu", "Tujuan", "Menurunkan barang", "Setiap hari", "Otomatis"]];
  const ws = XLSX.utils.aoa_to_sheet([STORE_HEAD, ...contoh]);
  ws["!cols"] = STORE_HEAD.map(h => ({ wch: /Nama|Alamat|Link/.test(h) ? 30 : 16 }));
  XLSX.utils.book_append_sheet(wb, ws, "Store");
  const pet = [["Kolom", "Keterangan"],
    ["Nama store", "Wajib. Kunci pencocokan: nama yang sama (huruf besar/kecil & spasi diabaikan) akan MEMPERBARUI store yang sudah ada."],
    ["Link maps", "Link titik Google Maps (URL lengkap). Latitude/longitude & alamat terisi otomatis dari link."],
    ["Alamat, Kota/Kabupaten", "Boleh dikosongkan; diisi otomatis dari koordinat setelah upload."],
    ["Latitude, Longitude", "Opsional bila Link maps diisi."],
    ["Jam buka, Jam tutup", "Format JJ:MM, mis. 08:00."],
    ["Berat (kg)", "Muatan per kunjungan."],
    ["Frekuensi kirim", "1x seminggu s/d 7x seminggu, atau 1x 2 minggu, 1x 3 minggu, 1x 4 minggu, 1x 5 minggu. Kosong = 1x seminggu (Origin = tidak dikirim)."],
    ["Minggu kirim ke", "Hanya untuk 1x 2–5 minggu: minggu ke berapa dalam siklus store dikirim (1 = minggu pertama). Kosong / Otomatis = dibagi rata agar beban tiap minggu seimbang."],
    ["Jenis antaran", "Tujuan atau Origin (gudang asal)."],
    ["Jenis loading", "Menurunkan barang atau Menaikkan barang."],
    ["Hari beroperasi", "Hari store buka/menerima kiriman, mis. Sen, Sel, Rab, Kam, Jum. Kosong atau \"Setiap hari\" = semua hari. Hari kirim dipilih otomatis di antara hari ini sesuai frekuensi."],
    ["", ""],
    ["Aturan upload", "Store yang sama = diperbarui dengan data terbaru. Store baru = ditambahkan. Store yang tidak ada di file = tetap ada (tidak dihapus). Sel kosong tidak menimpa data lama."]];
  const wp = XLSX.utils.aoa_to_sheet(pet); wp["!cols"] = [{ wch: 24 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wp, "Petunjuk");
  saveFile("Template_Store.xlsx", new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" })), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
function importStores(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const wb = XLSX.read(new Uint8Array(rd.result), { type: "array" });
      const sh = wb.SheetNames.find(n => /store/i.test(n)) || wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sh], { header: 1, raw: true, defval: "" });
      if (!rows.length) throw new Error("file kosong");
      const head = rows[0].map(h => String(h).toLowerCase());
      const col = (...keys) => head.findIndex(h => keys.some(k => h.includes(k)));
      const c = { aktif: col("aktif"), nama: col("nama"), alamat: col("alamat"), kota: col("kota", "kabupaten"), link: col("link", "maps", "url"), lat: col("lat"), lng: col("long", "lng", "lon"), buka: col("buka", "mulai"), tutup: col("tutup"), kg: col("kg", "berat", "muatan"), frek: col("frek"), antaran: col("antaran", "jenis antar"), loading: col("loading"), hari: col("hari"), mgg: col("minggu kirim", "minggu ke") };
      if (c.nama < 0) throw new Error("kolom \"Nama store\" tidak ditemukan");
      const cell = (r, k) => c[k] >= 0 ? r[c[k]] : "";
      const has = (r, k) => c[k] >= 0 && String(r[c[k]] ?? "").trim() !== "";
      const normT = v => { if (typeof v === "number" && v >= 0 && v < 1.0001) v = fmtJam(Math.min(1439, Math.round(v * 1440))); const m = toMin(v); return m == null ? "" : fmtJam(m); };
      const byName = new Map(); state.stores.forEach((s, i) => { const k = normNama(s.nama); if (!byName.has(k)) byName.set(k, i); });
      const touched = new Set(); let upd = 0, add = 0; const added = []; const geo = [];
      for (const r of rows.slice(1)) {
        const nama = String(cell(r, "nama") || "").trim(); if (!nama) continue;
        const key = normNama(nama);
        let idx = byName.get(key), s;
        const baru = idx == null;
        if (baru) { s = { id: uid("s"), aktif: true, nama, alamat: "", kota: "", link: "", lat: null, lng: null, buka: "08:00", tutup: "21:00", beratKg: 0, frek: 1, antaran: "Tujuan", loading: "Menurunkan", hariOperasi: [0, 1, 2, 3, 4, 5, 6] }; state.stores.push(s); idx = state.stores.length - 1; byName.set(key, idx); add++; added.push(idx); }
        else { s = state.stores[idx]; if (!touched.has(idx) && !added.includes(idx)) upd++; }
        touched.add(idx);
        if (has(r, "aktif")) s.aktif = !/^(tidak|no|0|false|n)$/i.test(String(cell(r, "aktif")).trim());
        if (has(r, "antaran")) s.antaran = /orig/i.test(cell(r, "antaran")) ? "Origin" : "Tujuan";
        if (has(r, "alamat")) { s.alamat = String(cell(r, "alamat")).trim(); s.alamatAuto = false; }
        if (has(r, "kota")) s.kota = String(cell(r, "kota")).trim();
        let lat = has(r, "lat") ? parseNum(cell(r, "lat"), true) : NaN, lng = has(r, "lng") ? parseNum(cell(r, "lng"), true) : NaN;
        const oldLat = s.lat, oldLng = s.lng;
        if (has(r, "link")) { const link = String(cell(r, "link")).trim(); s.link = link; if (isNaN(lat) || isNaN(lng)) { const p = parseKoordinat(link); if (p && p.lat != null) { lat = p.lat; lng = p.lng; } } }
        if (!isNaN(lat) && !isNaN(lng)) { s.lat = lat; s.lng = lng; }
        const moved = s.lat != null && (oldLat !== s.lat || oldLng !== s.lng);
        if (moved && !has(r, "alamat")) { s.alamatAuto = true; if (!has(r, "kota")) s.kota = ""; }
        if (s.lat != null && (moved || !s.alamat || !s.kota)) geo.push(s);
        if (has(r, "buka")) s.buka = normT(cell(r, "buka")) || s.buka;
        if (has(r, "tutup")) s.tutup = normT(cell(r, "tutup")) || s.tutup;
        if (has(r, "kg")) s.beratKg = parseNum(cell(r, "kg")) || 0;
        if (has(r, "frek")) s.frek = parseFrek(cell(r, "frek"));
        else if (baru) s.frek = s.antaran === "Origin" ? 0 : 1;
        if (has(r, "mgg")) { const v = parseInt(cell(r, "mgg")); if (v >= 1 && v <= 5) s.mingguKe = v; else delete s.mingguKe; }
        if (has(r, "loading")) s.loading = /naik|muat|pick/i.test(cell(r, "loading")) ? "Menaikkan" : "Menurunkan";
        if (has(r, "hari")) { const t = String(cell(r, "hari")).trim(); s.hariOperasi = /setiap|semua|tiap/i.test(t) ? [0, 1, 2, 3, 4, 5, 6] : [...new Set(t.split(/[,;/ ]+/).map(x => HARI3.findIndex(h => x.toLowerCase().startsWith(h.toLowerCase()))).filter(i => i >= 0))].sort((a, b) => a - b); }
      }
      if (!touched.size) throw new Error("tidak ada baris store");
      const tetap = state.stores.length - touched.size;
      save(); storeFilter = ""; setTab("store");
      const msg = `Upload "${file.name}": ${upd} store diperbarui, ${add} ditambah, ${tetap} tetap.`;
      lastImport = msg; renderStore(); toast(msg, 5000);
      isiAlamatBanyak([...new Set(geo)]);
    } catch (e) { toast("Upload gagal: " + e.message, 4000); }
  };
  rd.readAsArrayBuffer(file);
}
let lastImport = "";
async function isiAlamatBanyak(list) {
  const b = document.getElementById("geoAll"); let n = 0, ok = 0;
  for (const s of list) {
    const i = state.stores.indexOf(s); if (i < 0) continue;
    n++; const bb = document.getElementById("geoAll"); if (bb) { bb.disabled = true; bb.textContent = "Mengisi alamat " + n + "/" + list.length + "…"; }
    if (await isiAlamat(s, i)) ok++;
  }
  const bb = document.getElementById("geoAll"); if (bb) { bb.disabled = false; bb.textContent = "⟳ Isi alamat otomatis"; }
  if (list.length) toast(ok + " dari " + list.length + " alamat terisi");
  return ok;
}
function askConfirm(text, actions) {
  const box = $("#confirmBox"); box.hidden = false;
  box.innerHTML = `<div class="banner info confirm" style="margin-bottom:16px"><span>${text}</span>${actions.map((a, i) => `<button class="btn sm ${i === 0 ? "primary" : ""}" type="button" data-ci="${i}">${esc(a[0])}</button>`).join("")}<button class="btn sm ghost" type="button" data-ci="x">Batal</button></div>`;
  box.querySelectorAll("[data-ci]").forEach(b => b.onclick = () => { box.hidden = true; box.innerHTML = ""; if (b.dataset.ci !== "x") actions[+b.dataset.ci][1](); });
  window.scrollTo({ top: 0 });
}

/* ---------- Menu ---------- */
$("#btnMenu").onclick = e => { e.stopPropagation(); $("#menuPop").hidden = !$("#menuPop").hidden; };
document.addEventListener("click", e => { if (!e.target.closest(".menu")) $("#menuPop").hidden = true; });
$("#menuPop").addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return; $("#menuPop").hidden = true;
  const a = b.dataset.act;
  if (a === "excel") exportExcel();
  if (a === "export") saveFile("Data_Input_Distribusi_" + stamp() + ".json", JSON.stringify(state, null, 1), "application/json");
  if (a === "import") $("#fileJson").click();
  if (a === "importStore") { if (typeof XLSX === "undefined") return toast("Library Excel gagal dimuat."); $("#fileStore").click(); }
  if (a === "template") storeTemplate();
  if (a === "github") ghDialog();
  if (a === "html") { let h = PRISTINE; state._stamp = Date.now(); state._savedAt = Date.now(); try { localStorage.setItem(LS_KEY, JSON.stringify(state)); unsaved = false; saveStatus(); } catch (e) {} const inj = "<script>window.INIT_STATE=" + JSON.stringify(state).replace(/</g, "\\u003c") + ";<\/script>\n"; const at = h.indexOf("<script>\n/*BOOT*/"); if (at >= 0) h = h.slice(0, at) + inj + h.slice(at); saveFile("Perencana_Distribusi.html", h, "text/html"); }
  if (a === "sample") askConfirm("Ganti semua data input dengan contoh data Lazuna?", [["Ya, muat contoh", () => { state = normalize(clone(SAMPLE)); save(); stopDeep(); plan = null; planWeeks = null; renderTab(); toast("Contoh data dimuat. Klik ▶ Buat Plan untuk membuat plan."); }]]);
  if (a === "clear") askConfirm("Kosongkan semua kendaraan dan store? Parameter dan jam istirahat tetap.", [["Ya, kosongkan", () => { state.vehicles = []; state.stores = []; save(); plan = null; renderTab(); }]]);
});
$("#fileJson").onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { state = normalize(JSON.parse(rd.result)); save(); stopDeep(); plan = null; planWeeks = null; renderTab(); toast("Data input dimuat. Klik ▶ Buat Plan untuk membuat plan."); } catch (er) { toast("File JSON tidak valid", 4000); } }; rd.readAsText(f); e.target.value = ""; };
$("#fileStore").onchange = e => { const f = e.target.files[0]; if (f) importStores(f); e.target.value = ""; };

/* ---------- mulai ---------- */
(function start() {
  let t = location.hash.slice(1);
  if (!document.getElementById("p-" + t)) { try { t = localStorage.getItem(LS_KEY + "-tab") || "plan"; } catch (e) { t = "plan"; } }
  if (!document.getElementById("p-" + t)) t = "plan";
  try { mergeJarak(JSON.parse(localStorage.getItem(JARAK_LS) || "null")); } catch (e) {}
  loadSavedPlan(); // plan terakhir yang disimpan langsung tampil; plan baru hanya dibuat saat tombol "Buat Plan" diklik
  setTab(t);
  loadShared();
})();
window.addEventListener("resize", () => { clearTimeout(ganttRs); ganttRs = setTimeout(() => { const w = $("#p-gantt").clientWidth; if (tab === "gantt" && plan && Math.abs(w - ganttW) > 40) renderGantt(); }, 200); });
