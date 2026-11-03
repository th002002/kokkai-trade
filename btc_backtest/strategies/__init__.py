"""戦略は config.yaml の strategies のキー名 = このパッケージ内のモジュール名で読み込む。

新しい戦略を足すには strategies/my_strategy.py に generate(df, params) を書き、
config.yaml の strategies に my_strategy を追加するだけでよい。
"""
import importlib

from .base import Signals


def load(name: str):
    module = importlib.import_module(f"{__name__}.{name}")
    if not hasattr(module, "generate"):
        raise AttributeError(f"strategies/{name}.py に generate(df, params) がありません")
    return module.generate


__all__ = ["Signals", "load"]
