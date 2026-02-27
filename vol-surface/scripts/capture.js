/**
 * capture.js — saves live options data as demo fixtures
 * Usage: npm run capture [-- TICKER1 TICKER2 ...]
 * Requires: server.js running on port 3000 (node server.js)
 */

import { execFile }    from "child_process";
import { promisify }   from "util";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync }  from "fs";

const execFileAsync = promisify(execFile);
const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR      = path.join(__dirname, "..", "demo-data");
const FETCH_SCRIPT  = path.join(__dirname, "..", "python_code/GetChainValues.py");

const VENV_PYTHON   = path.join(__dirname, "..", "venv", "bin", "python3");
const PYTHON        = existsSync(VENV_PYTHON) ? VENV_PYTHON : "python3";

const tickers = process.argv.slice(2).length > 0
  ? process.argv.slice(2).map(t => t.toUpperCase())
  : ["SPY", "QQQ", "AAPL", "TSLA", "NVDA"];

async function capture(ticker) {
  console.log(`  Capturing ${ticker}...`);
  try {
    const { stdout } = await execFileAsync(PYTHON, [FETCH_SCRIPT, ticker], {
      maxBuffer: 50 * 1024 * 1024,
    });
    const data   = JSON.parse(stdout);
    const outPath = path.join(DEMO_DIR, `${ticker}.json`);
    await writeFile(outPath, JSON.stringify(data, null, 2));
    const dates   = Object.keys(data.data).length;
    const options = Object.values(data.data).reduce((n, d) => n + d.calls.length + d.puts.length, 0);
    console.log(`  ✓ ${ticker} → $${data.spot} · ${dates} dates · ${options} options → ${outPath}`);
  } catch (e) {
    console.error(`  ✗ ${ticker} failed:`, e.message);
  }
}

await mkdir(DEMO_DIR, { recursive: true });
console.log(`\n  Capturing demo fixtures for: ${tickers.join(", ")}\n`);
for (const ticker of tickers) {
  await capture(ticker);
}
console.log(`\n  Done. Commit the demo-data/ folder to git.\n`);