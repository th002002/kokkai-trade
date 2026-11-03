"""比較用ベンチマーク: 毎日同じ時刻に買い、同じ時刻に決済する。

entry_time の足の始値で買い、exit_time の足の始値で売る。
exit_time が強制決済時刻（23:45）以降なら、エンジンの強制決済（23:45足の終値）で手仕舞う。
シグナルは「約定させたい足の1本前」に立てる。
"""
import pandas as pd

from .base import Signals


def _bar_before(df, hhmm: str) -> pd.Series:
    """次の足が hhmm に始まる足 = True。"""
    target = pd.Timestamp(f"2000-01-01 {hhmm}")
    nxt = df.index.to_series().shift(-1)  # 足の時刻（予定表）を見るだけで価格は見ない
    return (nxt.dt.hour == target.hour) & (nxt.dt.minute == target.minute) & (nxt.dt.date == df.index.date)


def generate(df, params):
    return Signals(
        entry=_bar_before(df, params["entry_time"]).fillna(False),
        exit=_bar_before(df, params["exit_time"]).fillna(False),
    )
