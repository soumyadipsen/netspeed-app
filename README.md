# 📡 NetSpeed — Network Performance Tester

A deployable web app that tests **Download speed, Upload speed, Latency, Ping, Packet loss, and DNS resolution** — all from the browser.

Built with **Node.js + Express** (no Python, no heavy frameworks).

---

## ✨ Features

- **Latency** — measures round-trip time from the browser directly to Cloudflare (8 samples, trimmed average)
- **Download speed** — streams 10 MB + 25 MB from Cloudflare with live per-chunk Mbps updates
- **Upload speed** — POSTs 1 MB / 5 MB / 10 MB payloads to Cloudflare with real-time progress
- **Server-side TCP ping** — pings Google DNS, Cloudflare DNS, OpenDNS, and Google HTTPS (5 samples each, reports min/avg/max + packet loss %)
- **DNS resolution** — measures server-side lookup time for 5 major domains (3 samples each)
- **Live animated gauge** — shows real-time speed/latency as each phase runs
- **Color-coded results** — green / yellow / red thresholds for every metric

---

## 🚀 Deploy for Free

### Option 1 — Render (recommended)
1. Push this folder to a GitHub repo
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your repo — Render auto-detects `render.yaml`
4. Click **Deploy** → get a public URL like `https://netspeed-app.onrender.com`

### Option 2 — Railway
1. Push to GitHub
2. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub**
3. Select the repo → Railway reads `railway.toml` automatically
4. Done — public URL generated instantly

### Option 3 — Koyeb
1. Push to GitHub
2. Go to [koyeb.com](https://koyeb.com) → **Create App → GitHub**
3. Build: `npm install` | Start: `node index.js`

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
├── index.js          ← Express server + server-side test APIs
├── package.json
├── render.yaml       ← Render deployment config
├── railway.toml      ← Railway deployment config
└── public/
    ├── index.html    ← Frontend UI
    ├── style.css     ← Dark-theme styles
    └── app.js        ← All client-side test logic (latency, download, upload)
```

---

## 🔌 API Endpoints

> Download, upload, and latency are measured **client-side** by the browser — the server only handles ping and DNS (which require raw sockets / server-side DNS).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/ping` | GET | TCP ping to 4 targets — returns min/avg/max latency + packet loss % |
| `GET /api/dns` | GET | DNS resolution time for 5 domains (3 samples each, averaged) |
| `POST /api/upload` | POST | Receives raw bytes from the browser; used as a fallback upload target |
