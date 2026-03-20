# 📡 NetSpeed — Network Performance Tester

A deployable web app that tests **Download speed, Upload speed, Latency, Ping, Packet loss, and DNS resolution** — all from the browser.

Built with **Node.js + Express** (no Python, no heavy frameworks).

---

## ✨ Features

- **Latency** — measures round-trip time from the browser directly to Cloudflare (8 samples, trimmed average)
- **Download speed** — streams 10 MB + 25 MB from Cloudflare with live per-chunk Mbps updates
- **Upload speed** — POSTs 1 MB / 5 MB / 10 MB payloads to Cloudflare with real-time progress
- **Ping** — measures HTTP round-trip latency to 4 public endpoints (5 samples each, reports min/avg/max + packet loss %)
- **DNS resolution** — times DNS-over-HTTPS lookups for 5 major domains via Cloudflare (3 samples each)
- **Live animated gauge** — shows real-time speed/latency as each phase runs
- **Color-coded results** — green / yellow / red thresholds for every metric

---

## 🚀 Deploy on Render

1. Push this folder to a GitHub repo
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your repo — Render auto-detects `render.yaml`
4. Click **Deploy** → get a public URL like `https://netspeed-app.onrender.com`

---

## 🖥️ Run Locally

```bash
cd netspeed-app
npm install
npm start          # production
npm run dev        # watch mode (nodemon)
# Open http://localhost:3000
```

---

## 📁 Project Structure

```
netspeed-app/
├── index.js          ← Express server
├── package.json
├── render.yaml       ← Render deployment config
└── public/
    ├── index.html    ← Frontend UI
    ├── style.css     ← Dark-theme styles
    └── app.js        ← All client-side test logic (latency, download, upload, ping, DNS)
```

---

## 🔌 API Endpoints

> All speed tests (latency, download, upload, ping, DNS) run **client-side** in the browser. The server only provides a fallback upload endpoint.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/upload` | POST | Fallback upload target — receives raw bytes and returns the byte count |
