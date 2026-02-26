#!/bin/bash
set -e

echo ""
echo "  Setting up vol-surface..."
echo ""

# ─── Python venv ──────────────────────────────────────────────────────────────
echo "  [1/3] Creating Python venv..."
python3 -m venv venv

echo "  [2/3] Installing Python dependencies..."
venv/bin/pip install --quiet --upgrade pip
venv/bin/pip install --quiet yfinance

# ─── Node deps ────────────────────────────────────────────────────────────────
echo "  [3/3] Installing Node dependencies..."
npm install

echo ""
echo "  ✓  Setup complete!"
echo ""
echo "  To start:"
echo "    npm run dev    → development (http://localhost:5173)"
echo "    npm start      → production  (http://localhost:3000)"
echo ""