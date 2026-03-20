/**
 * Network Performance Tester — Firebase Cloud Function
 * Handles all /api/* routes; static files are served by Firebase Hosting.
 *
 * NOTE: Outbound TCP connections require the Blaze (pay-as-you-go) plan.
 *       The /api/ping and /api/dns endpoints make external network requests.
 */

const functions = require("firebase-functions");
const express   = require("express");
const cors      = require("cors");
const dns       = require("dns").promises;
const { performance } = require("perf_hooks");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// ── helpers ──────────────────────────────────────────────────────────────────

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

// ── API: Ping ─────────────────────────────────────────────────────────────────

app.get("/api/ping", async (req, res) => {
  const targets = [
    { name: "Google DNS",     host: "8.8.8.8",        port: 53  },
    { name: "Cloudflare DNS", host: "1.1.1.1",        port: 53  },
    { name: "OpenDNS",        host: "208.67.222.222", port: 53  },
    { name: "Google HTTPS",   host: "google.com",     port: 443 },
  ];

  const results = await Promise.all(
    targets.map(async (t) => {
      const samples = [];
      for (let i = 0; i < 5; i++) {
        const ms = await tcpPing(t.host, t.port);
        if (ms !== null) samples.push(ms);
      }
      const avg  = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : null;
      const min  = samples.length ? Math.min(...samples) : null;
      const max  = samples.length ? Math.max(...samples) : null;
      const loss = ((5 - samples.length) / 5) * 100;
      return { name: t.name, host: t.host, min_ms: min, avg_ms: avg, max_ms: max, loss_pct: loss };
    })
  );
  res.json({ ok: true, results });
});

// ── API: DNS ──────────────────────────────────────────────────────────────────

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

// ── API: Upload ───────────────────────────────────────────────────────────────

app.post("/api/upload",
  express.raw({ type: "application/octet-stream", limit: "15mb" }),
  (req, res) => {
    const bytes = req.body ? req.body.length : 0;
    res.json({ ok: true, bytes });
  }
);

// ── Export ────────────────────────────────────────────────────────────────────
exports.api = functions.https.onRequest(app);
