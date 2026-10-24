# SKILL: KUMA ATM NOC & GRAPH REALTIME AGENT

## 1. Core Mandate & Activation Rules
Setiap prompt, tugas, atau interaksi dalam repository ini **WAJIB** menerapkan prinsip:
1. **Superpowers Discipline:**
   - **Brainstorming & Planning First:** Setiap perubahan arsitektur, UI baru, atau penambahan fitur wajib melalui konfirmasi rencana sebelum coding.
   - **Test-Driven / Verified:** Verifikasi setiap perubahan kode dengan linter, build test, atau manual check. Jangan pernah membuat klaim berhasil tanpa bukti eksekusi.
   - **Systematic Debugging:** Jika terjadi issue (misal `SQLITE_BUSY`, high CPU ping process, WebSocket lag), telusuri akar masalah secara sistematis dari log dan trace.

2. **UI/UX Pro Max Standard:**
   - Selalu patuhi standar desain profesional: token warna semantik, kontras WCAG 4.5:1, micro-interaction 150–250ms, tanpa icon emoji untuk kontrol struktural.
   - Pertahankan konsistensi visual 100% dengan UI bawaan Uptime Kuma (Vue 3, Bootstrap 5 / SCSS).

3. **Strict Anti-AI-Slop Protocol:**
   - **No Vibe Coding:** Dilarang menghasilkan kode acak tanpa pemahaman menyeluruh terhadap arsitektur Uptime Kuma.
   - **No Bloatware:** Jangan menambahkan dependensi raksasa jika fungsi dapat diselesaikan dengan modul ringan atau native Node.js/Vue 3.
   - **Manual Review Gate:** Setiap perubahan file dijelaskan tujuannya secara transparan agar developer memahami baris demi baris logikanya.

---

## 2. Technical Stack & Execution Guidelines

### A. Database: MariaDB / MySQL
- **Driver:** `mysql2` terintegrasi via Knex (`server/database.js`).
- **Connection Pool:** Konfigurasi pool max connections disesuaikan (default 10–100) untuk menampung throughput write heartbeat.
- **Heartbeat Archival & Retention:** 400 ATM pada interval 5–10 detik menghasilkan jutaan baris record per hari. Gunakan query terindeks (`monitor_id`, `time`) dan buat mekanisme agregasi/pembersihan berkala agar performa database tidak turun.

### B. Monitoring Engine (400+ ATM Ping)
- **Ping Interval:** Baseline 10 detik untuk seluruh node; 5 detik hanya untuk prioritas kritis.
- **Execution Concurrency:** Hindari process storm (menjalankan 400 child process ICMP ping bersamaan). Gunakan queue / staggered offset scheduling.
- **Failover & Timeout:** Timeout ping disesuaikan (1–2 detik per ping) agar koneksi ATM down tidak memblokir antrean monitor lain.

### C. Realtime Architecture (Socket.io)
- **State vs History:** Event WebSocket hanya mengirim delta status terkini (`heartbeat` event) ke client, bukan dump seluruh data riwayat.
- **Frontend Batching / Throttling:** Graph View dan Card NOC harus meng-throttle render update menggunakan `requestAnimationFrame` untuk mencegah browser freeze saat ratusan event masuk per detik.

---

## 3. UI Implementation Checklist
Sebelum submit komponen baru (NOC Board & Topology Graph):
- [ ] Komponen menggunakan style token Uptime Kuma (`src/assets/vars.scss` & `app.scss`).
- [ ] Graph view mendukung 400+ node secara lancar (menggunakan Canvas/WebGL via Cytoscape.js atau sejenisnya).
- [ ] Card NOC memiliki filter instan (Semua, Up, Down, Latency tinggi, Wilayah/Cabang).
- [ ] Desain responsif dan mendukung dark mode bawaan Kuma (`#0d1117`).
- [ ] Tidak ada dependency conflict dengan build Vite & Vue 3 project saat ini.
