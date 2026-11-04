"""Hyperliquid の無期限先物で、銘柄間ローテーション（rotation.py と同じルール）を検証する。

注文コードはなく、APIキーも使わない（Hyperliquid の公開API /info のみ）。
上場廃止された銘柄も、取引所の一覧に残っている分は含める（生存バイアスを減らすため）。

使い方:
    python hl_rotation.py fetch   # 全銘柄の日足と funding 履歴（1時間ごと）を取得/差分更新（初回は時間がかかる）
    python hl_rotation.py run     # → results/hl_rotation/
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


def _info(ex, body, retries=6):
    import ccxt

    for i in range(retries):
        try:
            res = ex.publicPostInfo(body)
            time.sleep(0.4)  # レート制限を避ける
            return res
        except (ccxt.NetworkError, ccxt.RateLimitExceeded):
            time.sleep(2 ** (i + 1))
    raise RuntimeError("再試行の上限に達しました（取得済みの銘柄は保存済み。再実行で続きから）")


def fetch(cfg: dict) -> None:
    import ccxt

    ex = ccxt.hyperliquid({"requests_trust_env": True})  # 認証情報は渡さない
    ex.session.trust_env = True
    ddir = R.resolve(cfg["data_dir"])
    ddir.mkdir(parents=True, exist_ok=True)
    now = int(time.time() * 1000)
    universe = _info(ex, {"type": "meta"})["universe"]
    meta = []
    for k, u in enumerate(universe):
        coin = u["name"]
        safe = coin.replace("/", "_")
        # 日足（1回で最大5000本）
        c = _info(ex, {"type": "candleSnapshot", "req": {"coin": coin, "interval": "1d", "startTime": START_MS, "endTime": now}})
        d = pd.DataFrame([{"timestamp": int(x["t"]), "open": float(x["o"]), "high": float(x["h"]), "low": float(x["l"]),
                           "close": float(x["c"]), "volume": float(x["v"])} for x in c])
        if len(d):
            d = d[d["timestamp"] + DAY_MS <= now]
            d.to_csv(ddir / f"{safe}.csv", index=False)
        # funding（1回500件、差分だけ）
        fpath = ddir / f"funding_{safe}.csv"
        old = pd.read_csv(fpath) if fpath.exists() else pd.DataFrame(columns=["timestamp", "funding_rate"])
        since = int(old["timestamp"].max()) + 1 if len(old) else (int(d["timestamp"].min()) if len(d) else START_MS)
        rows = []
        while since < now - 3_600_000:
            f = _info(ex, {"type": "fundingHistory", "coin": coin, "startTime": since})
            if not f:
                break
            rows += [{"timestamp": int(x["time"]), "funding_rate": float(x["fundingRate"])} for x in f]
            last = int(f[-1]["time"])
            if last < since or len(f) < 500:
                break
            since = last + 1
        fd = pd.concat([old, pd.DataFrame(rows)], ignore_index=True)
        if len(fd):
            fd = fd.drop_duplicates("timestamp").sort_values("timestamp")
            fd.to_csv(fpath, index=False)
        meta.append({"symbol": coin, "file": safe, "delisted": bool(u.get("isDelisted", False)), "days": len(d)})
        print(f"  [{k + 1}/{len(universe)}] {coin:10s} 日足 {len(d):4d}本  funding {len(fd):6d}件 {'(上場廃止)' if meta[-1]['delisted'] else ''}",
              flush=True)
    pd.DataFrame(meta).to_csv(ddir / "_markets.csv", index=False)


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
    ap.add_argument("command", choices=["fetch", "run"])
    ap.add_argument("--config", default=str(BASE_DIR / "config.yaml"))
    a = ap.parse_args()
    cfg = load_cfg(Path(a.config))
    if a.command == "fetch":
        fetch(cfg)
    else:
        R.run(cfg, load_panel(cfg))


if __name__ == "__main__":
    main()
