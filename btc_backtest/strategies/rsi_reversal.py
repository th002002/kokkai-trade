"""戦略A: RSI 逆張り。

買い: RSI <= entry_level
決済: RSI >= exit_level、または max_hold_bars 本保有
"""
from .base import Signals, rsi, to_bool


def generate(df, params):
    r = rsi(df["close"], int(params["period"]))
    return Signals(
        entry=to_bool(r <= params["entry_level"]),
        exit=to_bool(r >= params["exit_level"]),
        max_hold_bars=params.get("max_hold_bars"),
    )
