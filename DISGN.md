# UPTIME KUMA ATM NOC & REALTIME GRAPH DESIGN SYSTEM

Dokumen desain lengkap dapat dilihat di [DESIGN.md](./DESIGN.md).

Ringkasan:
- **Style:** 100% Native Uptime Kuma tokens (`$primary: #5cdd8b`, `$danger: #dc3545`, `$dark-bg: #0d1117`).
- **NOC Card:** Dense mode, virtual scrolling untuk 400+ kartu ATM, mini heartbeat.
- **Graph View:** Canvas-based Force Graph (Obsidian style) dengan hierarki Core -> Branch -> ATM.
- **Realtime:** Event buffer & RAF throttling (maksimal 10 FPS update render) untuk menjaga fluiditas browser.
- **Anti-AI-Slop:** Tidak menggunakan emoji, memanfaatkan FontAwesome & bootstrap bawaan Kuma, lolos lint & build.
