import math
from typing import List, Dict, Optional


def _ema_list(prices: List[float], period: int) -> List[float]:
    """指数移動平均（EMA）リストを計算（内部用）"""
    if not prices:
        return []
    k = 2.0 / (period + 1)
    emas = [prices[0]]
    for price in prices[1:]:
        emas.append(price * k + emas[-1] * (1 - k))
    return emas


class TechnicalIndicators:
    """テクニカル指標計算クラス（v2.0）"""

    @staticmethod
    def sma(prices: List[float], period: int) -> Optional[float]:
        """単純移動平均（SMA）を計算"""
        if len(prices) < period:
            return None
        return sum(prices[-period:]) / period

    @staticmethod
    def rsi(prices: List[float], period: int = 14) -> Optional[float]:
        """RSI（相対強度指数）を計算 - Wilder's smoothing"""
        if len(prices) < period + 1:
            return None
        gains, losses = [], []
        for i in range(1, len(prices)):
            change = prices[i] - prices[i - 1]
            gains.append(change if change > 0 else 0.0)
            losses.append(-change if change < 0 else 0.0)
        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period
        for i in range(period, len(gains)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            return 100.0
        return 100.0 - (100.0 / (1 + avg_gain / avg_loss))

    @staticmethod
    def macd(prices: List[float]) -> Dict:
        """MACD（移動平均収束発散）を計算"""
        ema12 = _ema_list(prices, 12)
        ema26 = _ema_list(prices, 26)
        if len(ema12) < 26 or len(ema26) < 26:
            return {"line": None, "signal": None, "histogram": None}
        macd_line = [e12 - e26 for e12, e26 in zip(ema12, ema26)]
        signal_line = _ema_list(macd_line, 9)
        histogram = macd_line[-1] - signal_line[-1]
        return {
            "line": round(macd_line[-1], 4),
            "signal": round(signal_line[-1], 4),
            "histogram": round(histogram, 4),
        }

    @staticmethod
    def atr(high: List[float], low: List[float], close: List[float], period: int = 14) -> Dict:
        """ATR（Average True Range）を計算"""
        if len(high) < period + 1 or len(close) < period + 1:
            return {"atr": None, "atr_avg": None, "signal": "normal"}

        # True Range 計算
        true_ranges = []
        for i in range(1, len(close)):
            h, l, c_prev = high[i], low[i], close[i - 1]
            tr = max(h - l, abs(h - c_prev), abs(l - c_prev))
            true_ranges.append(tr)

        if len(true_ranges) < period:
            return {"atr": None, "atr_avg": None, "signal": "normal"}

        # ATR初期値（最初のperiod個の平均）
        atr_val = sum(true_ranges[:period]) / period
        # Wilder's smoothing
        k = 1.0 / period
        for tr in true_ranges[period:]:
            atr_val = atr_val * (1 - k) + tr * k

        # 直近period個のTRの平均（比較用）
        atr_avg = sum(true_ranges[-period:]) / period

        # シグナル判定
        if atr_val > atr_avg * 1.5:
            signal = "high_volatility"
        elif atr_val < atr_avg * 0.5:
            signal = "low_volatility"
        else:
            signal = "normal"

        return {
            "atr": round(atr_val, 4),
            "atr_avg": round(atr_avg, 4),
            "signal": signal,
        }

    @staticmethod
    def bollinger_bands(prices: List[float], period: int = 20, std_dev: int = 2) -> Dict:
        """Bollinger Bands を計算"""
        if len(prices) < period:
            return {"upper": None, "middle": None, "lower": None, "width": None, "signal": "neutral"}

        recent = prices[-period:]
        middle = sum(recent) / period
        variance = sum((p - middle) ** 2 for p in recent) / period
        std = math.sqrt(variance)
        upper = middle + std_dev * std
        lower = middle - std_dev * std
        current = prices[-1]

        # シグナル判定
        if current > upper:
            signal = "overbought"
        elif current < lower:
            signal = "oversold"
        else:
            signal = "neutral"

        return {
            "upper": round(upper, 4),
            "middle": round(middle, 4),
            "lower": round(lower, 4),
            "width": round(upper - lower, 4),
            "signal": signal,
        }

    @staticmethod
    def ichimoku(high: List[float], low: List[float], close: List[float]) -> Dict:
        """一目均衡表を計算"""
        _empty = {
            "conversion_line": None, "base_line": None,
            "leading_span_a": None, "leading_span_b": None,
            "lagging_span": None, "cloud_top": None, "cloud_bottom": None,
            "signal": "neutral",
        }
        if len(high) < 52 or len(low) < 52 or len(close) < 52:
            return _empty

        # 転換線（9日）
        conversion = (max(high[-9:]) + min(low[-9:])) / 2
        # 基準線（26日）
        base = (max(high[-26:]) + min(low[-26:])) / 2
        # 先行スパンA
        leading_a = (conversion + base) / 2
        # 先行スパンB（52日）
        leading_b = (max(high[-52:]) + min(low[-52:])) / 2
        # 遅行スパン（26営業日前の終値）
        lagging = close[-26]

        cloud_top = max(leading_a, leading_b)
        cloud_bottom = min(leading_a, leading_b)
        current = close[-1]

        # シグナル判定: 現在値と雲の位置関係
        if current > cloud_top:
            signal = "bullish"
        elif current < cloud_bottom:
            signal = "bearish"
        else:
            signal = "neutral"

        return {
            "conversion_line": round(conversion, 4),
            "base_line": round(base, 4),
            "leading_span_a": round(leading_a, 4),
            "leading_span_b": round(leading_b, 4),
            "lagging_span": round(lagging, 4),
            "cloud_top": round(cloud_top, 4),
            "cloud_bottom": round(cloud_bottom, 4),
            "signal": signal,
        }

    @staticmethod
    def analyze_technical(
        prices: List[float], high: List[float], low: List[float]
    ) -> Dict:
        """全テクニカル指標を統合し、スコアとシグナルを算出"""
        ti = TechnicalIndicators

        current = prices[-1] if prices else None
        sma_20 = ti.sma(prices, 20)
        sma_50 = ti.sma(prices, 50)
        rsi_14 = ti.rsi(prices, 14)
        macd_data = ti.macd(prices)
        atr_data = ti.atr(high, low, prices, 14)
        bb_data = ti.bollinger_bands(prices, 20, 2)
        ichi_data = ti.ichimoku(high, low, prices)

        # ポイント集計（範囲: -10〜+10）
        points = 0

        # SMA トレンド（±2）
        if sma_20 and sma_50 and current:
            if current > sma_20 > sma_50:
                points += 2
            elif current < sma_20 < sma_50:
                points -= 2

        # RSI（±2 強い、±1 弱い）
        if rsi_14 is not None:
            if rsi_14 < 30:
                points += 2      # 売られすぎ → 反発期待
            elif rsi_14 > 70:
                points -= 2      # 買われすぎ → 反落期待
            elif rsi_14 < 45:
                points += 1
            elif rsi_14 > 55:
                points -= 1

        # MACD ヒストグラム（±2）
        hist = macd_data.get("histogram")
        if hist is not None:
            points += 2 if hist > 0 else -2

        # Bollinger Bands（±2）
        bb_sig = bb_data.get("signal", "neutral")
        if bb_sig == "oversold":
            points += 2
        elif bb_sig == "overbought":
            points -= 2

        # 一目均衡表（±2）
        ichi_sig = ichi_data.get("signal", "neutral")
        if ichi_sig == "bullish":
            points += 2
        elif ichi_sig == "bearish":
            points -= 2

        # スコア正規化: -10〜+10 → 0〜100
        score = max(0.0, min(100.0, (points + 10) / 20 * 100))

        # シグナル判定
        if score >= 75:
            signal = "strong_buy"
        elif score >= 60:
            signal = "buy"
        elif score >= 40:
            signal = "neutral"
        elif score >= 25:
            signal = "sell"
        else:
            signal = "strong_sell"

        return {
            "sma_20": round(sma_20, 2) if sma_20 is not None else None,
            "sma_50": round(sma_50, 2) if sma_50 is not None else None,
            "rsi_14": round(rsi_14, 2) if rsi_14 is not None else None,
            "macd": macd_data,
            "atr": atr_data,
            "bollinger_bands": bb_data,
            "ichimoku": ichi_data,
            "score": round(score, 2),
            "signal": signal,
        }
