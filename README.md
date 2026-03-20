# 📡 NetSpeed — Network Performance Tester

A deployable web app that tests **Download speed, Upload speed, Ping latency, Packet loss and DNS resolution** — all from the browser.

Built with **Node.js + Express** (no Python, no heavy frameworks).

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
npm start
# Open http://localhost:3000
```

---

## 📁 Project Structure

```
netspeed-app/
├── index.js          ← Express server + all test APIs
├── package.json
├── render.yaml       ← Render deployment config
├── railway.toml      ← Railway deployment config
└── public/
    ├── index.html    ← Frontend UI
    ├── style.css     ← Dark-theme styles
    └── app.js        ← Frontend logic
```

---

## 🔌 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/ping` | TCP ping to 4 targets (latency + packet loss) |
| `GET /api/dns` | DNS resolution time for 5 domains |
| `GET /api/download` | Download speed via Cloudflare (10 MB + 25 MB) |
| `GET /api/upload` | Upload speed via Cloudflare (1/5/10 MB) |
