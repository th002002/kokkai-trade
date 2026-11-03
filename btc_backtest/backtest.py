"""BTC/JPY 15分足 デイトレ戦略の検証ツール（データ取得 + バックテストのみ）。

このファイルには注文・売買のコードはなく、APIキーも扱わない。
ccxt は認証不要の公開API（fetch_ohlcv）にだけ使う。

使い方:
    python backtest.py fetch            # 過去データを取得/差分更新
    python backtest.py run              # 学習期間で探索 → 検証期間で評価
    python backtest.py run --strategy rsi_reversal
"""
from __future__ import annotations

import argparse
import itertools
import math
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

import strategies

BASE_DIR = Path(__file__).resolve().parent
TZ = "Asia/Tokyo"
TF_MS = {"1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000}


# ---------------------------------------------------------------------------
# 設定
# ---------------------------------------------------------------------------
def load_config(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def resolve(p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else BASE_DIR / path


def hhmm_to_min(s: str) -> int:
    h, m = str(s).split(":")
    return int(h) * 60 + int(m)


# ---------------------------------------------------------------------------
# 1. データ取得（公開APIのみ）
# ---------------------------------------------------------------------------
CSV_COLUMNS = ["timestamp", "datetime_jst", "open", "high", "low", "close", "volume"]


def _read_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame(columns=CSV_COLUMNS)
    return pd.read_csv(path)


def _save_csv(path: Path, existing: pd.DataFrame, rows: list, tf_ms: int) -> pd.DataFrame:
    new = pd.DataFrame(rows, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df = pd.concat([existing[["timestamp", "open", "high", "low", "close", "volume"]], new], ignore_index=True)
    df["timestamp"] = df["timestamp"].astype("int64")
    df = df.drop_duplicates("timestamp", keep="last").sort_values("timestamp")
    now_ms = int(time.time() * 1000)
    df = df[df["timestamp"] + tf_ms <= now_ms]  # まだ確定していない足は保存しない
    df["datetime_jst"] = (
        pd.to_datetime(df["timestamp"], unit="ms", utc=True).dt.tz_convert(TZ).dt.strftime("%Y-%m-%d %H:%M")
    )
    df = df[CSV_COLUMNS].reset_index(drop=True)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".csv.tmp")
    df.to_csv(tmp, index=False)
    tmp.replace(path)
    return df


def _fetch_with_retry(ex, symbol, tf, since, retries=5):
    import ccxt

    for attempt in range(retries):
        try:
            return ex.fetch_ohlcv(symbol, tf, since=since)
        except (ccxt.NetworkError, ccxt.RateLimitExceeded) as e:
            wait = 2 ** (attempt + 1)
            print(f"  通信エラー({type(e).__name__})。{wait}秒後に再試行 ({attempt + 1}/{retries})")
            time.sleep(wait)
    raise RuntimeError("再試行の上限に達しました。時間をおいて再実行してください（取得済み分は保存済み）")


def fetch(cfg: dict) -> None:
    import ccxt

    dcfg = cfg["data"]
    path = resolve(dcfg["csv_path"])
    tf = dcfg["timeframe"]
    tf_ms = TF_MS[tf]

    # 認証情報は渡さない（公開APIのみ使用）
    # trust_env: 環境変数のHTTP(S)_PROXY を使う（社内プロキシ等の環境向け）
    ex = getattr(ccxt, dcfg["exchange"])({"enableRateLimit": True, "trust_env": True})

    existing = _read_csv(path)
    if len(existing):
        last_ts = int(existing["timestamp"].max())
        start = datetime.fromtimestamp(last_ts / 1000, tz=timezone.utc).date()
        print(f"既存データ: {len(existing)}本（最終 {existing['datetime_jst'].iloc[-1]} JST）。差分を取得します")
    else:
        start = datetime.strptime(dcfg["fetch_start_date"], "%Y-%m-%d").date()
        print(f"新規取得: {start} から")

    today = datetime.now(timezone.utc).date()
    # bitbank の15分足は1リクエスト=1日分なので、日単位で進める
    day, rows, total_days = start, [], (today - start).days + 1
    for k in range(total_days):
        since = int(datetime(day.year, day.month, day.day, tzinfo=timezone.utc).timestamp() * 1000)
        try:
            got = _fetch_with_retry(ex, dcfg["symbol"], tf, since)
        except ccxt.ExchangeError as e:  # その日のデータがない等
            got = []
            if len(existing) or rows:
                print(f"  {day}: 取得できず ({str(e)[:80]})")
        rows.extend(got)
        if (k + 1) % 30 == 0 or day == today:
            existing = _save_csv(path, existing, rows, tf_ms)
            rows = []
            print(f"  {day} まで処理 ({k + 1}/{total_days}日) 保存済み {len(existing)}本")
        day += timedelta(days=1)

    if len(existing):
        print(f"完了: {path} に {len(existing)}本 ({existing['datetime_jst'].iloc[0]} 〜 {existing['datetime_jst'].iloc[-1]} JST)")
    else:
        print("データを取得できませんでした。")


def load_ohlcv(cfg: dict) -> pd.DataFrame:
    path = resolve(cfg["data"]["csv_path"])
    if not path.exists():
        sys.exit(f"{path} がありません。先に `python backtest.py fetch` を実行してください。")
    df = pd.read_csv(path)
    df.index = pd.to_datetime(df["timestamp"], unit="ms", utc=True).dt.tz_convert(TZ)
    df = df[["open", "high", "low", "close", "volume"]].astype(float)
    df = df[~df.index.duplicated()].sort_index()
    s, e = cfg["data"].get("backtest_start"), cfg["data"].get("backtest_end")
    if s:
        df = df[df.index >= pd.Timestamp(s, tz=TZ)]
    if e:
        df = df[df.index < pd.Timestamp(e, tz=TZ)]
    return df


# ---------------------------------------------------------------------------
# 2. バックテストエンジン
# ---------------------------------------------------------------------------
@dataclass
class Result:
    equity: pd.Series                 # 各足の終値時点の資産（含み損益込み）
    trades: pd.DataFrame
    initial_capital: float
    metrics: dict = field(default_factory=dict)


def run_backtest(df: pd.DataFrame, sig: strategies.Signals, bt: dict, start: int = 0, end: int | None = None) -> Result:
    """df.iloc[start:end] の範囲だけで売買する。シグナルは df 全体で計算済みのものを使う。

    約定ルール:
      - シグナル（足 i の終値で判定）→ 足 i+1 の始値で約定。i+1 が別の日なら破棄
      - 損切り/利確は事前に決まった価格なので足の途中で判定。同じ足で両方届いたら損切り優先
      - 窓を空けて損切り価格を下回って始まったら始値で約定
      - force_close_time の足（またはその日の最後の足）の終値で強制決済
      - 買いは価格*(1+slip)、売りは価格*(1-slip)。手数料は約定代金の fee_rate を片道ごとに徴収
    """
    end = len(df) if end is None else end
    idx = df.index[start:end]
    o = df["open"].to_numpy()[start:end]
    h = df["high"].to_numpy()[start:end]
    l = df["low"].to_numpy()[start:end]
    c = df["close"].to_numpy()[start:end]
    n = len(idx)

    entry = sig.entry.to_numpy(dtype=bool)[start:end]
    exit_ = sig.exit.to_numpy(dtype=bool)[start:end]
    stop_d = sig.stop_dist.to_numpy(dtype=float)[start:end] if sig.stop_dist is not None else None
    take_d = sig.take_dist.to_numpy(dtype=float)[start:end] if sig.take_dist is not None else None
    max_hold = int(sig.max_hold_bars) if sig.max_hold_bars else None

    fee, slip = bt["fee_rate"], bt["slippage_rate"]
    size, step = bt["position_size"], bt["qty_step"]
    loss_lim = bt["daily_max_loss"]
    use_unreal = bt.get("daily_loss_include_unrealized", True)
    force_min = hhmm_to_min(bt["force_close_time"])
    last_entry_min = hhmm_to_min(bt["last_entry_time"])
    if not 0 < size <= 1:
        raise ValueError("position_size は 0〜1（レバレッジなし）")

    day = (idx.year * 10000 + idx.month * 100 + idx.day).to_numpy()
    minute = (idx.hour * 60 + idx.minute).to_numpy()
    last_of_day = np.ones(n, dtype=bool)
    if n > 1:
        last_of_day[:-1] = day[1:] != day[:-1]
    last_of_day |= minute >= force_min

    cash = float(bt["initial_capital"])
    qty = 0.0
    cost = entry_fill = stop_px = take_px = 0.0
    entry_i = hold = 0
    pending = None          # ("buy", signal_index) / ("sell", reason)
    cur_day, day_start_eq, halted = None, cash, False
    equity = np.empty(n)
    trades = []

    def sell(i, price, reason):
        nonlocal cash, qty
        fill = price * (1 - slip)
        proceeds = qty * fill * (1 - fee)
        trades.append({
            "entry_time": idx[entry_i], "exit_time": idx[i], "entry_price": entry_fill, "exit_price": fill,
            "qty": qty, "pnl": proceeds - cost, "return": proceeds / cost - 1, "bars": hold, "reason": reason,
        })
        cash += proceeds
        qty = 0.0

    for i in range(n):
        if day[i] != cur_day:  # 日替わり: 持ち越しはない（前日に強制決済済み）
            cur_day, pending, halted = day[i], None, False
            day_start_eq = cash
        threshold = day_start_eq * (1 - loss_lim)

        # --- 始値: 前の足のシグナルを約定 ---
        if pending is not None:
            kind, info = pending
            if kind == "buy" and qty == 0 and not halted:
                fill = o[i] * (1 + slip)
                q = math.floor(cash * size / (fill * (1 + fee)) / step) * step
                if q > 0:
                    qty, entry_fill, entry_i, hold = q, fill, i, 0
                    cost = q * fill * (1 + fee)
                    cash -= cost
                    stop_px = fill - stop_d[info] if stop_d is not None and np.isfinite(stop_d[info]) else np.nan
                    take_px = fill + take_d[info] if take_d is not None and np.isfinite(take_d[info]) else np.nan
            elif kind == "sell" and qty > 0:
                sell(i, o[i], info)
            pending = None

        # --- 足の途中: 損切り/利確（価格は約定時点で既知） ---
        if qty > 0:
            if not np.isnan(stop_px) and l[i] <= stop_px:
                sell(i, min(o[i], stop_px), "stop")
            elif not np.isnan(take_px) and h[i] >= take_px:
                sell(i, max(o[i], take_px), "take")

        # --- 終値: 判定 ---
        if qty > 0:
            hold += 1
            if last_of_day[i]:
                sell(i, c[i], "force_close")
            elif use_unreal and cash + qty * c[i] <= threshold:
                pending, halted = ("sell", "daily_loss"), True
            elif exit_[i]:
                pending = ("sell", "signal")
            elif max_hold and hold >= max_hold:
                pending = ("sell", "time")
        if qty == 0 and cash <= threshold:
            halted = True  # 確定損失で日次上限に到達 → 当日は新規なし
        if (qty == 0 and pending is None and not halted and entry[i] and not last_of_day[i]
                and minute[i + 1] <= last_entry_min):
            pending = ("buy", i)

        equity[i] = cash + qty * c[i]

    tr = pd.DataFrame(trades, columns=["entry_time", "exit_time", "entry_price", "exit_price",
                                       "qty", "pnl", "return", "bars", "reason"])
    res = Result(pd.Series(equity, index=idx), tr, float(bt["initial_capital"]))
    res.metrics = compute_metrics(res)
    return res


def compute_metrics(r: Result) -> dict:
    eq = r.equity
    if eq.empty:
        return {}
    daily = eq.groupby(eq.index.date).last()
    daily_ret = pd.concat([pd.Series([r.initial_capital]), daily.reset_index(drop=True)]).pct_change().dropna()
    sd = daily_ret.std()
    t = r.trades
    wins, losses = t.loc[t["pnl"] > 0, "pnl"].sum(), -t.loc[t["pnl"] < 0, "pnl"].sum()
    return {
        "start": eq.index[0].strftime("%Y-%m-%d"),
        "end": eq.index[-1].strftime("%Y-%m-%d"),
        "final_equity": round(eq.iloc[-1]),
        "total_pnl": round(eq.iloc[-1] - r.initial_capital),
        "total_return_pct": round((eq.iloc[-1] / r.initial_capital - 1) * 100, 2),
        "max_drawdown_pct": round(((eq / eq.cummax()) - 1).min() * 100, 2),
        "trades": len(t),
        "win_rate_pct": round((t["pnl"] > 0).mean() * 100, 1) if len(t) else np.nan,
        "avg_pnl_per_trade": round(t["pnl"].mean()) if len(t) else np.nan,
        "avg_return_per_trade_pct": round(t["return"].mean() * 100, 3) if len(t) else np.nan,
        "profit_factor": round(wins / losses, 2) if losses > 0 else np.nan,
        "sharpe": round(daily_ret.mean() / sd * math.sqrt(365), 2) if sd > 0 else np.nan,
    }


# ---------------------------------------------------------------------------
# 3. 検証（学習期間で探索 → 検証期間で評価）
# ---------------------------------------------------------------------------
def split_index(df: pd.DataFrame, vcfg: dict) -> int:
    if vcfg.get("split_date"):
        k = int(df.index.searchsorted(pd.Timestamp(vcfg["split_date"], tz=TZ)))
    else:
        k = int(len(df) * vcfg["train_ratio"])
        # 日の途中で切らない
        d0 = df.index[k].normalize()
        k = int(df.index.searchsorted(d0))
    if not 0 < k < len(df):
        sys.exit("学習/検証の分割位置が不正です（split_date / train_ratio を確認）")
    return k


def param_candidates(scfg: dict, max_comb: int) -> list[dict]:
    base = dict(scfg.get("params") or {})
    grid = scfg.get("grid") or {}
    if scfg.get("optimize", True) is False or not grid:
        return [base]
    keys = list(grid)
    combos = list(itertools.product(*(grid[k] for k in keys)))
    if len(combos) > max_comb:
        raise ValueError(f"探索数 {len(combos)} が上限 max_combinations={max_comb} を超えています。"
                         "候補を減らしてください（過剰最適化の防止）")
    return [{**base, **dict(zip(keys, v))} for v in combos]


def evaluate_strategy(name, scfg, df, k, cfg):
    gen = strategies.load(name)
    bt, vcfg = cfg["backtest"], cfg["validation"]
    obj = {"sharpe": "sharpe", "total_return": "total_return_pct"}[vcfg["objective"]]

    rows, best = [], None
    for p in param_candidates(scfg, vcfg["max_combinations"]):
        sig = gen(df, p)  # インジケータは過去方向のみなので全期間で計算しても情報は漏れない
        r = run_backtest(df, sig, bt, 0, k)
        rows.append({**{f"p.{a}": b for a, b in p.items()}, **r.metrics})
        score = r.metrics.get(obj)
        ok = r.metrics["trades"] >= vcfg["min_trades"] and score is not None and not np.isnan(score)
        if ok and (best is None or score > best[0]):
            best = (score, p, sig, r)

    grid_df = pd.DataFrame(rows)
    if best is None:
        print(f"  [注意] {name}: min_trades={vcfg['min_trades']} を満たす候補がないため既定パラメータを使用")
        p = dict(scfg.get("params") or {})
        sig = gen(df, p)
        best = (None, p, sig, run_backtest(df, sig, bt, 0, k))
    _, params, sig, train_res = best
    test_res = run_backtest(df, sig, bt, k, len(df))  # 検証期間は選んだ1セットだけで評価
    return params, train_res, test_res, grid_df


# ---------------------------------------------------------------------------
# 出力
# ---------------------------------------------------------------------------
SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
BENCH_COLOR = "#8a8984"
JP_FONTS = ["Noto Sans CJK JP", "Noto Sans JP", "IPAexGothic", "IPAGothic", "IPAPGothic",
            "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", "MS Gothic"]


def plot_equity(results: dict, path: Path, capital: float) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.ticker import FuncFormatter

    from matplotlib import font_manager

    installed = {f.name for f in font_manager.fontManager.ttflist}
    jp = [f for f in JP_FONTS if f in installed]
    if not jp:
        print("  [注意] 日本語フォントが見つからないため、グラフの日本語が文字化けする場合があります")
    plt.rcParams["font.family"] = jp[:1] + ["DejaVu Sans"]
    fig, axes = plt.subplots(2, 1, figsize=(12, 9), dpi=150)
    labels = {"train": "学習期間（パラメータ決定）", "test": "検証期間（評価）"}
    for ax, period in zip(axes, ["train", "test"]):
        ci = 0
        # 比較用ベンチマークは最後に描く（灰色の破線）
        for name, rr in sorted(results.items(), key=lambda kv: kv[0] == "fixed_time"):
            eq = rr[period].equity
            daily = eq.groupby(eq.index.normalize()).last()
            bench = name == "fixed_time"
            color = BENCH_COLOR if bench else SERIES_COLORS[ci % len(SERIES_COLORS)]
            ci += 0 if bench else 1
            ret = rr[period].metrics["total_return_pct"]
            label = f"{name}（比較用） {ret:+.1f}%" if bench else f"{name} {ret:+.1f}%"
            ax.plot(daily.index, daily.values, color=color, lw=1.6, ls="--" if bench else "-", label=label)
        ax.axhline(capital, color="#c3c2b7", lw=0.8)
        ax.set_title(labels[period], loc="left", fontsize=11, color="#0b0b0b", pad=24)
        ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v / 10000:,.0f}万円"))
        ax.grid(axis="y", color="#e8e7e2", lw=0.6)
        for s in ("top", "right"):
            ax.spines[s].set_visible(False)
        ax.spines["left"].set_color("#c3c2b7")
        ax.spines["bottom"].set_color("#c3c2b7")
        ax.tick_params(colors="#52514e", labelsize=8)
        ax.legend(frameon=False, fontsize=8, loc="lower left", bbox_to_anchor=(0, 1.0), ncol=4)
    fig.suptitle("資産推移（日次・手数料/スリッページ込み）", x=0.01, ha="left", fontsize=13)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def run(cfg: dict, only: str | None) -> None:
    df = load_ohlcv(cfg)
    if len(df) < 1000:
        sys.exit(f"データが少なすぎます（{len(df)}本）")
    k = split_index(df, cfg["validation"])
    out = resolve(cfg.get("output_dir", "results"))
    out.mkdir(parents=True, exist_ok=True)
    print(f"データ: {df.index[0]:%Y-%m-%d} 〜 {df.index[-1]:%Y-%m-%d}  {len(df)}本")
    print(f"学習: 〜 {df.index[k - 1]:%Y-%m-%d} / 検証: {df.index[k]:%Y-%m-%d} 〜")

    results, summary, chosen = {}, [], {}
    for name, scfg in cfg["strategies"].items():
        if not scfg.get("enabled", True) or (only and name != only):
            continue
        print(f"\n== {name} ==")
        params, tr, te, grid_df = evaluate_strategy(name, scfg, df, k, cfg)
        print(f"  採用パラメータ: {params}")
        results[name] = {"train": tr, "test": te}
        chosen[name] = params
        grid_df.to_csv(out / f"grid_{name}.csv", index=False)
        te.trades.to_csv(out / f"trades_{name}_test.csv", index=False)
        for period, r in (("train", tr), ("test", te)):
            summary.append({"strategy": name, "period": period, **r.metrics})

    if not results:
        sys.exit("有効な戦略がありません")
    sm = pd.DataFrame(summary)
    sm.to_csv(out / "summary.csv", index=False)
    with open(out / "chosen_params.yaml", "w", encoding="utf-8") as f:
        yaml.safe_dump(chosen, f, allow_unicode=True, sort_keys=False)
    plot_equity(results, out / "equity.png", cfg["backtest"]["initial_capital"])

    cols = ["strategy", "period", "total_pnl", "total_return_pct", "max_drawdown_pct", "win_rate_pct",
            "trades", "avg_pnl_per_trade", "avg_return_per_trade_pct", "sharpe"]
    pd.set_option("display.width", 200)
    print("\n" + sm[cols].to_string(index=False))
    print(f"\n出力: {out}/ (summary.csv, equity.png, grid_*.csv, trades_*_test.csv, chosen_params.yaml)")
    print("※ 過去の成績は将来の成績を保証しません。評価は検証期間（test）の数値で行ってください。")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["fetch", "run"])
    ap.add_argument("--config", default=str(BASE_DIR / "config.yaml"))
    ap.add_argument("--strategy", help="この戦略だけ実行")
    a = ap.parse_args()
    cfg = load_config(Path(a.config))
    fetch(cfg) if a.command == "fetch" else run(cfg, a.strategy)


if __name__ == "__main__":
    main()
