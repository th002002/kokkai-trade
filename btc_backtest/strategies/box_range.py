"""戦略D: ボックス相場の判定 + ボックス内の逆張り。

ボックスは「その足より前の lookback 本」だけで作る（その足自身も未来も使わない）。
  上限 = 直前 lookback 本の高値の最大、下限 = 同じく安値の最小、幅 = 上限 - 下限

ボックス判定（すべて満たすとき）:
  - 幅が min_width 〜 max_width（価格比）。狭すぎるとコスト負け、広すぎるとボックスではない
  - 効率比 ER = |終値の変化| / 値動きの合計 が er_max 以下（行って戻っているだけ）
  - 上限付近・下限付近にそれぞれ min_touches 回以上触れている（幅の touch_zone 以内）

売買:
  - 買い: ボックス判定中に、終値が 下限 + entry_zone*幅 以下（かつ下限より上）
  - 利確: 下限 + take_zone*幅（エントリー時点で価格を固定）
  - 損切り: 下限 - stop_buffer*幅 を割ったら（ボックス崩れ）
  - max_hold_bars 本で時間切れ決済
"""
import numpy as np
import pandas as pd
from numpy.lib.stride_tricks import sliding_window_view

from .base import Signals


def box_features(df: pd.DataFrame, params: dict) -> pd.DataFrame:
    n = int(params["lookback"])
    tz = params.get("touch_zone", 0.15)
    high, low, close = df["high"], df["low"], df["close"]

    upper = high.rolling(n, min_periods=n).max().shift(1)
    lower = low.rolling(n, min_periods=n).min().shift(1)
    width = upper - lower
    width_pct = width / ((upper + lower) / 2)

    prev_close = close.shift(1)
    path = close.diff().abs().rolling(n, min_periods=n).sum().shift(1)
    er = (prev_close - close.shift(n + 1)).abs() / path

    # 直前 n 本の各足が上限/下限の近くに触れた回数（窓 = 足 t-n..t-1）
    touches_hi = np.full(len(df), np.nan)
    touches_lo = np.full(len(df), np.nan)
    if len(df) > n:
        hw = sliding_window_view(high.to_numpy(), n)[:-1]  # 行 j = 足 j..j+n-1 → 足 j+n の判定に使う
        lw = sliding_window_view(low.to_numpy(), n)[:-1]
        up = upper.to_numpy()[n:]
        lo = lower.to_numpy()[n:]
        w = (up - lo)[:, None]
        touches_hi[n:] = (hw >= up[:, None] - tz * w).sum(axis=1)
        touches_lo[n:] = (lw <= lo[:, None] + tz * w).sum(axis=1)

    return pd.DataFrame({
        "upper": upper, "lower": lower, "width": width, "width_pct": width_pct, "er": er,
        "touches_hi": touches_hi, "touches_lo": touches_lo,
    }, index=df.index)


def is_box(f: pd.DataFrame, params: dict) -> pd.Series:
    mt = params.get("min_touches", 2)
    return (
        f["width_pct"].between(params["min_width"], params["max_width"])
        & (f["er"] <= params["er_max"])
        & (f["touches_hi"] >= mt)
        & (f["touches_lo"] >= mt)
    ).fillna(False)


def generate(df, params):
    f = box_features(df, params)
    box = is_box(f, params)
    close = df["close"]
    entry = box & (close <= f["lower"] + params["entry_zone"] * f["width"]) & (close > f["lower"])

    take_level = f["lower"] + params["take_zone"] * f["width"]
    stop_level = f["lower"] - params["stop_buffer"] * f["width"]
    return Signals(
        entry=entry.fillna(False).astype(bool),
        exit=pd.Series(False, index=df.index),
        take_dist=(take_level - close).clip(lower=0),
        stop_dist=(close - stop_level).clip(lower=0),
        max_hold_bars=params.get("max_hold_bars"),
    )
