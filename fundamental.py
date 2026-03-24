from datetime import datetime
from typing import Dict, Optional

import yfinance as yf


class FundamentalAnalysis:
    """ファンダメンタル分析クラス（v2.0）"""

    @staticmethod
    def calculate_eps_growth(info: dict) -> Optional[float]:
        """EPS成長率を計算: (forward - trailing) / |trailing| * 100"""
        trailing = info.get("epsTrailingTwelveMonths") or info.get("trailingEps")
        current = (
            info.get("epsForward")
            or info.get("epsCurrentYear")
            or info.get("forwardEps")
        )
        if trailing is None or current is None or trailing == 0:
            return None
        return round((current - trailing) / abs(trailing) * 100, 2)

    @staticmethod
    def evaluate_roe(roe: Optional[float]) -> str:
        """ROE評価（yfinance の値は小数表現: 0.15 = 15%）"""
        if roe is None:
            return "unknown"
        if roe > 0.15:
            return "excellent"
        elif roe > 0.10:
            return "good"
        elif roe > 0.05:
            return "average"
        else:
            return "poor"

    @staticmethod
    def evaluate_eps_growth(rate: Optional[float]) -> str:
        """EPS成長率評価（rate は %表現: 15.0 = 15%）"""
        if rate is None:
            return "unknown"
        if rate > 15:
            return "high_growth"
        elif rate > 5:
            return "steady_growth"
        elif rate < 0:
            return "negative"
        else:
            return "stable"

    @staticmethod
    def evaluate_operating_margin(margin: Optional[float]) -> str:
        """営業利益率評価（yfinance の値は小数表現: 0.10 = 10%）"""
        if margin is None:
            return "unknown"
        if margin > 0.10:
            return "excellent"
        elif margin > 0.05:
            return "good"
        elif margin > 0:
            return "average"
        else:
            return "poor"

    @staticmethod
    def analyze_fundamental(code: str) -> Dict:
        """全ファンダメンタル指標を統合し、スコアとシグナルを算出"""
        try:
            ticker = yf.Ticker(code)
            info = ticker.info or {}
        except Exception as e:
            print(f"DEBUG: Fundamental fetch error for {code}: {e}")
            info = {}

        # デバッグ用ログ
        print(f"DEBUG: [{code}] info keys: {list(info.keys()) if info else 'EMPTY'}")

        name = info.get("longName") or info.get("shortName") or code

        # ─── 既存指標 ───
        per = info.get("trailingPE") or info.get("forwardPE")
        dividend_yield = info.get("dividendYield")
        print(f"DEBUG: per={per}, div={dividend_yield}")

        if dividend_yield:
            if dividend_yield < 1.0:
                dividend_yield = round(dividend_yield * 100, 2)
            else:
                dividend_yield = round(dividend_yield, 2)

        # 年初来パフォーマンス計算
        ytd_performance = None
        try:
            hist_ytd = ticker.history(start=f"{datetime.now().year}-01-01")
            if len(hist_ytd) >= 2:
                year_start = float(hist_ytd["Close"].iloc[0])
                current_price = float(hist_ytd["Close"].iloc[-1])
                ytd_performance = round(
                    (current_price - year_start) / year_start * 100, 2
                )
            print(f"DEBUG: ytd={ytd_performance}")
        except Exception as e:
            print(f"DEBUG: YTD calculation error: {e}")

        # ─── 新規指標 ───
        roe = info.get("returnOnEquity")
        operating_margin = info.get("operatingMargins")
        print(f"DEBUG: roe={roe}, om={operating_margin}")
        
        eps_growth = FundamentalAnalysis.calculate_eps_growth(info)
        print(f"DEBUG: eps_growth={eps_growth}")

        # 評価
        roe_eval = FundamentalAnalysis.evaluate_roe(roe)
        eps_growth_eval = FundamentalAnalysis.evaluate_eps_growth(eps_growth)
        op_margin_eval = FundamentalAnalysis.evaluate_operating_margin(operating_margin)

        # ─── ポイント集計 ───
        # PER（最大 +2、最小 -1）
        points = 0
        if per is not None:
            if per < 15:
                points += 2
            elif per < 25:
                points += 1
            elif per > 35:
                points -= 1

        # 配当利回り（+1）
        if dividend_yield is not None and dividend_yield > 1.5:
            points += 1

        # 年初来パフォーマンス（最大 +2、最小 -1）
        if ytd_performance is not None:
            if ytd_performance > 5:
                points += 2
            elif ytd_performance > 0:
                points += 1
            else:
                points -= 1

        # ROE（最大 +2、最小 -1）
        if roe_eval == "excellent":
            points += 2
        elif roe_eval == "good":
            points += 1
        elif roe_eval == "poor":
            points -= 1

        # EPS成長率（最大 +2、最小 -1）
        if eps_growth_eval == "high_growth":
            points += 2
        elif eps_growth_eval == "steady_growth":
            points += 1
        elif eps_growth_eval == "negative":
            points -= 1

        # 営業利益率（最大 +2、最小 -1）
        if op_margin_eval == "excellent":
            points += 2
        elif op_margin_eval == "good":
            points += 1
        elif op_margin_eval == "poor":
            points -= 1

        # スコア正規化（理論範囲: -6〜+11 → 0〜100）
        score = max(0.0, min(100.0, (points + 6) / 17 * 100))

        # シグナル判定
        if score >= 75:
            signal = "strong_positive"
        elif score >= 60:
            signal = "positive"
        elif score >= 40:
            signal = "neutral"
        elif score >= 25:
            signal = "negative"
        else:
            signal = "strong_negative"

        return {
            "name": name,
            "per": round(per, 2) if per is not None else None,
            "dividend_yield": dividend_yield,
            "ytd_performance": ytd_performance,
            "roe": roe,
            "roe_eval": roe_eval,
            "eps_growth": eps_growth,
            "eps_growth_eval": eps_growth_eval,
            "operating_margin": operating_margin,
            "operating_margin_eval": op_margin_eval,
            "score": round(score, 2),
            "signal": signal,
        }
