"""戦略C: 移動平均クロス + ATR の損切り・利確。

買い: 短期SMAが長期SMAを上抜け（ゴールデンクロス）
決済: デッドクロス、または 約定価格 - stop_atr*ATR で損切り / + take_atr*ATR で利確
ATR はシグナル足の値を使い、エントリー時点で幅を固定する。
"""
from .base import Signals, atr, sma, to_bool


def generate(df, params):
    fast = sma(df["close"], int(params["fast"]))
    slow = sma(df["close"], int(params["slow"]))
    above = fast > slow
    prev_above = above.shift(1, fill_value=False)
    valid = fast.notna() & slow.notna() & fast.shift(1).notna() & slow.shift(1).notna()

    a = atr(df, int(params["atr_period"]))
    return Signals(
        entry=to_bool(valid & above & ~prev_above),
        exit=to_bool(valid & ~above & prev_above),
        stop_dist=a * params["stop_atr"],
        take_dist=a * params["take_atr"],
    )
