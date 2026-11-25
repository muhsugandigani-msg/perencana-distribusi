# Perencana Distribusi

Web untuk membuat plan distribusi mingguan, Gantt armada, dan peta rute.
Satu file statis (`index.html`), tanpa server. Data input tersimpan di browser masing-masing pengguna
(gunakan menu Data → Simpan data input (JSON) untuk berbagi data).

Peta: OpenStreetMap (abu-abu) + rute jalan dari OSRM demo server. Library: Leaflet 1.9.4, SheetJS 0.18.5 (cdnjs).

## Struktur
- `index.html` — aplikasi siap pakai (yang dilayani GitHub Pages).
- `src/` — sumber: `engine.js` (mesin penjadwalan), `app.js` (antarmuka), `template.html` (tampilan), `sample.json` (contoh data Lazuna).
- `tests/` — skrip uji (Node + Playwright).
