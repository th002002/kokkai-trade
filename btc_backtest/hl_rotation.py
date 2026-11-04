"""Hyperliquid の無期限先物で、銘柄間ローテーション（rotation.py と同じルール）を検証する。

注文コードはなく、APIキーも使わない（Hyperliquid の公開API /info のみ）。
上場廃止された銘柄も、取引所の一覧に残っている分は含める（生存バイアスを減らすため）。

使い方:
    python hl_rotation.py fetch           # 全銘柄の日足（と、取得を止めるまでの funding）
    python hl_rotation.py fetch-funding   # 実際に保有する期間の funding だけを取得（速い）
    python hl_rotation.py run             # → results/hl_rotation/
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import pandas as pd
import yaml

import rotation as R

BASE_DIR = Path(__file__).resolve().parent
START_MS = 1672531200000  # 2023-01-01
DAY_MS = 86_400_000


def load_cfg(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)["hl_rotation"]


def _info(ex, body, pause=0.5, retries=8):
    import ccxt

    for i in range(retries):
        try:
            res = ex.publicPostInfo(body)
            time.sleep(pause)  # レート制限を避ける
            return res
        except (ccxt.NetworkError, ccxt.RateLimitExceeded):
            time.sleep(min(60, 2 ** (i + 2)))
    raise RuntimeError("再試行の上限に達しました（取得済みの銘柄は保存済み。再実行で続きから）")


def fetch(cfg: dict) -> None:
    import ccxt

    ex = ccxt.hyperliquid({"requests_trust_env": True})  # 認証情報は渡さない
    ex.session.trust_env = True
    ddir = R.resolve(cfg["data_dir"])
    ddir.mkdir(parents=True, exist_ok=True)
    now = int(time.time() * 1000)
    universe = _info(ex, {"type": "meta"})["universe"]

    # 1) 全銘柄の日足（軽い）
    meta = []
    for k, u in enumerate(universe):
        coin = u["name"]
        safe = coin.replace("/", "_")
        c = _info(ex, {"type": "candleSnapshot", "req": {"coin": coin, "interval": "1d", "startTime": START_MS, "endTime": now}})
        d = pd.DataFrame([{"timestamp": int(x["t"]), "open": float(x["o"]), "high": float(x["h"]), "low": float(x["l"]),
                           "close": float(x["c"]), "volume": float(x["v"])} for x in c])
        liquid = False
        if len(d):
            d = d[d["timestamp"] + DAY_MS <= now]
            d.to_csv(ddir / f"{safe}.csv", index=False)
            med = (d["volume"] * d["close"]).rolling(30, min_periods=20).median()
            liquid = bool((med >= cfg["min_quote_volume"]).any()) or coin == cfg["base_symbol"]
        meta.append({"symbol": coin, "file": safe, "delisted": bool(u.get("isDelisted", False)), "days": len(d),
                     "ever_liquid": liquid})
        if (k + 1) % 25 == 0 or k + 1 == len(universe):
            print(f"  日足 {k + 1}/{len(universe)}", flush=True)
    meta = pd.DataFrame(meta)
    meta.to_csv(ddir / "_markets.csv", index=False)

    # 2) funding（重いので、一度でも出来高の条件を満たした＝保有されうる銘柄だけ）
    targets = meta[meta["ever_liquid"]]
    print(f"  funding を取得する銘柄: {len(targets)} / {len(meta)}", flush=True)
    for k, (_, r) in enumerate(targets.iterrows()):
        fpath = ddir / f"funding_{r['file']}.csv"
        old = pd.read_csv(fpath) if fpath.exists() else pd.DataFrame(columns=["timestamp", "funding_rate"])
        d = pd.read_csv(ddir / f"{r['file']}.csv")
        since = int(old["timestamp"].max()) + 1 if len(old) else int(d["timestamp"].min())
        rows = []
        while since < now - 3_600_000:
            f = _info(ex, {"type": "fundingHistory", "coin": r["symbol"], "startTime": since}, pause=2.5)
            if not f:
                break
            rows += [{"timestamp": int(x["time"]), "funding_rate": float(x["fundingRate"])} for x in f]
            last = int(f[-1]["time"])
            if last < since or len(f) < 500:
                break
            since = last + 1
            if len(rows) >= 5000:  # 途中保存
                old = pd.concat([old, pd.DataFrame(rows)], ignore_index=True).drop_duplicates("timestamp")
                old.to_csv(fpath, index=False)
                rows = []
        fd = pd.concat([old, pd.DataFrame(rows)], ignore_index=True)
        if len(fd):
            fd.drop_duplicates("timestamp").sort_values("timestamp").to_csv(fpath, index=False)
        print(f"  funding [{k + 1}/{len(targets)}] {r['symbol']:10s} {len(fd):6d}件", flush=True)


def fetch_funding_held(cfg: dict) -> None:
    """全銘柄の funding を取ると時間がかかるため、実際に保有した期間だけ取得する。

    銘柄の選び方は価格だけで決まり funding には左右されないので、funding なしで一度シミュレーションし、
    保有した銘柄・日付（全パラメータ候補 × 学習/検証/全期間）を集めて、その範囲の funding だけ取る。
    「全銘柄を均等に保有」は対象が多すぎるため含めない（その結果は funding 未計上の参考値になる）。
    """
    import ccxt
    import itertools

    ex = ccxt.hyperliquid({"requests_trust_env": True})  # 認証情報は渡さない
    ex.session.trust_env = True
    ddir = R.resolve(cfg["data_dir"])
    panel = load_panel(cfg)
    feat = R.features(panel, cfg)
    idx = panel["close"].index
    n = len(idx)
    first = int(panel["close"][cfg["base_symbol"]].rolling(cfg["market_filter_sma"]).mean().notna().to_numpy().argmax())
    k = first + int((n - first) * cfg["train_ratio"])
    keys = list(cfg["grid"])
    combos = [{**cfg["params"], **dict(zip(keys, v))} for v in itertools.product(*(cfg["grid"][x] for x in keys))]
    need: dict[str, set] = {}
    sels = [R.momentum_selector(panel, feat, cfg, p) for p in combos] + [R.btc_hold_selector(panel, feat, cfg, None)]
    for sel in sels:
        for a, b in ((first, k), (k, n), (first, n)):
            for s, days in R.simulate(panel, cfg, sel, a, b)["held_days"].items():
                need.setdefault(s, set()).update(days)
    meta = pd.read_csv(ddir / "_markets.csv").set_index("symbol")
    print(f"保有した銘柄: {len(need)}")
    for j, (coin, days) in enumerate(sorted(need.items())):
        fpath = ddir / f"funding_{meta.loc[coin, 'file']}.csv"
        old = pd.read_csv(fpath) if fpath.exists() else pd.DataFrame(columns=["timestamp", "funding_rate"])
        have = set(pd.to_datetime(old["timestamp"], unit="ms", utc=True).dt.floor("D")) if len(old) else set()
        missing = sorted(i for i in days if idx[i] not in have)
        # 連続した日をまとめて1つの範囲にする
        ranges, rows = [], []
        for i in missing:
            if ranges and i == ranges[-1][1] + 1:
                ranges[-1][1] = i
            else:
                ranges.append([i, i])
        for a, b in ranges:
            since = int(idx[a].timestamp() * 1000)
            until = int((idx[b] + pd.Timedelta(days=1)).timestamp() * 1000) - 1
            while since < until:
                f = _info(ex, {"type": "fundingHistory", "coin": coin, "startTime": since, "endTime": until}, pause=2.5)
                if not f:
                    break
                rows += [{"timestamp": int(x["time"]), "funding_rate": float(x["fundingRate"])} for x in f]
                last = int(f[-1]["time"])
                if last < since or len(f) < 500:
                    break
                since = last + 1
        if rows:
            fd = pd.concat([old, pd.DataFrame(rows)], ignore_index=True).drop_duplicates("timestamp").sort_values("timestamp")
            fd.to_csv(fpath, index=False)
        print(f"  [{j + 1}/{len(need)}] {coin:10s} 保有 {len(days):4d}日  取得した範囲 {len(ranges)}  追加 {len(rows)}件", flush=True)


def load_panel(cfg: dict) -> dict:
    ddir = R.resolve(cfg["data_dir"])
    if not (ddir / "_markets.csv").exists():
        sys.exit("データがありません。先に `python hl_rotation.py fetch` を実行してください。")
    meta = pd.read_csv(ddir / "_markets.csv")
    cols = {k: {} for k in ("open", "close", "volume", "funding")}
    for _, r in meta.iterrows():
        if r["symbol"] in cfg["exclude"] or r["days"] == 0 or not (ddir / f"{r['file']}.csv").exists():
            continue
        d = pd.read_csv(ddir / f"{r['file']}.csv")
        d.index = pd.to_datetime(d["timestamp"], unit="ms", utc=True).dt.floor("D")
        d = d[~d.index.duplicated()]
        traded = d.index[d["volume"] > 0]  # 上場廃止後に価格が止まった日は打ち切る
        if len(traded) == 0:
            continue
        d = d[(d.index >= traded[0]) & (d.index <= traded[-1])]
        for k in ("open", "close", "volume"):
            cols[k][r["symbol"]] = d[k]
        fp = ddir / f"funding_{r['file']}.csv"
        if fp.exists():
            f = pd.read_csv(fp)
            f.index = pd.to_datetime(f["timestamp"], unit="ms", utc=True).dt.floor("D")
            cols["funding"][r["symbol"]] = f.groupby(level=0)["funding_rate"].sum()
    panel = {k: pd.DataFrame(v).sort_index() for k, v in cols.items()}
    full = pd.date_range(panel["close"].index.min(), panel["close"].index.max(), freq="D", tz="UTC")
    panel = {k: v.reindex(full) for k, v in panel.items()}
    panel["funding"] = panel["funding"].reindex(columns=panel["close"].columns)
    return panel


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["fetch", "fetch-funding", "run"])
    ap.add_argument("--config", default=str(BASE_DIR / "config.yaml"))
    a = ap.parse_args()
    cfg = load_cfg(Path(a.config))
    if a.command == "fetch":
        fetch(cfg)
    elif a.command == "fetch-funding":
        fetch_funding_held(cfg)
    else:
        R.run(cfg, load_panel(cfg))


if __name__ == "__main__":
    main()
