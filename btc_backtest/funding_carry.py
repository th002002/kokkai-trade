"""Funding Carry（現物ロング + 無期限先物ショート）の検証ツール。データ取得と試算のみ。

注文・売買のコードはなく、APIキーも使わない。Hyperliquid の公開API（認証不要）だけを使う。

使い方:
    python funding_carry.py fetch   # funding 履歴（1時間ごと）と日足を取得/差分更新
    python funding_carry.py run     # 統計 + 試算（常時保有 / 条件付き）→ results/funding/

モデル（日単位のシミュレーション、UTC）:
  - 建てるとき: 資金 C を「現物 N」と「先物口座の証拠金 M」に分ける（N/M = short_leverage）。
    現物を N 買い、先物を同じ数量ショート。コスト = N × (現物手数料 + 先物手数料 + 2×スリッページ + ベーシス)
  - 毎日: 先物ショートは 数量 × 価格 × その日の funding 合計 を受け取る（funding がマイナスなら払う）。
    funding の価格には、その日の始値と終値の平均を使う（1時間ごとの価格は使わない近似）
  - 価格変動は現物と先物で打ち消すが、先物口座の証拠金は増減する。
    その日の高値で先物口座の資産が維持証拠金を下回ったら「清算」= 先物口座の資産をすべて失い、
    残った現物は終値で売る（保守的な扱い）
  - 日末にレバレッジが目標から rebalance_band 以上ずれたら、現物と先物の数量を同時に調整（両方の足でコスト）
  - 条件付き: 直近 window_days 日の平均 funding（年率）を日末に判定し、翌日の始値で建てる/解消する
  - ポジションがない間の USDC の利回りは 0 とする
"""
from __future__ import annotations

import argparse
import itertools
import math
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

BASE_DIR = Path(__file__).resolve().parent
HOURS_PER_YEAR = 24 * 365


def load_cfg(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)["funding_carry"]


def resolve(p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else BASE_DIR / path


# ---------------------------------------------------------------------------
# データ取得（公開APIのみ）
# ---------------------------------------------------------------------------
def _exchange():
    import ccxt

    ex = ccxt.hyperliquid({"enableRateLimit": True, "requests_trust_env": True})  # 認証情報は渡さない
    ex.session.trust_env = True
    return ex


def _retry(fn, *args, retries=5, **kw):
    import ccxt

    for i in range(retries):
        try:
            return fn(*args, **kw)
        except (ccxt.NetworkError, ccxt.RateLimitExceeded) as e:
            wait = 2 ** (i + 1)
            print(f"  通信エラー({type(e).__name__})。{wait}秒後に再試行")
            time.sleep(wait)
    raise RuntimeError("再試行の上限に達しました")


def _merge_save(path: Path, old: pd.DataFrame, new: pd.DataFrame, key: str) -> pd.DataFrame:
    df = pd.concat([old, new], ignore_index=True).drop_duplicates(key, keep="last").sort_values(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    return df


def fetch(cfg: dict) -> None:
    ex = _exchange()
    ddir = resolve(cfg["data_dir"])
    start = ex.parse8601("2023-01-01T00:00:00Z")
    now = ex.milliseconds()
    for coin in cfg["coins"]:
        sym = f"{coin}/USDC:USDC"

        # funding（1時間ごと、1回500件まで）
        fpath = ddir / f"funding_{coin}.csv"
        old = pd.read_csv(fpath) if fpath.exists() else pd.DataFrame(columns=["timestamp", "funding_rate", "premium"])
        since = int(old["timestamp"].max()) + 1 if len(old) else start
        rows = []
        while since < now - 3_600_000:
            got = _retry(ex.fetch_funding_rate_history, sym, since=since, limit=500)
            if not got:
                break
            rows += [{"timestamp": int(r["timestamp"]), "funding_rate": float(r["fundingRate"]),
                      "premium": float(r["info"].get("premium", "nan"))} for r in got]
            last = int(got[-1]["timestamp"])
            if last < since:
                break
            since = last + 1
            time.sleep(0.3)  # レート制限を避ける
        f = _merge_save(fpath, old, pd.DataFrame(rows), "timestamp")

        # 日足（先物、未確定の当日分は除く）
        ppath = ddir / f"perp_{coin}_1d.csv"
        oldp = pd.read_csv(ppath) if ppath.exists() else pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])
        since_p = int(oldp["timestamp"].max()) if len(oldp) else start
        got = _retry(ex.fetch_ohlcv, sym, "1d", since=since_p, limit=5000)
        newp = pd.DataFrame(got, columns=["timestamp", "open", "high", "low", "close", "volume"])
        newp = newp[newp["timestamp"] + 86_400_000 <= now]
        p = _merge_save(ppath, oldp, newp, "timestamp")

        fd = pd.to_datetime(f["timestamp"], unit="ms", utc=True)
        pdd = pd.to_datetime(p["timestamp"], unit="ms", utc=True)
        print(f"{coin}: funding {len(f)}件 ({fd.min():%Y-%m-%d}〜{fd.max():%Y-%m-%d %H:%M}), "
              f"日足 {len(p)}本 ({pdd.min():%Y-%m-%d}〜{pdd.max():%Y-%m-%d})")


def load_coin(cfg: dict, coin: str) -> pd.DataFrame:
    ddir = resolve(cfg["data_dir"])
    fpath, ppath = ddir / f"funding_{coin}.csv", ddir / f"perp_{coin}_1d.csv"
    if not fpath.exists() or not ppath.exists():
        sys.exit("データがありません。先に `python funding_carry.py fetch` を実行してください。")
    f = pd.read_csv(fpath)
    f["day"] = pd.to_datetime(f["timestamp"], unit="ms", utc=True).dt.floor("D")
    daily_f = f.groupby("day").agg(funding_sum=("funding_rate", "sum"), hours=("funding_rate", "size"),
                                   neg_hours=("funding_rate", lambda s: int((s < 0).sum())))
    p = pd.read_csv(ppath)
    p.index = pd.to_datetime(p["timestamp"], unit="ms", utc=True)
    df = p[["open", "high", "low", "close"]].join(daily_f, how="inner")
    # funding が揃っていない日（取得途中・データ開始日など）は除外
    df = df[df["hours"] >= 20]
    return df


# ---------------------------------------------------------------------------
# シミュレーション
# ---------------------------------------------------------------------------
def simulate(df: pd.DataFrame, cfg: dict, coin: str, params: dict | None, start: int, end: int) -> dict:
    """params=None なら常時保有。戻り値: equity(Series), events など。"""
    o, h, c = (df[k].to_numpy()[start:end] for k in ("open", "high", "close"))
    fsum = df["funding_sum"].to_numpy()
    idx = df.index[start:end]
    n = len(idx)

    lev = cfg["short_leverage"]
    band = cfg["rebalance_band"]
    mm = cfg["maintenance_margin"][coin]
    leg_cost = cfg["spot_fee"] + cfg["perp_fee"] + 2 * cfg["slippage"]  # 両方の足を1回ずつ売買
    open_cost = leg_cost + cfg["basis_cost"]

    if params is None:
        want = np.ones(n, dtype=bool)
    else:
        w = int(params["window_days"])
        # 直近 w 日の平均（年率）。日末に判定 → 翌日に反映
        apr = pd.Series(fsum).rolling(w, min_periods=w).sum().to_numpy() / (w * 24) * HOURS_PER_YEAR
        apr = apr[start:end]
        want = np.zeros(n, dtype=bool)
        inside = False
        ent, ext = params["entry_apr"], params["entry_apr"] * params["exit_ratio"]
        for i in range(n):
            if not np.isnan(apr[i]):
                inside = apr[i] >= ent if not inside else apr[i] >= ext
            want[i] = inside
        want = np.r_[False, want[:-1]]  # 翌日から

    cash = float(cfg["initial_capital"])
    q = ep = 0.0
    p_prev = 0.0
    equity = np.empty(n)
    ev = {"entries": 0, "rebalances": 0, "liquidations": 0, "cost": 0.0, "funding": 0.0, "days_in": 0,
          "max_lev": 0.0}
    for i in range(n):
        in_pos = q > 0
        if want[i] and not in_pos:          # 始値で建てる
            notional = cash * lev / (1 + lev)
            cost = notional * open_cost
            q = notional / o[i]
            ep = cash - notional - cost
            cash, p_prev = 0.0, o[i]
            ev["entries"] += 1
            ev["cost"] += cost
        elif not want[i] and in_pos:        # 始値で解消
            ep += -q * (o[i] - p_prev)
            cost = q * o[i] * open_cost
            cash = q * o[i] + ep - cost
            q = ep = 0.0
            ev["cost"] += cost

        if q > 0:
            ev["days_in"] += 1
            # 高値でショート側が清算されるか
            ep_high = ep - q * (h[i] - p_prev)
            if ep_high < mm * q * h[i]:
                ev["liquidations"] += 1
                spot_val = q * c[i] * (1 - cfg["spot_fee"] - cfg["slippage"])
                cash = spot_val  # 先物口座の資産はすべて失う（保守的）
                q = ep = 0.0
            else:
                pay = q * (o[i] + c[i]) / 2 * fsum[start + i]
                ep += -q * (c[i] - p_prev) + pay
                ev["funding"] += pay
                p_prev = c[i]
                cur_lev = q * c[i] / ep if ep > 0 else math.inf
                ev["max_lev"] = max(ev["max_lev"], cur_lev)
                if abs(cur_lev - lev) > lev * band:  # 日末に調整
                    total = q * c[i] + ep
                    q_new = total * lev / (1 + lev) / c[i]
                    cost = abs(q - q_new) * c[i] * leg_cost
                    q, ep = q_new, total - q_new * c[i] - cost
                    ev["rebalances"] += 1
                    ev["cost"] += cost
        equity[i] = cash + (q * c[i] + ep if q > 0 else 0.0)

    eq = pd.Series(equity, index=idx)
    return {"equity": eq, "events": ev, "metrics": metrics(eq, ev, cfg["initial_capital"])}


def metrics(eq: pd.Series, ev: dict, cap: float) -> dict:
    ret = pd.concat([pd.Series([cap]), eq.reset_index(drop=True)]).pct_change().dropna()
    years = len(eq) / 365
    total = eq.iloc[-1] / cap - 1
    sd = ret.std()
    return {
        "start": eq.index[0].strftime("%Y-%m-%d"), "end": eq.index[-1].strftime("%Y-%m-%d"),
        "total_return_pct": round(total * 100, 2),
        "apr_pct": round(((1 + total) ** (1 / years) - 1) * 100, 2) if years > 0 and total > -1 else np.nan,
        "max_drawdown_pct": round((eq / eq.cummax() - 1).min() * 100, 2),
        "sharpe": round(ret.mean() / sd * math.sqrt(365), 2) if sd > 0 else np.nan,
        "time_in_pct": round(ev["days_in"] / len(eq) * 100, 1),
        "entries": ev["entries"], "rebalances": ev["rebalances"], "liquidations": ev["liquidations"],
        "funding_received": round(ev["funding"], 2), "costs_paid": round(ev["cost"], 2),
    }


def funding_stats(df: pd.DataFrame) -> pd.DataFrame:
    """年ごとの funding の実績（年率、マイナスの時間の割合、最悪の30日）。"""
    out = []
    for year, g in df.groupby(df.index.year):
        roll30 = g["funding_sum"].rolling(30, min_periods=30).sum() / 30 * 365
        out.append({
            "year": year, "days": len(g),
            "avg_apr_pct": round(g["funding_sum"].sum() / g["hours"].sum() * HOURS_PER_YEAR * 100, 2),
            "neg_hours_pct": round(g["neg_hours"].sum() / g["hours"].sum() * 100, 1),
            "neg_days_pct": round((g["funding_sum"] < 0).mean() * 100, 1),
            "worst_30d_apr_pct": round(roll30.min() * 100, 2) if roll30.notna().any() else np.nan,
            "best_30d_apr_pct": round(roll30.max() * 100, 2) if roll30.notna().any() else np.nan,
        })
    return pd.DataFrame(out)


def max_adverse_move(df: pd.DataFrame, days: int) -> float:
    """任意の時点から days 日以内の最大上昇率（ショート側に必要な余裕の目安）。"""
    c, h = df["close"].to_numpy(), df["high"].to_numpy()
    best = 0.0
    for i in range(len(c) - 1):
        best = max(best, h[i + 1:i + 1 + days].max() / c[i] - 1)
    return best


# ---------------------------------------------------------------------------
# 実行
# ---------------------------------------------------------------------------
def plot(curves: dict, splits: dict, path: Path, cap: float) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib import font_manager

    installed = {f.name for f in font_manager.fontManager.ttflist}
    jp = [f for f in ["Noto Sans CJK JP", "Noto Sans JP", "IPAexGothic", "IPAGothic", "Hiragino Sans",
                      "Yu Gothic", "Meiryo"] if f in installed]
    plt.rcParams["font.family"] = jp[:1] + ["DejaVu Sans"]
    colors = {"常時保有": "#2a78d6", "条件付き": "#eb6834"}
    fig, axes = plt.subplots(len(curves), 1, figsize=(12, 3.6 * len(curves)), dpi=150, squeeze=False)
    for ax, (coin, cv) in zip(axes[:, 0], curves.items()):
        for label, eq in cv.items():
            ret = (eq.iloc[-1] / cap - 1) * 100
            ax.plot(eq.index, eq.values / cap * 100 - 100, color=colors[label], lw=1.6, label=f"{label} {ret:+.1f}%")
        ax.axvline(splits[coin], color="#8a8984", lw=1, ls="--")
        ax.annotate("← 学習 | 検証 →", (splits[coin], 1), xycoords=("data", "axes fraction"),
                    ha="center", va="bottom", fontsize=8, color="#52514e")
        ax.axhline(0, color="#c3c2b7", lw=0.8)
        ax.set_title(f"{coin}（現物ロング＋先物ショート、コスト込み）", loc="left", fontsize=11, pad=16)
        ax.set_ylabel("累積リターン %", fontsize=9, color="#52514e")
        ax.grid(axis="y", color="#e8e7e2", lw=0.6)
        for s in ("top", "right"):
            ax.spines[s].set_visible(False)
        ax.tick_params(colors="#52514e", labelsize=8)
        ax.legend(frameon=False, fontsize=8, loc="upper left")
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def run(cfg: dict) -> None:
    out = resolve(cfg["output_dir"])
    out.mkdir(parents=True, exist_ok=True)
    summary, curves, splits, stats_all = [], {}, {}, []
    keys = list(cfg["grid"])
    combos = [{**cfg["params"], **dict(zip(keys, v))} for v in itertools.product(*(cfg["grid"][k] for k in keys))]
    if len(combos) > 16:
        sys.exit("探索数が多すぎます（16まで）")

    pd.set_option("display.width", 200)
    for coin in cfg["coins"]:
        df = load_coin(cfg, coin)
        k = int(len(df) * cfg["train_ratio"])
        splits[coin] = df.index[k]
        st = funding_stats(df)
        st.insert(0, "coin", coin)
        stats_all.append(st)
        print(f"\n== {coin} ==  {df.index[0]:%Y-%m-%d} 〜 {df.index[-1]:%Y-%m-%d}（学習 〜{df.index[k - 1]:%Y-%m-%d} / 検証 {df.index[k]:%Y-%m-%d}〜）")
        print(st.drop(columns="coin").to_string(index=False))
        print(f"  最大上昇率（ショート側の逆行）: 1日 {max_adverse_move(df, 1):.0%} / 7日 {max_adverse_move(df, 7):.0%} / 30日 {max_adverse_move(df, 30):.0%}")

        # 常時保有
        always = {p: simulate(df, cfg, coin, None, *rng) for p, rng in (("train", (0, k)), ("test", (k, len(df))))}
        # 条件付き: 学習期間で APR 最大のものを選ぶ
        best = None
        grid_rows = []
        for p in combos:
            r = simulate(df, cfg, coin, p, 0, k)
            grid_rows.append({**p, **r["metrics"]})
            if best is None or r["metrics"]["total_return_pct"] > best[0]:
                best = (r["metrics"]["total_return_pct"], p, r)
        pd.DataFrame(grid_rows).to_csv(out / f"grid_{coin}.csv", index=False)
        _, bp, btrain = best
        btest = simulate(df, cfg, coin, bp, k, len(df))
        print(f"  条件付きの採用パラメータ（学習期間で選択）: window={bp['window_days']}日, entry_apr={bp['entry_apr']:.0%}")

        for label, res in (("常時保有", always), ("条件付き", {"train": btrain, "test": btest})):
            for period in ("train", "test"):
                summary.append({"coin": coin, "strategy": label, "period": period, **res[period]["metrics"]})
        full_always = simulate(df, cfg, coin, None, 0, len(df))["equity"]
        full_cond = simulate(df, cfg, coin, bp, 0, len(df))["equity"]
        curves[coin] = {"常時保有": full_always, "条件付き": full_cond}

    sm = pd.DataFrame(summary)
    sm.to_csv(out / "summary.csv", index=False)
    pd.concat(stats_all).to_csv(out / "funding_stats.csv", index=False)
    plot(curves, splits, out / "carry_equity.png", cfg["initial_capital"])
    cols = ["coin", "strategy", "period", "total_return_pct", "apr_pct", "max_drawdown_pct", "sharpe",
            "time_in_pct", "entries", "rebalances", "liquidations", "funding_received", "costs_paid"]
    print("\n" + sm[cols].to_string(index=False))
    print(f"\n出力: {out}/ (summary.csv, funding_stats.csv, carry_equity.png, grid_*.csv)")
    print("※ 過去の成績は将来の成績を保証しません。取引所・ブリッジ資産のリスクはこの試算に含まれていません。")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["fetch", "run"])
    ap.add_argument("--config", default=str(BASE_DIR / "config.yaml"))
    a = ap.parse_args()
    cfg = load_cfg(Path(a.config))
    fetch(cfg) if a.command == "fetch" else run(cfg)


if __name__ == "__main__":
    main()
