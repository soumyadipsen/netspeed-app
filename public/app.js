/* ── Global state ────────────────────────────────────────────────────────── */
let lastResult = null;
const GAUGE_ARC = 314; // π * radius(100)

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtMs   = (v) => v != null ? `${v.toFixed(1)} ms`   : "N/A";
const fmtMbps = (v) => v != null ? `${v.toFixed(2)} Mbps` : "N/A";

function colorClass(value, warn, bad, higherIsBetter = true) {
  if (value == null) return "na";
  if (higherIsBetter) return value >= warn ? "good" : value >= bad ? "warn" : "bad";
  else                return value <= warn ? "good" : value <= bad ? "warn" : "bad";
}

function show(id)  { const e = document.getElementById(id); if (e) e.style.display = ""; }
function hide(id)  { const e = document.getElementById(id); if (e) e.style.display = "none"; }
function setStep(id, state) {
  const el = document.getElementById(id);
  if (el) el.className = "step " + state;
}

// ── Gauge ─────────────────────────────────────────────────────────────────────

function updateGauge(value, maxValue, unit = "Mbps", higherIsBetter = true) {
  const pct    = Math.min(1, Math.max(0, higherIsBetter ? value / maxValue : 1 - value / maxValue));
  const filled = pct * GAUGE_ARC;
  const color  = pct > 0.65 ? "#38d9a9" : pct > 0.35 ? "#f7c948" : "#f45e6a";

  const fill = document.getElementById("gaugeFill");
  fill.setAttribute("stroke-dasharray", `${filled} ${GAUGE_ARC}`);
  fill.setAttribute("stroke", color);
  document.getElementById("gaugeValue").textContent = value.toFixed(unit === "ms" ? 0 : 1);
  document.getElementById("gaugeUnit").textContent  = unit;
}

function resetGauge(phaseName) {
  document.getElementById("gaugePhase").textContent = phaseName;
  document.getElementById("gaugeValue").textContent = "–";
  document.getElementById("gaugeUnit").textContent  = "Mbps";
  document.getElementById("gaugeFill").setAttribute("stroke-dasharray", `0 ${GAUGE_ARC}`);
}

// ── CLIENT-SIDE: Latency ──────────────────────────────────────────────────────
// Measures round-trip time from the browser directly to Cloudflare

async function measureLatency(onSample) {
  const url = `https://speed.cloudflare.com/__down?bytes=0`;
  const times = [];
  for (let i = 0; i < 8; i++) {
    try {
      const t0 = performance.now();
      await fetch(`${url}&_=${Date.now()}`, { cache: "no-store" });
      const ms = performance.now() - t0;
      times.push(ms);
      if (onSample) onSample(ms);
    } catch (_) {}
    await sleep(150);
  }
  if (!times.length) return null;
  times.sort((a, b) => a - b);
  const trimmed = times.length > 4 ? times.slice(1, -1) : times;
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

// ── CLIENT-SIDE: Download ─────────────────────────────────────────────────────
// Uses ReadableStream so we get per-chunk progress → live Mbps updates

async function downloadOne(bytes, onProgress) {
  const url = `https://speed.cloudflare.com/__down?bytes=${bytes}&_=${Date.now()}`;
  try {
    const res    = await fetch(url, { cache: "no-store" });
    const reader = res.body.getReader();
    const start  = performance.now();
    let total    = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed > 0.2 && onProgress) onProgress((total * 8) / elapsed / 1_000_000);
    }

    const elapsed = (performance.now() - start) / 1000;
    return elapsed > 0 ? (total * 8) / elapsed / 1_000_000 : null;
  } catch (_) {
    return null;
  }
}

async function measureDownload(onProgress) {
  const tests = [
    { name: "10 MB", bytes: 10_000_000 },
    { name: "25 MB", bytes: 25_000_000 },
  ];
  const results = [];
  for (const t of tests) {
    const speed = await downloadOne(t.bytes, onProgress);
    results.push({ name: t.name, speed_mbps: speed ? +speed.toFixed(2) : null });
  }
  const valid = results.map((r) => r.speed_mbps).filter(Boolean);
  results.push({ name: "AVERAGE", speed_mbps: valid.length ? +(valid.reduce((a, b) => a + b) / valid.length).toFixed(2) : null });
  return results;
}

// ── CLIENT-SIDE: Upload ───────────────────────────────────────────────────────
// Sends data to Cloudflare __up (external, real network) for accurate speed.
// Falls back to /api/upload (works on remote deployments, not localhost).

function uploadOne(sizeBytes, onProgress) {
  return new Promise((resolve) => {
    const data  = new Uint8Array(sizeBytes).fill(65);
    const xhr   = new XMLHttpRequest();
    let   start;

    xhr.upload.onprogress = (e) => {
      if (!start) return;
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed > 0.2 && e.loaded > 0 && onProgress)
        onProgress((e.loaded * 8) / elapsed / 1_000_000);
    };
    xhr.upload.onloadstart = () => { start = performance.now(); };
    xhr.onload    = () => {
      const elapsed = start ? (performance.now() - start) / 1000 : 0;
      resolve(elapsed > 0 ? (sizeBytes * 8) / elapsed / 1_000_000 : null);
    };
    xhr.onerror   = () => resolve(null);
    xhr.ontimeout = () => resolve(null);
    xhr.timeout   = 60_000;
    // POST to the app's own server — same origin, no CORS restrictions
    xhr.open("POST", "/api/upload");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.send(data.buffer);
  });
}

async function measureUpload(onProgress) {
  const tests = [
    { name: "1 MB",  size: 1_000_000  },
    { name: "5 MB",  size: 5_000_000  },
    { name: "10 MB", size: 10_000_000 },
  ];
  const results = [];
  for (const t of tests) {
    const speed = await uploadOne(t.size, onProgress);
    results.push({ name: t.name, speed_mbps: speed ? +speed.toFixed(2) : null });
  }
  const valid = results.map((r) => r.speed_mbps).filter(Boolean);
  results.push({ name: "AVERAGE", speed_mbps: valid.length ? +(valid.reduce((a, b) => a + b) / valid.length).toFixed(2) : null });
  return results;
}

// ── CLIENT-SIDE: Ping (HTTP fetch latency to CORS-enabled public endpoints) ──

async function measurePing(onSample) {
  const targets = [
    { name: "Cloudflare DNS",  host: "1.1.1.1",        url: "https://1.1.1.1/cdn-cgi/trace" },
    { name: "Google DNS",      host: "8.8.8.8",        url: "https://dns.google/resolve?name=google.com&type=A" },
    { name: "Cloudflare CDN",  host: "cloudflare.com", url: "https://speed.cloudflare.com/__down?bytes=0" },
    { name: "Google HTTPS",    host: "google.com",     url: "https://www.google.com/generate_204" },
  ];

  return Promise.all(targets.map(async (t) => {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      try {
        const t0 = performance.now();
        await fetch(t.url + (t.url.includes("?") ? "&" : "?") + "_=" + Date.now(), { cache: "no-store", mode: "no-cors" });
        samples.push(performance.now() - t0);
        if (onSample) onSample(samples[samples.length - 1]);
      } catch (_) {}
      await sleep(100);
    }
    const min  = samples.length ? Math.min(...samples) : null;
    const max  = samples.length ? Math.max(...samples) : null;
    const avg  = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : null;
    const loss = ((5 - samples.length) / 5) * 100;
    return { name: t.name, host: t.host, min_ms: min, avg_ms: avg, max_ms: max, loss_pct: loss };
  }));
}

// ── CLIENT-SIDE: DNS (Cloudflare DNS-over-HTTPS, CORS-enabled) ───────────────

async function measureDNS() {
  const domains = ["google.com", "cloudflare.com", "github.com", "amazon.com", "microsoft.com"];

  return Promise.all(domains.map(async (domain) => {
    const times = [];
    for (let i = 0; i < 3; i++) {
      try {
        const t0 = performance.now();
        await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=A`, {
          headers: { Accept: "application/dns-json" },
          cache: "no-store",
        });
        times.push(performance.now() - t0);
      } catch (_) {}
      await sleep(50);
    }
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
    return { domain, avg_ms: avg };
  }));
}

// ── Utility ───────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Main runner ───────────────────────────────────────────────────────────────

async function runAll() {
  const btn = document.getElementById("btnStart");
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon spinning">⏳</span> Running…';

  hide("summary"); hide("cards"); hide("rerun"); hide("serverBar");
  show("gaugeSection"); show("progressSection");
  ["step-latency","step-dl","step-ul","step-ping","step-dns"].forEach((s) => setStep(s, ""));

  const result = { generated: new Date().toISOString() };

  try {
    // ── Phase 1: Latency (browser → Cloudflare)
    setStep("step-latency", "active");
    resetGauge("⚡ Measuring latency to Cloudflare…");
    result.latency_ms = await measureLatency((ms) => updateGauge(ms, 200, "ms", false));
    setStep("step-latency", "done");

    // ── Phase 2: Download (browser streams from Cloudflare)
    setStep("step-dl", "active");
    resetGauge("⬇ Testing download speed…");
    result.download = await measureDownload((mbps) => updateGauge(mbps, 100, "Mbps", true));
    setStep("step-dl", "done");

    // ── Phase 3: Upload (browser POSTs to Cloudflare)
    setStep("step-ul", "active");
    resetGauge("⬆ Testing upload speed…");
    result.upload = await measureUpload((mbps) => updateGauge(mbps, 50, "Mbps", true));
    setStep("step-ul", "done");

    // ── Phase 4: Client-side HTTP ping
    setStep("step-ping", "active");
    resetGauge("🏓 Running ping tests…");
    result.ping = await measurePing((ms) => updateGauge(ms, 200, "ms", false));
    setStep("step-ping", "done");

    // ── Phase 5: DNS-over-HTTPS resolution timing
    setStep("step-dns", "active");
    resetGauge("🔍 Testing DNS resolution…");
    result.dns = await measureDNS();
    setStep("step-dns", "done");

    lastResult = result;
    renderResults(result);

  } catch (err) {
    document.getElementById("gaugePhase").textContent = "❌ Error: " + err.message;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">▶</span> Start Test';
  }
}

// ── Render results ────────────────────────────────────────────────────────────

function renderResults({ download, upload, latency_ms, ping, dns, generated }) {
  const dlAvg  = download?.find((r) => r.name === "AVERAGE")?.speed_mbps ?? null;
  const ulAvg  = upload?.find((r)   => r.name === "AVERAGE")?.speed_mbps ?? null;
  const pingAvg = ping?.length
    ? ping.filter((r) => r.avg_ms != null).reduce((s, r) => s + r.avg_ms, 0) / ping.filter((r) => r.avg_ms != null).length
    : null;
  const dnsAvg = dns?.length
    ? dns.filter((r) => r.avg_ms != null).reduce((s, r) => s + r.avg_ms, 0) / dns.filter((r) => r.avg_ms != null).length
    : null;

  setStatBox("val-dl",      fmtMbps(dlAvg),     colorClass(dlAvg,     25, 10,  true));
  setStatBox("val-ul",      fmtMbps(ulAvg),     colorClass(ulAvg,     25, 10,  true));
  setStatBox("val-latency", fmtMs(latency_ms),  colorClass(latency_ms, 50, 100, false));
  setStatBox("val-ping",    fmtMs(pingAvg),     colorClass(pingAvg,   50, 100, false));
  setStatBox("val-dns",     fmtMs(dnsAvg),      colorClass(dnsAvg,    50, 150, false));

  // Update gauge to show final download speed
  if (dlAvg != null) {
    updateGauge(dlAvg, 100, "Mbps", true);
    document.getElementById("gaugePhase").textContent = "✅ Test complete — download speed";
  }

  // Info bar
  document.getElementById("serverTime").textContent = new Date(generated).toLocaleString();

  // Download table
  const maxDl = Math.max(...(download ?? []).filter((r) => r.speed_mbps && r.name !== "AVERAGE").map((r) => r.speed_mbps), 1);
  fillTable("dlTable", download ?? [], (r) => {
    const cls = r.name !== "AVERAGE" ? colorClass(r.speed_mbps, 25, 10, true) : "";
    const bar = r.name !== "AVERAGE" ? speedBar(r.speed_mbps, maxDl) : "";
    const fw  = r.name === "AVERAGE" ? " style='font-weight:800'" : "";
    return `<td${fw}>${r.name}</td><td class="${cls}"${fw}>${fmtMbps(r.speed_mbps)}</td><td>${bar}</td>`;
  });

  // Upload table
  const maxUl = Math.max(...(upload ?? []).filter((r) => r.speed_mbps && r.name !== "AVERAGE").map((r) => r.speed_mbps), 1);
  fillTable("ulTable", upload ?? [], (r) => {
    const cls = r.name !== "AVERAGE" ? colorClass(r.speed_mbps, 25, 10, true) : "";
    const bar = r.name !== "AVERAGE" ? speedBar(r.speed_mbps, maxUl) : "";
    const fw  = r.name === "AVERAGE" ? " style='font-weight:800'" : "";
    return `<td${fw}>${r.name}</td><td class="${cls}"${fw}>${fmtMbps(r.speed_mbps)}</td><td>${bar}</td>`;
  });

  // Ping table
  fillTable("pingTable", ping ?? [], (r) => {
    const cls = colorClass(r.avg_ms,    50, 100, false);
    const lc  = colorClass(r.loss_pct,   1,   5, false);
    return `<td>${r.name}</td>
            <td>${fmtMs(r.min_ms)}</td>
            <td class="${cls}">${fmtMs(r.avg_ms)}</td>
            <td>${fmtMs(r.max_ms)}</td>
            <td class="${lc}">${r.loss_pct != null ? r.loss_pct.toFixed(1) + "%" : "N/A"}</td>`;
  });

  // DNS table
  fillTable("dnsTable", dns ?? [], (r) => {
    const cls = colorClass(r.avg_ms, 50, 150, false);
    return `<td>${r.domain}</td><td class="${cls}">${fmtMs(r.avg_ms)}</td>`;
  });

  show("summary"); show("serverBar"); show("cards"); show("rerun");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setStatBox(id, text, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className   = "stat-val " + cls;
}

function fillTable(tableId, rows, renderRow) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (tbody) tbody.innerHTML = rows.map((r) => `<tr>${renderRow(r)}</tr>`).join("");
}

function speedBar(value, max) {
  if (value == null || max === 0) return "";
  const pct = Math.min(100, (value / max) * 100).toFixed(1);
  return `<div class="speed-bar-wrap"><div class="speed-bar" style="width:${pct}%"></div></div>`;
}

// ── Cloudflare PoP → City lookup ────────────────────────────────────────────
const CF_POPS = {
  ARN:"Stockholm",   AMS:"Amsterdam",     ATH:"Athens",         ATL:"Atlanta",
  BCN:"Barcelona",   BEG:"Belgrade",      BLL:"Billund",        BOM:"Mumbai",
  BLR:"Bengaluru",   BRU:"Brussels",      BUD:"Budapest",       CAI:"Cairo",
  CCU:"Kolkata",     CDG:"Paris",         CEB:"Cebu",           CGK:"Jakarta",
  CMB:"Colombo",     CPH:"Copenhagen",    CPT:"Cape Town",      DAC:"Dhaka",
  DEL:"Delhi",       DEN:"Denver",        DFW:"Dallas",         DOH:"Doha",
  DUB:"Dublin",      DUS:"Düsseldorf",    EWR:"Newark",         EZE:"Buenos Aires",
  FCO:"Rome",        FRA:"Frankfurt",     GIG:"Rio de Janeiro", GRU:"São Paulo",
  HAM:"Hamburg",     HEL:"Helsinki",      HKG:"Hong Kong",      HND:"Tokyo",
  HYD:"Hyderabad",   IAD:"Washington DC", IAH:"Houston",        IKA:"Tehran",
  IST:"Istanbul",    JFK:"New York",      JNB:"Johannesburg",   KBP:"Kyiv",
  KHI:"Karachi",     KIX:"Osaka",         KUL:"Kuala Lumpur",   LAX:"Los Angeles",
  LHR:"London",      LIM:"Lima",          LIS:"Lisbon",         LOS:"Lagos",
  MAA:"Chennai",     MAD:"Madrid",        MAN:"Manchester",     MCI:"Kansas City",
  MEL:"Melbourne",   MIA:"Miami",         MNL:"Manila",         MRS:"Marseille",
  MSP:"Minneapolis", MUC:"Munich",        NBO:"Nairobi",        NRT:"Tokyo",
  OPO:"Porto",       ORD:"Chicago",       OSL:"Oslo",           OTP:"Bucharest",
  PHX:"Phoenix",     PRG:"Prague",        PVG:"Shanghai",       RIX:"Riga",
  SCL:"Santiago",    SEA:"Seattle",       SFO:"San Francisco",  SGN:"Ho Chi Minh City",
  SIN:"Singapore",   SOF:"Sofia",         STR:"Stuttgart",      SVO:"Moscow",
  SYD:"Sydney",      TLL:"Tallinn",       TLV:"Tel Aviv",       TUN:"Tunis",
  VIE:"Vienna",      VNO:"Vilnius",       WAW:"Warsaw",         YVR:"Vancouver",
  YYZ:"Toronto",     ZAG:"Zagreb",        ZRH:"Zurich",
};

// ── ISP / IP / Nearest-PoP Detection ────────────────────────────────────────
// All fetches run in the user's browser → reflects their actual connection.

async function detectNetworkInfo() {
  let ip = null, org = null, city = null, country = null, colo = null;

  // 1. Cloudflare CDN trace → real user IP + nearest Cloudflare PoP
  //    No API key needed. Returns plain-text key=value pairs.
  try {
    const text  = await fetch("https://cloudflare.com/cdn-cgi/trace", { cache: "no-store" }).then((r) => r.text());
    const lines = Object.fromEntries(text.trim().split("\n").map((l) => l.split("=")));
    ip   = lines.ip;
    colo = lines.colo?.toUpperCase();
  } catch (_) {}

  // 2. ipapi.co → ISP / org name, city, country  (free: 30k req/month, no key)
  try {
    const geo = await fetch(`https://ipapi.co/${ip || ""}/json/`, { cache: "no-store" }).then((r) => r.json());
    if (!geo.error) {
      org     = geo.org;          // e.g. "AS9829 BSNL-NIB"
      city    = geo.city;
      country = geo.country_name;
      if (!ip) ip = geo.ip;
    }
  } catch (_) {}

  // Strip leading "ASxxxxx " from org string for cleaner display
  const isp = org ? org.replace(/^AS\d+\s+/i, "") : null;
  const popCity = colo ? (CF_POPS[colo] || colo) : null;

  _setInfo("info-ip",     ip      || "Unavailable");
  _setInfo("info-isp",    isp     || "Unknown");
  _setInfo("info-loc",    [city, country].filter(Boolean).join(", ") || "Unknown");
  _setInfo("info-server", popCity ? `${popCity} (${colo})` : "Cloudflare");

  document.getElementById("infoPanel")?.removeAttribute("data-loading");
}

function _setInfo(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// Auto-run on page load
document.addEventListener("DOMContentLoaded", detectNetworkInfo);

// ── Export JSON ───────────────────────────────────────────────────────────────

function downloadJSON() {
  if (!lastResult) return;
  const blob = new Blob([JSON.stringify(lastResult, null, 2)], { type: "application/json" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = `netspeed-${Date.now()}.json`;
  a.click();
}


