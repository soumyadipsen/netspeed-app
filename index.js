/**
 * Network Performance Tester — Express Backend
 * Free-hostable on Render / Railway / Fly.io / Koyeb
 */

const express = require("express");
const cors    = require("cors");
const dns     = require("dns").promises;
const { performance } = require("perf_hooks");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── helpers ─────────────────────────────────────────────────────────────────

// TCP ping helper (ms)
function tcpPing(host, port = 80, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const net   = require("net");
    const start = performance.now();
    const sock  = new net.Socket();
    sock.setTimeout(timeoutMs);
    sock.connect(port, host, () => {
      resolve(performance.now() - start);
      sock.destroy();
    });
    sock.on("error",   () => resolve(null));
    sock.on("timeout", () => { sock.destroy(); resolve(null); });
  });
}

// ── API: Ping ────────────────────────────────────────────────────────────────

app.get("/api/ping", async (req, res) => {
  const targets = [
    { name: "Google DNS",     host: "8.8.8.8",         port: 53  },
    { name: "Cloudflare DNS", host: "1.1.1.1",         port: 53  },
    { name: "OpenDNS",        host: "208.67.222.222",  port: 53  },
    { name: "Google HTTPS",   host: "google.com",      port: 443 },
  ];

  const results = await Promise.all(
    targets.map(async (t) => {
      const samples = [];
      for (let i = 0; i < 5; i++) {
        const ms = await tcpPing(t.host, t.port);
        if (ms !== null) samples.push(ms);
      }
      const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : null;
      const min = samples.length ? Math.min(...samples) : null;
      const max = samples.length ? Math.max(...samples) : null;
      const loss = ((5 - samples.length) / 5) * 100;
      return { name: t.name, host: t.host, min_ms: min, avg_ms: avg, max_ms: max, loss_pct: loss };
    })
  );
  res.json({ ok: true, results });
});

// ── API: DNS ─────────────────────────────────────────────────────────────────

app.get("/api/dns", async (req, res) => {
  const domains = ["google.com", "cloudflare.com", "github.com", "amazon.com", "microsoft.com"];
  const results = await Promise.all(
    domains.map(async (domain) => {
      const times = [];
      for (let i = 0; i < 3; i++) {
        try {
          const t0 = performance.now();
          await dns.lookup(domain);
          times.push(performance.now() - t0);
        } catch (_) {}
      }
      const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
      return { domain, avg_ms: avg };
    })
  );
  res.json({ ok: true, results });
});

// ── API: Upload ─────────────────────────────────────────────────────────────
// Receives raw bytes from the browser so we can measure true upload speed
// without hitting cross-origin restrictions on speed.cloudflare.com/__up

app.post("/api/upload",
  express.raw({ type: "application/octet-stream", limit: "15mb" }),
  (req, res) => {
    const bytes = req.body ? req.body.length : 0;
    res.json({ ok: true, bytes });
  }
);

// ── catch-all → SPA ─────────────────────────────────────────────────────────

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅  NetSpeed running → http://localhost:${PORT}`);
});
