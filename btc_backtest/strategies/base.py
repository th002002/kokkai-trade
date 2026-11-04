"""戦略の共通インターフェースとインジケータ。

戦略モジュールは `generate(df, params) -> Signals` を1つ定義するだけでよい。

- df: JST の DatetimeIndex を持つ OHLCV（open, high, low, close, volume）
- 各シグナルは「その足の終値が確定した時点」で判定したものとする。
  エンジンは必ず「次の足の始値」で約定させる（ルックアヘッド防止）。
- インジケータは過去方向のみ（rolling / ewm）で計算すること。
  未来の値を参照する処理（shift(-1)、center=True など）は禁止。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd


@dataclass
class Signals:
    entry: pd.Series                      # bool: 次の足の始値で買う
    exit: pd.Series                       # bool: 次の足の始値で売る
    stop_dist: Optional[pd.Series] = None  # 円: 約定価格 - この幅 で損切り（シグナル足の値で固定）
    take_dist: Optional[pd.Series] = None  # 円: 約定価格 + この幅 で利確（同上）
    max_hold_bars: Optional[int] = None   # この本数保有したら次の足の始値で決済


def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=n).mean()


def rsi(close: pd.Series, n: int) -> pd.Series:
    """Wilder の RSI。"""
    diff = close.diff()
    up = diff.clip(lower=0).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    down = (-diff.clip(upper=0)).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    rs = up / down.replace(0, np.nan)
    out = 100 - 100 / (1 + rs)
    return out.where(down != 0, 100.0).where(up.notna())


def atr(df: pd.DataFrame, n: int) -> pd.Series:
    prev_close = df["close"].shift(1)
    tr = pd.concat(
        [df["high"] - df["low"], (df["high"] - prev_close).abs(), (df["low"] - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()


def to_bool(s: pd.Series) -> pd.Series:
    return s.fillna(False).astype(bool)
