# UPTIME KUMA ATM NOC & REALTIME GRAPH DESIGN SYSTEM

> **Tujuan Dokumen:** Menjamin konsistensi visual 100% dengan identitas Uptime Kuma asli, mempertahankan standar UI/UX Pro Max, dan mencegah munculnya **AI Slop** (komponen generik tanpa konteks, dependensi berlebihan, atau inkonsistensi tema).

---

## 1. Identitas Visual & Design Tokens (Native Kuma)

Semua komponen baru (NOC Cards, Graph View, Metrics Bar) **wajib** menggunakan token warna dan CSS class bawaan Uptime Kuma:

### A. Palet Warna Utama (Sesuai `src/assets/vars.scss`)
| Nama Token | Hex Code | Deskripsi & Penggunaan |
|---|---|---|
| `$primary` | `#5cdd8b` | Status **UP / Normal**, tombol aktif, highlight utama Kuma |
| `$danger` | `#dc3545` | Status **DOWN / Kritis**, error alert, stop button |
| `$warning` | `#f8a306` | Status **PENDING / Degraded / High Latency** |
| `$maintenance` | `#1747f5` | Status **Under Maintenance** ATM/Node |
| `$secondary-text` | `#aaa` / `#6c757d` | Metadata sekunder (IP, timestamp, lokasi cabang) |
| `$dark-bg` | `#0d1117` | Background container / card pada Dark Mode |
| `$dark-bg2` | `#070a10` | Background canvas graph, panel input, row hover |
| `$dark-header-bg` | `#161b22` | Header navbar, floating toolbar, status bar |
| `$dark-border-color`| `#1d2634` | Garis tepi border, divider antar node / card |
| `$dark-font-color` | `#b1b8c0` | Warna teks utama pada dark mode |

### B. Tipografi & Ukuran
- **Font Stack:** Bawaan Uptime Kuma (`Twemoji Country Flags, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`).
- **Heading Stat:** 30px / 32px (bold, angka metrik NOC).
- **Label / Card Title:** 14px / 15px (medium 500, truncate untuk nama ATM).
- **Sub-info (IP, Region, Latency):** 11px - 12px (monospace / semantik).

---

## 2. Arsitektur Komponen: ATM NOC Board (Card View)

Dashboard NOC dirancang untuk memantau 400+ ATM secara simultan tanpa membuat browser lambat.

```
+-----------------------------------------------------------------------------------------+
| [NOC TOOLBAR]  [Search ATM / IP...]  [Filter: All (400) | Up (385) | Down (10) | Degraded (5)] |
+-----------------------------------------------------------------------------------------+
| [ATM CARD: KCP-MALANG-01]               | [ATM CARD: KCP-SURABAYA-04]                   |
| Status: UP (#5cdd8b)                    | Status: DOWN (#dc3545)                        |
| IP: 10.24.12.105 | Latency: 18ms        | IP: 10.24.18.22  | Latency: TIMEOUT           |
| Packet Loss: 0%  | Branch: Malang Kota  | Packet Loss: 100% | Branch: Gubeng             |
| [ |||||||||||||||||||||| Mini Heartbeat ]| [ |||||||||||||||||||||| Mini Heartbeat ]    |
+-----------------------------------------------------------------------------------------+
```

### Spesifikasi Card NOC:
1. **Container Class:** `shadow-box` (mengikuti class bawaan `DashboardHome.vue`).
2. **Dense Mode:** Padding 10px–12px, border-radius 10px, background `$dark-bg` (`#0d1117`).
3. **Pill Status Badge:** Menggunakan komponen native `<Uptime :pill="true" />` dan icon FontAwesome (`check-circle`, `times-circle`, `exclamation-triangle`).
4. **Mini Sparkline / Heartbeat Bar:** Menggunakan versi ringkas dari `HeartbeatBar.vue` (20 tick terakhir).
5. **Virtual Scrolling:** Karena ada 400+ card, gunakan virtual scrolling jika ditampilkan dalam 1 halaman grid agar DOM nodes tidak melebihi 1000 element.

---

## 3. Arsitektur Komponen: Realtime Topology Graph View (Obsidian Style)

Visualisasi jaringan topologi ATM menyerupai graph Obsidian (Force-Directed Graph).

```
                      ( Core Switch / VPN Gateway )
                                   |
         +-------------------------+-------------------------+
         |                                                   |
( Branch Hub A: Jatim )                             ( Branch Hub B: Jateng )
    /       |       \                                   /       |       \
[ATM-01] [ATM-02] [ATM-03]                          [ATM-04] [ATM-05] [ATM-06]
 (🟢)     (🔴)     (🟢)                                (🟢)     (🟡)     (🟢)
```

### Spesifikasi Graph View:
1. **Engine Render:** Gunakan **Canvas / WebGL** (seperti `Cytoscape.js` dengan renderer Canvas atau `Force-Graph` 2D). Dilarang keras menggunakan SVG untuk 400+ node karena SVG menyebabkan lag render saat animasi fisika dijalankan.
2. **Hierarki Node:**
   - **Tier 1 (Root):** Data Center / Head Office Gateway (Node radius 16px, icon router).
   - **Tier 2 (Hub/Region):** Router Cabang / Region (Node radius 12px).
   - **Tier 3 (Leaf):** Terminal ATM (Node radius 7px).
3. **Status Warna Node:**
   - UP: `#5cdd8b` dengan subtle glow aura 2px.
   - DOWN: `#dc3545` berkedip lambat (pulsing effect).
   - DEGRADED / HIGH LATENCY: `#f8a306`.
   - MAINTENANCE: `#1747f5`.
4. **Edge / Link:**
   - Garis koneksi tipis (`#1d2634`), berubah merah jika node target DOWN.
   - Ketebalan garis dapat merepresentasikan latency (makin tebal atau putus-putus jika jitter tinggi).
5. **Interaksi:**
   - Zoom & Pan halus dengan mouse wheel dan drag.
   - Klik Node: Menampilkan drawer samping detail ATM (IP, histori latency 1 jam, link ke edit monitor).
   - Filter Cluster: Tombol untuk isolate cabang atau hanya tampilkan node yang DOWN.

---

## 4. Realtime Data Stream & Throttling (Anti-Freeze Browser)

Jika 400 ATM diping setiap 5–10 detik:
- Setiap detik ada sekitar 40–80 update status.
- **Larangan:** Jangan meng-update canvas graph atau Vue reactivity state langsung di setiap event socket masuk.
- **Solusi Arsitektur:**
  1. **Event Buffer:** Kumpulkan event `heartbeat` dari Socket.io ke dalam in-memory buffer ringkas (ID & status baru).
  2. **Render Loop (`requestAnimationFrame`):** Update warna node di canvas maksimal 10 kali per detik (setiap 100ms) menggunakan buffer tersebut. Ini memastikan browser tetap 60 FPS tanpa CPU spike.

---

## 5. Anti-AI-Slop & Quality Enforcement

Untuk menjaga standar kode tetap rapi dan tidak merusak repo Uptime Kuma:

1. **Gunakan Ekosistem yang Ada:**
   - Vue 3 Composition/Options API sesuai konvensi file di `src/components/`.
   - FontAwesome 5 yang sudah terpasang di Kuma (`@fortawesome/vue-fontawesome`).
   - Jangan memasang icon library baru yang tidak perlu.
2. **Tanpa Emoji di UI:**
   - Dilarang memakai emoji (🔴, 🟢, ⚠️) sebagai pengganti icon status sistem. Gunakan SVG vector / FontAwesome.
3. **Aksesibilitas Kontras (WCAG AA):**
   - Teks pada background dark mode harus memiliki rasio kontras minimal 4.5:1.
   - Warna status merah/hijau harus selalu disertai teks atau icon pembantu untuk pengguna color-blind.
4. **Verifikasi Build:**
   - Setiap komponen baru harus lolos `npm run build` dan linter tanpa error.
