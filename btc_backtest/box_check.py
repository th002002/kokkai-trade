"""ボックス判定に予測力があるかを確かめる集計（売買はしない）。

各足 t で、判定に使った箱（直前 lookback 本の上限・下限）について、
その後 horizon 本の間に価格が「箱 ± 幅の10%」の中に収まっていた割合を比べる。
  - ボックス判定あり
  - 判定なし（ただし幅の条件は同じ足 = 比較対象）
判定ありの方が明らかに高くなければ、判定には意味がない。

使い方: python box_check.py [--lookback 32] [--horizon 16]
"""
import argparse

import numpy as np
import pandas as pd

import backtest as B
from strategies.box_range import box_features, is_box


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lookback", type=int)
    ap.add_argument("--horizon", type=int)
    a = ap.parse_args()

    cfg = B.load_config(B.BASE_DIR / "config.yaml")
    params = dict(cfg["strategies"]["box_range"]["params"])
    if a.lookback:
        params["lookback"] = a.lookback
    h = a.horizon or params["lookback"] // 2

    df = B.load_ohlcv(cfg)
    k = B.split_index(df, cfg["validation"])
    f = box_features(df, params)
    box = is_box(f, params)
    width_ok = f["width_pct"].between(params["min_width"], params["max_width"])

    # 足 t から t+h-1 までの高値の最大・安値の最小（ここは「答え合わせ」なので未来を使ってよい）
    fut_hi = df["high"][::-1].rolling(h, min_periods=h).max()[::-1]
    fut_lo = df["low"][::-1].rolling(h, min_periods=h).min()[::-1]
    buf = 0.1 * f["width"]
    stay = (fut_hi <= f["upper"] + buf) & (fut_lo >= f["lower"] - buf)
    broke_down = fut_lo < f["lower"] - buf
    valid = fut_hi.notna() & f["width"].notna()

    print(f"判定パラメータ: lookback={params['lookback']}本, er_max={params['er_max']}, "
          f"幅 {params['min_width']:.1%}〜{params['max_width']:.1%}, 予測期間 {h}本")
    rows = []
    for period, sl in (("学習", slice(0, k)), ("検証", slice(k, len(df)))):
        for label, m in (("ボックス判定あり", box), ("判定なし(幅は同条件)", width_ok & ~box)):
            mm = (m & valid).iloc[sl]
            rows.append({
                "期間": period, "グループ": label, "足の数": int(mm.sum()),
                "箱に収まった割合%": round(stay.iloc[sl][mm].mean() * 100, 1),
                "下に抜けた割合%": round(broke_down.iloc[sl][mm].mean() * 100, 1),
            })
    print(pd.DataFrame(rows).to_string(index=False))


if __name__ == "__main__":
    main()
