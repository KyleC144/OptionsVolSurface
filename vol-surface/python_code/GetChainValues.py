import sys, json, math, datetime, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import options as opts
import yfinance as yf

def clean(val):
    if val is None: return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)): return None
    return val

def safe_float(val):
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except: return None

def row(r):
    return {k: clean(v) for k, v in r.items() if k in
        ["strike","bid","ask","lastPrice","impliedVolatility","volume","openInterest","inTheMoney"]}

def is_bad_quote(o):
    iv = safe_float(o.get("impliedVolatility"))
    # Only drop missing IV or extreme nonsense (>500%)
    if iv is None or iv <= 0 or iv > 5.0: return True
    # Need at least one valid price
    bid  = safe_float(o.get("bid"))
    ask  = safe_float(o.get("ask"))
    last = safe_float(o.get("lastPrice"))
    has_price = (bid and bid > 0) or (ask and ask > 0) or (last and last > 0)
    if not has_price: return True
    return False

def reject_outliers(options_list):
    # Very permissive — 3x IQR, only removes extreme spikes
    # Requires at least 8 points to bother filtering
    ivs = [safe_float(o.get("impliedVolatility")) for o in options_list]
    ivs_clean = sorted(v for v in ivs if v is not None)
    if len(ivs_clean) < 8: return options_list
    q1 = ivs_clean[len(ivs_clean) // 4]
    q3 = ivs_clean[(3 * len(ivs_clean)) // 4]
    iqr = q3 - q1
    lo, hi = q1 - 3.0 * iqr, q3 + 3.0 * iqr
    return [o for o, iv in zip(options_list, ivs) if iv is not None and lo <= iv <= hi]

def bs_call(S, K, T, r, sigma):
    from scipy.stats import norm
    d1 = (math.log(S/K) + (r + 0.5*sigma**2)*T) / (sigma*math.sqrt(T))
    d2 = d1 - sigma*math.sqrt(T)
    return S*norm.cdf(d1) - K*math.exp(-r*T)*norm.cdf(d2)

def bs_put(S, K, T, r, sigma):
    from scipy.stats import norm
    d1 = (math.log(S/K) + (r + 0.5*sigma**2)*T) / (sigma*math.sqrt(T))
    d2 = d1 - sigma*math.sqrt(T)
    return K*math.exp(-r*T)*norm.cdf(-d2) - S*norm.cdf(-d1)

def solve_iv(market_price, S, K, T, r, is_call):
    if T <= 0 or not market_price or market_price <= 0: return None
    intrinsic = max(0.0, (S-K) if not is_call else (K-S))
    if market_price <= intrinsic + 1e-5: return None
    fn = bs_call if is_call else bs_put
    lo, hi = 1e-5, 10.0
    for _ in range(120):
        mid = (lo + hi) / 2
        try: p = fn(S, K, T, r, mid)
        except: return None
        if abs(p - market_price) < 1e-6: return mid
        lo, hi = (mid, hi) if p < market_price else (lo, mid)
    iv = (lo + hi) / 2
    return iv if 0.001 < iv < 9.9 else None

def add_greeks(option, is_call, spot, T, r):
    bid    = safe_float(option.get("bid"))
    ask    = safe_float(option.get("ask"))
    strike = safe_float(option.get("strike"))
    iv_yh  = safe_float(option.get("impliedVolatility"))
    mid    = (bid + ask) / 2 if (bid and ask and bid > 0 and ask > 0) else None
    iv     = solve_iv(mid, spot, strike, T, r, is_call) if mid else iv_yh
    if iv: option["impliedVolatility"] = iv
    if not iv or iv <= 0 or not strike or strike <= 0 or T <= 0:
        option.update({"BSprice":None,"delta":None,"gamma":None,"vega":None,"theta":None})
        return
    try:
        bs = (opts.BlackScholesCall if is_call else opts.BlackScholesPut)(spot, iv, strike, T, r)
        option.update({"BSprice":safe_float(bs.price),"delta":safe_float(bs.delta),
                       "gamma":safe_float(bs.gamma),"vega":safe_float(bs.vega),"theta":safe_float(bs.theta)})
    except:
        option.update({"BSprice":None,"delta":None,"gamma":None,"vega":None,"theta":None})

def main():
    ticker = sys.argv[1] if len(sys.argv) > 1 else "SPY"
    r = 0.05
    t = yf.Ticker(ticker)
    spot  = t.fast_info["lastPrice"]
    dates = list(t.options)

    cutoff = str(datetime.date.today() + datetime.timedelta(days=int(100)))
    valid  = [d for d in dates if d <= cutoff]

    # Always keep the nearest 4 expirations (catches 0-3 DTE weeklies for SPY/QQQ)
    near = valid[:4]
    # Sample the rest evenly up to 12 more
    rest   = valid[4:]
    stride = max(1, len(rest) // 12)
    selected = near + rest[::stride]

    data = {}
    for date in selected:
        chain    = t.option_chain(date)
        calls_df = chain.calls[(chain.calls["strike"]/spot >= 1) & (chain.calls["strike"]/spot <= 1.15)]
        puts_df  = chain.puts[ (chain.puts["strike"] /spot >= 0.85) & (chain.puts["strike"] /spot <= 1)]
        calls = reject_outliers([o for o in [row(r_) for r_ in calls_df.to_dict("records")] if not is_bad_quote(o)])
        puts  = reject_outliers([o for o in [row(r_) for r_ in puts_df.to_dict("records")]  if not is_bad_quote(o)])
        data[date] = {"calls": calls, "puts": puts}
        print(f"{date}: {len(calls)} calls, {len(puts)} puts", file=sys.stderr)

    for date, chain in data.items():
        dt = datetime.datetime.fromisoformat(date) - datetime.datetime.now()
        T  = (dt.days + dt.seconds/(3600*24)) / 365.0
        if T <= 0: continue
        for call in chain["calls"]: add_greeks(call, True,  spot, T, r)
        for put  in chain["puts"]:  add_greeks(put,  False, spot, T, r)

    # Linear interpolation via scipy
    from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator
    import numpy as np

    all_pts = []
    for date, chain in data.items():
        dt  = datetime.datetime.fromisoformat(date) - datetime.datetime.now()
        dte = dt.days + dt.seconds / (3600 * 24)
        if dte < -1: continue
        for opt in chain["calls"] + chain["puts"]:
            iv     = safe_float(opt.get("impliedVolatility"))
            strike = safe_float(opt.get("strike"))
            if iv and strike:
                all_pts.append((strike / spot, dte, iv * 100))

    print(f"Total points for interpolation: {len(all_pts)}", file=sys.stderr)

    surface = None
    if len(all_pts) >= 4:
        pts  = np.array([(p[0], p[1]) for p in all_pts])
        vals = np.array([p[2]         for p in all_pts])

        linear  = LinearNDInterpolator(pts, vals)
        nearest = NearestNDInterpolator(pts, vals)

        k_grid = np.linspace(pts[:,0].min(), pts[:,0].max(), 50)
        t_grid = np.linspace(pts[:,1].min(), pts[:,1].max(), 50)
        KK, TT = np.meshgrid(k_grid, t_grid)
        flat   = np.column_stack([KK.ravel(), TT.ravel()])

        zz   = linear(flat)
        nans = np.isnan(zz)
        if nans.any():
            zz[nans] = nearest(flat[nans])
        ZZ = zz.reshape(50, 50)

        surface = {"x": k_grid.tolist(), "y": t_grid.tolist(), "z": ZZ.tolist()}

    print(json.dumps({"spot": spot, "data": data, "surface": surface}))

if __name__ == "__main__":
    main()