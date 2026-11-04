"""戦略B: ボリンジャーバンド逆張り。

買い: 足の安値が -num_std σ に触れた（low <= 下限バンド）
利確: 終値が中心線（移動平均）以上
任意: stop_loss_pct を指定すると、約定価格からその割合下で損切り
"""
from .base import Signals, sma, to_bool


def generate(df, params):
    n = int(params["period"])
    mid = sma(df["close"], n)
    std = df["close"].rolling(n, min_periods=n).std(ddof=0)
    lower = mid - params["num_std"] * std

    stop = params.get("stop_loss_pct")
    return Signals(
        entry=to_bool(df["low"] <= lower),
        exit=to_bool(df["close"] >= mid),
        stop_dist=(df["close"] * stop) if stop else None,
        max_hold_bars=params.get("max_hold_bars"),
    )
