import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;
const isProd = process.env.NODE_ENV === "production";

// ─── Resolve venv python ──────────────────────────────────────────────────────
const VENV_PYTHON = path.join(__dirname, "venv", "bin", "python3");
const PYTHON = existsSync(VENV_PYTHON) ? VENV_PYTHON : "python3";
const FETCH_SCRIPT = path.join(__dirname, "python_code/GetChainValues.py");
console.log(`  Using Python: ${PYTHON}`);

// ─── Single API route — returns everything in one call ────────────────────────
// { spot: number, data: { [date]: { calls: Option[], puts: Option[] } } }
// Each Option has: strike, bid, ask, lastPrice, impliedVolatility,
//                  volume, openInterest, inTheMoney,
//                  BSprice, delta, gamma, vega, theta

const DEMO_MODE = process.env.DEMO === "true";
const DEMO_DIR  = path.join(__dirname, "demo-data");
if (DEMO_MODE) console.log("  ⚡  DEMO MODE — serving static fixture data");

app.get("/api/options/:ticker", async (req, res) => {
  const ticker = (req.params.ticker || "").toUpperCase().replace(/[^A-Z.^-]/g, "");
  if (!ticker) return res.status(400).json({ error: "Missing ticker" });

  // Demo mode: serve pre-saved fixture JSON
  const demoFile = path.join(DEMO_DIR, `${ticker}.json`);
  if (DEMO_MODE || req.query.demo === "true") {
    if (existsSync(demoFile)) {
      console.log(`[demo] serving ${ticker} from fixture`);
      const raw = await import("fs").then(fs => fs.promises.readFile(demoFile, "utf8"));
      return res.json(JSON.parse(raw));
    } else if (DEMO_MODE) {
      // In demo mode, fall back to SPY fixture if ticker not found
      const fallback = path.join(DEMO_DIR, "SPY.json");
      if (existsSync(fallback)) {
        console.log(`[demo] ${ticker} not found, serving SPY fixture`);
        const raw = await import("fs").then(fs => fs.promises.readFile(fallback, "utf8"));
        return res.json(JSON.parse(raw));
      }
      return res.status(404).json({ error: `No demo data for ${ticker}. Run: npm run capture` });
    }
  }

  console.log(`[options] Fetching ${ticker}...`);
  try {
    const { stdout, stderr } = await execFileAsync(
      PYTHON,
      [FETCH_SCRIPT, ticker],
      { maxBuffer: 50 * 1024 * 1024 }
    );
    if (stderr) console.warn(`[options] stderr:`, stderr.slice(0, 200));
    const result = JSON.parse(stdout);
    const dateCount = Object.keys(result.data).length;
    const optCount  = Object.values(result.data).reduce(
      (n, d) => n + d.calls.length + d.puts.length, 0
    );
    console.log(`[options] ${ticker} → $${result.spot} · ${dateCount} dates · ${optCount} options`);
    res.json(result);
  } catch (e) {
    console.error(`[options] ${ticker} error:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Serve built frontend in production ───────────────────────────────────────
if (isProd) {
  const distPath = path.join(__dirname, "dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) =>
    res.sendFile(path.join(distPath, "index.html"))
  );
}

app.listen(PORT, () =>
  console.log(`  ✓  API server running at http://localhost:${PORT}\n`)
);