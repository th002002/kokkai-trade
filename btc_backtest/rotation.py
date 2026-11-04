"""銘柄間ローテーション（中期モメンタム）の検証ツール。データ取得と試算のみ。

「資金が向かっている銘柄に乗り、弱まったら降りる」を日足でルール化して検証する。
注文・売買のコードはなく、APIキーも使わない（bitbank の公開APIのみ）。

使い方:
    python rotation.py fetch   # bitbank の円建て全ペアの日足を取得/差分更新
    python rotation.py run     # 学習期間で選び、検証期間で評価 → results/rotation/

ルール:
  - rebalance_weekday（既定: 日曜）の終値で判定し、翌日の始値で売買（ルックアヘッド防止）
  - 対象: 上場 min_history_days 日以上、直近30日の売買代金の中央値が min_jpy_volume 以上
  - 過去 lookback 日のリターンがプラスで上位 top_n の銘柄に、それぞれ資金の 1/top_n を投資
    （該当が top_n 未満なら残りは現金）
  - 保有中の銘柄は、順位が top_n × keep_buffer 以内なら持ち続ける（入れ替えすぎの防止）
  - BTC の終値が market_filter_sma 日移動平均を下回ったら全部現金
  - データが途切れた（上場廃止された）保有銘柄は、最後の終値で売ったものとする（やや楽観的）
"""
from __future__ import annotations

import argparse
import itertools
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

BASE_DIR = Path(__file__).resolve().parent
DAY_MS = 86_400_000


def load_cfg(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)["rotation"]


def resolve(p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else BASE_DIR / path


# ---------------------------------------------------------------------------
# データ取得（公開APIのみ）
# ---------------------------------------------------------------------------
def fetch(cfg: dict) -> None:
    import ccxt

    ex = ccxt.bitbank({"enableRateLimit": True, "requests_trust_env": True})  # 認証情報は渡さない
    ex.session.trust_env = True
    markets = ex.load_markets()
    ddir = resolve(cfg["data_dir"])
    ddir.mkdir(parents=True, exist_ok=True)
    now = ex.milliseconds()
    this_year = datetime.now(timezone.utc).year

    meta = []
    for sym, m in sorted(markets.items()):
        if not sym.endswith("/JPY"):
            continue
        pair = m["id"]
        path = ddir / f"{pair}.csv"
        old = pd.read_csv(path) if path.exists() else pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])
        first_year = datetime.fromtimestamp(old["timestamp"].max() / 1000, tz=timezone.utc).year if len(old) else 2017
        rows = []
        for year in range(first_year, this_year + 1):
            for attempt in range(5):
                try:
                    res = ex.publicGetPairCandlestickCandletypeYyyymmdd(
                        {"pair": pair, "candletype": "1day", "yyyymmdd": str(year)})
                    break
                except ccxt.ExchangeError:
                    res = None
                    break
                except (ccxt.NetworkError, ccxt.RateLimitExceeded):
                    time.sleep(2 ** (attempt + 1))
            else:
                raise RuntimeError("再試行の上限に達しました")
            if not res:
                continue
            for c in res["data"]["candlestick"][0]["ohlcv"]:
                rows.append({"timestamp": int(c[5]), "open": float(c[0]), "high": float(c[1]),
                             "low": float(c[2]), "close": float(c[3]), "volume": float(c[4])})
        df = pd.concat([old, pd.DataFrame(rows)], ignore_index=True)
        if len(df):
            df["timestamp"] = df["timestamp"].astype("int64")
            df = df.drop_duplicates("timestamp", keep="last").sort_values("timestamp")
            df = df[df["timestamp"] + DAY_MS <= now]  # 未確定の当日分は除く
            df.to_csv(path, index=False)
        enabled = m["info"].get("is_enabled", True)
        meta.append({"symbol": sym, "pair": pair, "is_enabled": enabled, "days": len(df),
                     "first": pd.to_datetime(df["timestamp"].min(), unit="ms").date() if len(df) else None,
                     "last": pd.to_datetime(df["timestamp"].max(), unit="ms").date() if len(df) else None})
        print(f"  {sym:12s} {len(df):5d}日  {meta[-1]['first']} 〜 {meta[-1]['last']}  {'' if enabled else '(取扱停止)'}")
    pd.DataFrame(meta).to_csv(ddir / "_markets.csv", index=False)


def load_panel(cfg: dict) -> dict[str, pd.DataFrame]:
    ddir = resolve(cfg["data_dir"])
    meta_path = ddir / "_markets.csv"
    if not meta_path.exists():
        sys.exit("データがありません。先に `python rotation.py fetch` を実行してください。")
    meta = pd.read_csv(meta_path)
    cols = {k: {} for k in ("open", "close", "volume")}
    for _, r in meta.iterrows():
        if r["symbol"] in cfg["exclude"] or r["days"] == 0:
            continue
        d = pd.read_csv(ddir / f"{r['pair']}.csv")
        d.index = pd.to_datetime(d["timestamp"], unit="ms", utc=True).dt.floor("D")
        d = d[~d.index.duplicated()]
        # 移行・取扱停止後に「出来高0で価格が止まった」日が続く場合は、最後に出来高があった日で打ち切る
        traded = d.index[d["volume"] > 0]
        if len(traded) and traded[-1] < d.index[-1]:
            d = d[d.index <= traded[-1]]
        for k in cols:
            cols[k][r["symbol"]] = d[k]
    panel = {k: pd.DataFrame(v).sort_index() for k, v in cols.items()}
    full = pd.date_range(panel["close"].index.min(), panel["close"].index.max(), freq="D", tz="UTC")
    return {k: v.reindex(full) for k, v in panel.items()}


# ---------------------------------------------------------------------------
# シグナル（すべて「その日の終値まで」のデータで計算）
# ---------------------------------------------------------------------------
def features(panel: dict, cfg: dict) -> dict:
    close = panel["close"]
    hist_ok = close.notna().cumsum() >= cfg["min_history_days"]
    jpy_vol = (panel["volume"] * close).rolling(30, min_periods=20).median()
    liq_ok = jpy_vol >= cfg["min_jpy_volume"]
    liq_ok["BTC/JPY"] = True  # BTC は基準の銘柄なので出来高の条件から外す（2017年は取引所全体の出来高が小さい）
    btc = close["BTC/JPY"]
    n = cfg.get("market_filter_sma")
    market_ok = (btc > btc.rolling(n, min_periods=n).mean()) if n else pd.Series(True, index=close.index)
    return {"hist_ok": hist_ok, "liq_ok": liq_ok & close.notna(), "market_ok": market_ok.fillna(False)}


def momentum(close: pd.DataFrame, lookback: int) -> pd.DataFrame:
    return close / close.shift(lookback) - 1


# 選び方（判定日 i の情報 → 目標の配分 {銘柄: 比率}）
def momentum_selector(panel, feat, cfg, params):
    mom = momentum(panel["close"], int(params["lookback"]))
    eligible = feat["hist_ok"] & feat["liq_ok"] & mom.notna()
    top_n = int(params["top_n"])
    keep_rank = int(math.ceil(top_n * cfg["keep_buffer"]))

    def select(i, held):
        if not feat["market_ok"].iloc[i]:
            return {}
        m = mom.iloc[i][eligible.iloc[i]]
        m = m[m > 0].sort_values(ascending=False)
        ranks = {s: r + 1 for r, s in enumerate(m.index)}
        chosen = [s for s in held if ranks.get(s, 10 ** 9) <= keep_rank]
        chosen = sorted(chosen, key=lambda s: ranks[s])[:top_n]
        for s in m.index:
            if len(chosen) >= top_n:
                break
            if s not in chosen:
                chosen.append(s)
        return {s: 1 / top_n for s in chosen}
    return select


def btc_hold_selector(panel, feat, cfg, params):
    return lambda i, held: {"BTC/JPY": 1.0}


def btc_filter_selector(panel, feat, cfg, params):
    return lambda i, held: {"BTC/JPY": 1.0} if feat["market_ok"].iloc[i] else {}


def equal_weight_selector(panel, feat, cfg, params):
    eligible = feat["hist_ok"] & feat["liq_ok"]

    def select(i, held):
        coins = list(eligible.columns[eligible.iloc[i].to_numpy()])
        return {s: 1 / len(coins) for s in coins} if coins else {}
    return select


# ---------------------------------------------------------------------------
# シミュレーション（日次）
# ---------------------------------------------------------------------------
def simulate(panel, cfg, select, start: int, end: int) -> dict:
    o = panel["open"].to_numpy()
    c = panel["close"].to_numpy()
    syms = list(panel["close"].columns)
    col = {s: j for j, s in enumerate(syms)}
    idx = panel["close"].index
    last_valid = {s: panel["close"][s].last_valid_index() for s in syms}
    cost_rate = cfg["fee_rate"] + cfg["slippage_rate"]
    wd = cfg["rebalance_weekday"]

    last_px = np.full(len(syms), np.nan)  # 直近の終値（欠損日の評価用）
    cash = float(cfg["initial_capital"])
    qty: dict[str, float] = {}
    pending = None
    equity = np.empty(end - start)
    n_hold = np.zeros(end - start)
    traded = costs = 0.0
    delisted_exits = []

    for t, i in enumerate(range(start, end)):
        # 始値: 前日の判定どおりに売買
        if pending is not None:
            px = {s: (o[i, col[s]] if np.isfinite(o[i, col[s]]) else np.nan) for s in set(qty) | set(pending)}
            eq_open = cash + sum(q * (px[s] if np.isfinite(px[s]) else last_px[col[s]]) for s, q in qty.items())
            for s in sorted(set(qty) | set(pending), key=lambda s: s in pending):  # 先に売り、後で買い
                p = px[s]
                if not np.isfinite(p):
                    continue  # その日に取引できない銘柄は据え置き
                target_val = eq_open * pending.get(s, 0.0) * (1 - cost_rate)  # 手数料分を残して借入なし
                cur_val = qty.get(s, 0.0) * p
                delta = target_val - cur_val
                if abs(delta) < 1e-9:
                    continue
                fee = abs(delta) * cost_rate
                cash -= delta + fee
                traded += abs(delta)
                costs += fee
                q = target_val / p
                if q > 0:
                    qty[s] = q
                else:
                    qty.pop(s, None)
            pending = None

        ci = c[i]
        ok = np.isfinite(ci)
        last_px[ok] = ci[ok]
        # 上場廃止: データが終わった保有銘柄は最後の終値で売る
        for s in list(qty):
            if last_valid[s] is not None and idx[i] > last_valid[s]:
                val = qty.pop(s) * last_px[col[s]]
                fee = val * cost_rate
                cash += val - fee
                costs += fee
                delisted_exits.append((idx[i].date(), s))

        equity[t] = cash + sum(q * last_px[col[s]] for s, q in qty.items())
        n_hold[t] = len(qty)
        if idx[i].weekday() == wd and i + 1 < end:
            pending = select(i, set(qty))

    eq = pd.Series(equity, index=idx[start:end])
    years = len(eq) / 365
    return {"equity": eq, "metrics": metrics(eq, cfg["initial_capital"], n_hold, traded, costs, years),
            "delisted": delisted_exits}


def metrics(eq, cap, n_hold, traded, costs, years) -> dict:
    ret = pd.concat([pd.Series([cap]), eq.reset_index(drop=True)]).pct_change().dropna()
    total = eq.iloc[-1] / cap - 1
    sd = ret.std()
    return {
        "start": eq.index[0].strftime("%Y-%m-%d"), "end": eq.index[-1].strftime("%Y-%m-%d"),
        "total_return_pct": round(total * 100, 1),
        "cagr_pct": round(((1 + total) ** (1 / years) - 1) * 100, 1) if total > -1 else -100.0,
        "max_drawdown_pct": round((eq / eq.cummax() - 1).min() * 100, 1),
        "sharpe": round(ret.mean() / sd * math.sqrt(365), 2) if sd > 0 else np.nan,
        "invested_pct": round((n_hold > 0).mean() * 100, 1),
        "avg_holdings": round(n_hold.mean(), 2),
        "turnover_per_year": round(traded / cap / years, 1),  # 初期資金に対する年間売買額（倍）
        "costs_pct_of_capital": round(costs / cap * 100, 1),
    }


def yearly_returns(curves: dict) -> pd.DataFrame:
    out = {}
    for name, eq in curves.items():
        y = eq.groupby(eq.index.year).last()
        prev = pd.concat([pd.Series([eq.iloc[0]], index=[y.index[0] - 1]), y.iloc[:-1]])
        out[name] = ((y.to_numpy() / prev.to_numpy() - 1) * 100).round(1)
        out[name] = pd.Series(out[name], index=y.index)
    return pd.DataFrame(out)


# ---------------------------------------------------------------------------
# 実行
# ---------------------------------------------------------------------------
def plot(curves: dict, split, path: Path, cap: float) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib import font_manager
    from matplotlib.ticker import FuncFormatter

    installed = {f.name for f in font_manager.fontManager.ttflist}
    jp = [f for f in ["Noto Sans CJK JP", "Noto Sans JP", "IPAexGothic", "IPAGothic", "Hiragino Sans",
                      "Yu Gothic", "Meiryo"] if f in installed]
    plt.rcParams["font.family"] = jp[:1] + ["DejaVu Sans"]
    styles = {
        "モメンタム・ローテーション": ("#2a78d6", "-", 2.0),
        "BTCずっと保有": ("#8a8984", "--", 1.4),
        "BTC＋200日線フィルター": ("#eb6834", "-", 1.4),
        "全銘柄を均等に保有": ("#1baf7a", "-", 1.4),
    }
    fig, ax = plt.subplots(figsize=(12, 6), dpi=150)
    for name, eq in curves.items():
        color, ls, lw = styles[name]
        ret = (eq.iloc[-1] / cap - 1) * 100
        ax.plot(eq.index, eq.values / cap, color=color, ls=ls, lw=lw, label=f"{name} {ret:+,.0f}%")
    ax.set_yscale("log")
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:g}倍"))
    ax.axvline(split, color="#8a8984", lw=1, ls=":")
    ax.annotate("← 学習 | 検証 →", (split, 1), xycoords=("data", "axes fraction"), ha="center", va="bottom",
                fontsize=8, color="#52514e")
    ax.axhline(1, color="#c3c2b7", lw=0.8)
    ax.set_title("資産の推移（初期資金＝1倍、対数目盛、手数料・スリッページ込み、全期間を通しで計算）",
                 loc="left", fontsize=11, pad=18)
    ax.grid(axis="y", color="#e8e7e2", lw=0.6)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.tick_params(colors="#52514e", labelsize=8)
    ax.legend(frameon=False, fontsize=9, loc="upper left")
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def run(cfg: dict) -> None:
    panel = load_panel(cfg)
    feat = features(panel, cfg)
    out = resolve(cfg["output_dir"])
    out.mkdir(parents=True, exist_ok=True)

    # 200日線が計算できる日から評価を始める（全戦略で同じ期間）
    first = int(np.argmax(panel["close"]["BTC/JPY"].rolling(cfg["market_filter_sma"] or 1).mean().notna().to_numpy()))
    n = len(panel["close"])
    k = first + int((n - first) * cfg["train_ratio"])
    idx = panel["close"].index
    print(f"評価期間: {idx[first]:%Y-%m-%d} 〜 {idx[-1]:%Y-%m-%d}（学習 〜{idx[k - 1]:%Y-%m-%d} / 検証 {idx[k]:%Y-%m-%d}〜）")
    print(f"銘柄数: {panel['close'].shape[1]}（うち途中でデータが終わった銘柄 "
          f"{int((panel['close'].apply(lambda s: s.last_valid_index()) < idx[-1]).sum())}）")

    keys = list(cfg["grid"])
    combos = [{**cfg["params"], **dict(zip(keys, v))} for v in itertools.product(*(cfg["grid"][k_] for k_ in keys))]
    if len(combos) > 16:
        sys.exit("探索数が多すぎます（16まで）")
    rows, best = [], None
    for p in combos:
        r = simulate(panel, cfg, momentum_selector(panel, feat, cfg, p), first, k)
        rows.append({**p, **r["metrics"]})
        if best is None or r["metrics"]["sharpe"] > best[0]:
            best = (r["metrics"]["sharpe"], p)
    pd.DataFrame(rows).to_csv(out / "grid.csv", index=False)
    bp = best[1]
    print(f"採用パラメータ（学習期間のシャープ最大）: lookback={bp['lookback']}日, top_n={bp['top_n']}")
    print(pd.DataFrame(rows)[["lookback", "top_n", "total_return_pct", "cagr_pct", "max_drawdown_pct", "sharpe"]]
          .to_string(index=False))

    strategies = {
        "モメンタム・ローテーション": momentum_selector(panel, feat, cfg, bp),
        "BTCずっと保有": btc_hold_selector(panel, feat, cfg, None),
        "BTC＋200日線フィルター": btc_filter_selector(panel, feat, cfg, None),
        "全銘柄を均等に保有": equal_weight_selector(panel, feat, cfg, None),
    }
    summary, curves = [], {}
    for name, sel in strategies.items():
        for period, (a, b) in (("train", (first, k)), ("test", (k, n))):
            r = simulate(panel, cfg, sel, a, b)
            summary.append({"strategy": name, "period": period, **r["metrics"]})
            if name == "モメンタム・ローテーション" and period == "test" and r["delisted"]:
                print(f"  検証期間に上場廃止で手放した銘柄: {r['delisted']}")
        curves[name] = simulate(panel, cfg, sel, first, n)["equity"]

    sm = pd.DataFrame(summary)
    sm.to_csv(out / "summary.csv", index=False)
    yr = yearly_returns(curves)
    yr.to_csv(out / "yearly.csv")
    plot(curves, idx[k], out / "rotation_equity.png", cfg["initial_capital"])
    pd.set_option("display.width", 200)
    print("\n" + sm.to_string(index=False))
    print("\n年ごとのリターン(%)（全期間を通しで計算）\n" + yr.to_string())
    print(f"\n出力: {out}/ (summary.csv, yearly.csv, grid.csv, rotation_equity.png)")
    print("※ 過去の成績は将来の成績を保証しません。")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["fetch", "run"])
    ap.add_argument("--config", default=str(BASE_DIR / "config.yaml"))
    a = ap.parse_args()
    cfg = load_cfg(Path(a.config))
    fetch(cfg) if a.command == "fetch" else run(cfg)


if __name__ == "__main__":
    main()
