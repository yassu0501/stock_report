"""
Stock Report v2.5 - レポート生成モジュール
テクニカル・ファンダメンタル分析結果を日本語レポートに変換する
"""

from typing import Optional


class ReportGenerator:
    """レポート生成クラス - 指標データを日本語テキスト・構造化データに変換"""

    @staticmethod
    def generate_technical_summary(technical_analysis: dict, current_price: Optional[float] = None) -> str:
        """
        テクニカル分析を日本語サマリーに変換

        入力: technical_analysis（v2.0 のテクニカル分析結果）、current_price（現在値）
        出力: 日本語 3-4 行のサマリー文字列
        """
        lines = []

        sma_20 = technical_analysis.get("sma_20")
        sma_50 = technical_analysis.get("sma_50")
        rsi_14 = technical_analysis.get("rsi_14")
        macd = technical_analysis.get("macd") or {}
        atr = technical_analysis.get("atr") or {}
        bb = technical_analysis.get("bollinger_bands") or {}
        ichimoku = technical_analysis.get("ichimoku") or {}

        # SMA トレンド判定
        if current_price and sma_20 and sma_50:
            if current_price > sma_20 > sma_50:
                lines.append(f"現在値が SMA20（¥{sma_20:,.0f}）> SMA50（¥{sma_50:,.0f}）で上昇トレンド継続中。")
            elif current_price < sma_20 < sma_50:
                lines.append(f"現在値が SMA20（¥{sma_20:,.0f}）< SMA50（¥{sma_50:,.0f}）で下降トレンド継続中。")
            elif sma_20 and sma_50:
                lines.append(f"SMA20（¥{sma_20:,.0f}）と SMA50（¥{sma_50:,.0f}）付近で推移中。方向感を確認中。")
        elif sma_20 and sma_50:
            if sma_20 > sma_50:
                lines.append(f"SMA20（¥{sma_20:,.0f}）> SMA50（¥{sma_50:,.0f}）で中期的な上昇トレンドの可能性。")
            else:
                lines.append(f"SMA20（¥{sma_20:,.0f}）< SMA50（¥{sma_50:,.0f}）で中期的な下降トレンドの可能性。")

        # RSI 判定
        if rsi_14 is not None:
            if rsi_14 < 30:
                lines.append(f"RSI {rsi_14:.1f} と売られすぎ水準にあり、反発の可能性がある。")
            elif rsi_14 > 70:
                lines.append(f"RSI {rsi_14:.1f} と買われすぎ水準にあり、過熱感に注意が必要。")
            elif rsi_14 < 45:
                lines.append(f"RSI {rsi_14:.1f} とやや弱め。押し目買い検討の水準。")
            elif rsi_14 > 55:
                lines.append(f"RSI {rsi_14:.1f} とやや強め。上昇モメンタムが継続中。")

        # MACD 判定
        histogram = macd.get("histogram")
        if histogram is not None:
            if histogram > 0:
                lines.append(f"MACD ヒストグラムがプラス（{histogram:.4f}）で上昇モメンタム継続中。")
            else:
                lines.append(f"MACD ヒストグラムがマイナス（{histogram:.4f}）で下降圧力あり。")

        # ATR ボラティリティ判定
        atr_signal = atr.get("signal", "normal")
        atr_val = atr.get("atr")
        if atr_val is not None:
            if atr_signal == "high_volatility":
                lines.append(f"ATR {atr_val:.1f} と値動きが大きく、ボラティリティ高め。トレード時の注意が必要。")
            elif atr_signal == "low_volatility":
                lines.append(f"ATR {atr_val:.1f} と値動きが小さく、ブレイクアウト待ちの推定。")

        # Bollinger Bands 判定
        bb_signal = bb.get("signal", "neutral")
        bb_upper = bb.get("upper")
        bb_lower = bb.get("lower")
        if bb_signal == "oversold" and bb_lower is not None:
            lines.append(f"Bollinger Bands の下限（¥{bb_lower:,.0f}）付近で売られすぎ。反発の可能性がある。")
        elif bb_signal == "overbought" and bb_upper is not None:
            lines.append(f"Bollinger Bands の上限（¥{bb_upper:,.0f}）付近で買われすぎ。反落に注意。")

        # 一目均衡表 判定
        ichi_signal = ichimoku.get("signal", "neutral")
        cloud_top = ichimoku.get("cloud_top")
        cloud_bottom = ichimoku.get("cloud_bottom")
        if ichi_signal == "bullish" and cloud_top is not None:
            lines.append(f"一目均衡表では雲の上（雲上限: ¥{cloud_top:,.0f}）で堅調。テクニカルは強気。")
        elif ichi_signal == "bearish" and cloud_bottom is not None:
            lines.append(f"一目均衡表では雲の下（雲下限: ¥{cloud_bottom:,.0f}）で弱気。反転サインを確認してから判断を。")
        elif ichi_signal == "neutral":
            lines.append("一目均衡表では雲の中にあり、方向感が定まっていない推定。")

        if not lines:
            return "テクニカル指標のデータが不足しているため、判定できません。"

        return "\n".join(lines)

    @staticmethod
    def generate_fundamental_summary(fundamental_analysis: dict) -> str:
        """
        ファンダメンタル分析を日本語サマリーに変換

        入力: fundamental_analysis（v2.0 のファンダメンタル分析結果）
        出力: 日本語 3-4 行のサマリー文字列
        """
        lines = []

        per = fundamental_analysis.get("per")
        roe = fundamental_analysis.get("roe")
        roe_eval = fundamental_analysis.get("roe_eval", "unknown")
        eps_growth = fundamental_analysis.get("eps_growth")
        eps_growth_eval = fundamental_analysis.get("eps_growth_eval", "unknown")
        operating_margin = fundamental_analysis.get("operating_margin")
        operating_margin_eval = fundamental_analysis.get("operating_margin_eval", "unknown")
        dividend_yield = fundamental_analysis.get("dividend_yield")
        ytd_performance = fundamental_analysis.get("ytd_performance")

        # PER 評価
        if per is not None:
            if per < 15:
                lines.append(f"PER {per:.1f} 倍と割安水準。バリュー投資の観点から魅力的な水準。")
            elif per < 25:
                lines.append(f"PER {per:.1f} 倍と適正水準。市場平均に近い評価。")
            else:
                lines.append(f"PER {per:.1f} 倍とやや割高。成長への期待が織り込まれている可能性。")

        # ROE 評価
        if roe is not None:
            roe_pct = roe * 100
            if roe_eval == "excellent":
                lines.append(f"ROE {roe_pct:.1f}% と高く、経営効率は優秀。自己資本を有効活用している。")
            elif roe_eval == "good":
                lines.append(f"ROE {roe_pct:.1f}% と良好な経営効率。安定した資本収益力を持つ。")
            elif roe_eval == "poor":
                lines.append(f"ROE {roe_pct:.1f}% と資本効率が低い。経営改善に期待がかかる。")
            else:
                lines.append(f"ROE {roe_pct:.1f}% と平均的な水準。")

        # EPS 成長率
        if eps_growth is not None:
            if eps_growth_eval == "high_growth":
                lines.append(f"EPS 成長率 {eps_growth:.1f}% と高成長企業。利益拡大が続いている推定。")
            elif eps_growth_eval == "steady_growth":
                lines.append(f"EPS 成長率 {eps_growth:.1f}% と安定成長。堅実な業績拡大が見込まれる。")
            elif eps_growth_eval == "negative":
                lines.append(f"EPS 成長率 {eps_growth:.1f}% とマイナス成長。業績の回復を確認してから判断が賢明。")

        # 営業利益率
        if operating_margin is not None:
            margin_pct = operating_margin * 100
            if operating_margin_eval == "excellent":
                lines.append(f"営業利益率 {margin_pct:.1f}% と高い収益性。本業の競争力が強い。")
            elif operating_margin_eval == "poor":
                lines.append(f"営業利益率 {margin_pct:.1f}% と本業の効率に課題あり。改善動向を注視。")

        # 配当利回り
        if dividend_yield is not None and dividend_yield > 0:
            lines.append(f"配当利回り {dividend_yield:.1f}% と{('高め。インカムゲインも期待できる。' if dividend_yield > 2.5 else '配当あり。')}")

        # 年初来パフォーマンス
        if ytd_performance is not None:
            if ytd_performance > 10:
                lines.append(f"年初来パフォーマンス +{ytd_performance:.1f}% と好調。勢いが続くか注目。")
            elif ytd_performance < -10:
                lines.append(f"年初来パフォーマンス {ytd_performance:.1f}% と軟調。底打ち確認が重要。")

        # 複合判定（末尾に総合コメント追加）
        is_per_cheap = per is not None and per < 15
        is_roe_excellent = roe_eval == "excellent"
        is_high_growth = eps_growth_eval == "high_growth"
        is_roe_poor = roe_eval == "poor"
        is_margin_poor = operating_margin_eval == "poor"

        if is_per_cheap and is_roe_excellent and is_high_growth:
            lines.append("割安・高ROE・高成長が揃っており、全体的に買い好機と言える水準。")
        elif is_roe_poor and is_margin_poor:
            lines.append("ROE・営業利益率ともに低く、長期保有には向きにくい状況。業績改善を待つべきかもしれない。")

        if not lines:
            return "ファンダメンタル指標のデータが不足しているため、判定できません。"

        return "\n".join(lines)

    @staticmethod
    def generate_buy_reasons(
        technical_analysis: dict,
        fundamental_analysis: dict,
        current_price: Optional[float] = None,
    ) -> list:
        """
        買い理由をリスト化

        出力形式: [{"indicator": "...", "detail": "..."}, ...]
        """
        reasons = []

        sma_20 = technical_analysis.get("sma_20")
        sma_50 = technical_analysis.get("sma_50")
        rsi_14 = technical_analysis.get("rsi_14")
        macd = technical_analysis.get("macd") or {}
        atr = technical_analysis.get("atr") or {}
        bb = technical_analysis.get("bollinger_bands") or {}
        ichimoku = technical_analysis.get("ichimoku") or {}

        per = fundamental_analysis.get("per")
        roe_eval = fundamental_analysis.get("roe_eval", "unknown")
        eps_growth_eval = fundamental_analysis.get("eps_growth_eval", "unknown")

        # SMA 上昇トレンド
        if current_price and sma_20 and sma_50:
            if current_price > sma_20 > sma_50:
                reasons.append({
                    "indicator": "SMA（20/50）",
                    "detail": f"現在値（¥{current_price:,.0f}）> SMA20（¥{sma_20:,.0f}）> SMA50（¥{sma_50:,.0f}）で強い上昇トレンド。",
                })

        # MACD 上昇モメンタム
        histogram = macd.get("histogram")
        if histogram is not None and histogram > 0:
            macd_line = macd.get("line")
            reasons.append({
                "indicator": "MACD",
                "detail": f"MACD ヒストグラム +{histogram:.4f} でプラス。上昇モメンタムが継続中。",
            })

        # RSI 売られすぎ
        if rsi_14 is not None and rsi_14 < 30:
            reasons.append({
                "indicator": "RSI（14）",
                "detail": f"RSI {rsi_14:.1f} と売られすぎ水準（30以下）。反発の可能性がある。",
            })

        # ATR ブレイクアウト可能性
        atr_val = atr.get("atr")
        atr_avg = atr.get("atr_avg")
        if atr_val and atr_avg and atr_val > atr_avg * 1.5:
            reasons.append({
                "indicator": "ATR（ボラティリティ）",
                "detail": f"ATR {atr_val:.1f} が平均（{atr_avg:.1f}）の 1.5 倍超。ブレイクアウトの可能性がある。",
            })

        # Bollinger Bands 売られすぎ
        bb_signal = bb.get("signal", "neutral")
        bb_lower = bb.get("lower")
        if bb_signal == "oversold" and bb_lower is not None:
            reasons.append({
                "indicator": "Bollinger Bands",
                "detail": f"現在値がバンド下限（¥{bb_lower:,.0f}）を下回り売られすぎ。平均回帰による反発を期待できる。",
            })

        # 一目均衡表 雲の上
        ichi_signal = ichimoku.get("signal", "neutral")
        cloud_top = ichimoku.get("cloud_top")
        if ichi_signal == "bullish" and cloud_top is not None:
            reasons.append({
                "indicator": "一目均衡表",
                "detail": f"現在値が雲の上（雲上限: ¥{cloud_top:,.0f}）にあり、強気トレンド継続中。",
            })

        # ROE 優秀
        if roe_eval == "excellent":
            roe = fundamental_analysis.get("roe")
            roe_pct = roe * 100 if roe else 0
            reasons.append({
                "indicator": "ROE",
                "detail": f"ROE {roe_pct:.1f}% と優秀。自己資本を効率よく活用しており、経営力が高い。",
            })

        # PER 割安
        if per is not None and per < 15:
            reasons.append({
                "indicator": "PER（バリュエーション）",
                "detail": f"PER {per:.1f} 倍と割安水準。市場に低く評価されている可能性があり、割安株として注目できる。",
            })

        # EPS 高成長
        if eps_growth_eval == "high_growth":
            eps_growth = fundamental_analysis.get("eps_growth")
            reasons.append({
                "indicator": "EPS 成長率",
                "detail": f"EPS 成長率 {eps_growth:.1f}% と高成長。利益拡大トレンドが続いている推定。",
            })

        return reasons

    @staticmethod
    def generate_sell_warnings(technical_analysis: dict, fundamental_analysis: dict) -> list:
        """
        売り警告をリスト化

        出力形式: [{"indicator": "...", "detail": "..."}, ...]
        """
        warnings = []

        rsi_14 = technical_analysis.get("rsi_14")
        bb = technical_analysis.get("bollinger_bands") or {}
        ichimoku = technical_analysis.get("ichimoku") or {}

        roe_eval = fundamental_analysis.get("roe_eval", "unknown")
        operating_margin_eval = fundamental_analysis.get("operating_margin_eval", "unknown")
        operating_margin = fundamental_analysis.get("operating_margin")

        # RSI 買われすぎ
        if rsi_14 is not None and rsi_14 > 70:
            warnings.append({
                "indicator": "RSI（14）",
                "detail": f"RSI {rsi_14:.1f} と買われすぎ水準（70以上）。過熱感から調整が入る可能性がある。",
            })

        # Bollinger Bands 買われすぎ
        bb_signal = bb.get("signal", "neutral")
        bb_upper = bb.get("upper")
        if bb_signal == "overbought" and bb_upper is not None:
            warnings.append({
                "indicator": "Bollinger Bands",
                "detail": f"現在値がバンド上限（¥{bb_upper:,.0f}）を上回り買われすぎ。反落リスクあり。",
            })

        # 一目均衡表 雲の下
        ichi_signal = ichimoku.get("signal", "neutral")
        cloud_bottom = ichimoku.get("cloud_bottom")
        if ichi_signal == "bearish" and cloud_bottom is not None:
            warnings.append({
                "indicator": "一目均衡表",
                "detail": f"現在値が雲の下（雲下限: ¥{cloud_bottom:,.0f}）にあり、弱気トレンド継続中。底打ち確認が必要。",
            })

        # ROE 低い
        if roe_eval == "poor":
            roe = fundamental_analysis.get("roe")
            roe_pct = roe * 100 if roe else 0
            warnings.append({
                "indicator": "ROE（資本効率）",
                "detail": f"ROE {roe_pct:.1f}% と資本効率が低い。自己資本の有効活用に課題がある可能性。",
            })

        # 営業利益率 低い
        if operating_margin_eval == "poor" and operating_margin is not None:
            margin_pct = operating_margin * 100
            warnings.append({
                "indicator": "営業利益率",
                "detail": f"営業利益率 {margin_pct:.1f}% と低め。本業の収益力に課題があり、経営効率の改善が期待される。",
            })

        return warnings

    @staticmethod
    def calculate_risk_reward(
        current_price: float,
        high_price: float,
        low_price_52w: float,
        atr: Optional[float],
        sma_50: Optional[float],
        sma_20: Optional[float],
    ) -> dict:
        """
        リスク・リワード比率を計算

        出力形式:
        {
            "reward_target": float,
            "reward_percentage": float,
            "stop_loss": float,
            "risk_percentage": float,
            "risk_reward_ratio": float or None,
            "evaluation": str
        }
        """
        try:
            # リワード目標: SMA50 と 直近高値の 105% の大きい方
            candidates = [high_price * 1.05]
            if sma_50 is not None:
                candidates.append(sma_50)
            reward_raw = max(candidates)
            # 心理的節目（100円単位）に丸める
            reward_target = round(reward_raw / 100) * 100
            # 現在値より低くなった場合は切り上げ
            if reward_target <= current_price:
                reward_target = (int(reward_raw / 100) + 1) * 100

            reward_percentage = round((reward_target - current_price) / current_price * 100, 2)

            # ストップロス: max(SMA20 - ATR, 52週安値)
            # ただし現在値より必ず下になるよう cap する
            if sma_20 is not None and atr is not None:
                stop_loss_raw = max(sma_20 - atr, low_price_52w)
            else:
                stop_loss_raw = low_price_52w
            # 現在値より高くなってしまう場合は ATR 2 本分下を使う
            if stop_loss_raw >= current_price:
                fallback_atr = atr if atr is not None else current_price * 0.03
                stop_loss_raw = current_price - fallback_atr * 2
            stop_loss = round(stop_loss_raw, 0)

            risk_percentage = round((stop_loss - current_price) / current_price * 100, 2)

            # リスク・リワード比率
            if risk_percentage != 0:
                ratio = round(abs(reward_percentage) / abs(risk_percentage), 2)
            else:
                ratio = None

            # 評価
            if ratio is None:
                evaluation = "リスク・リワード比率を計算できません"
            elif ratio >= 2.0:
                evaluation = "優秀なリスク・リワード比。積極的なエントリーを検討できる水準。"
            elif ratio >= 1.5:
                evaluation = "良好なリスク・リワード比。リワードがリスクを上回っている。"
            elif ratio >= 1.0:
                evaluation = "許容範囲のリスク・リワード比。ただし慎重な判断を。"
            else:
                evaluation = "リスクがリワードを上回る（要注意）。エントリーは避けた方が無難。"

            return {
                "reward_target": reward_target,
                "reward_percentage": reward_percentage,
                "stop_loss": stop_loss,
                "risk_percentage": risk_percentage,
                "risk_reward_ratio": ratio,
                "evaluation": evaluation,
            }

        except Exception:
            return {
                "reward_target": None,
                "reward_percentage": None,
                "stop_loss": None,
                "risk_percentage": None,
                "risk_reward_ratio": None,
                "evaluation": "計算中にエラーが発生しました",
            }

    @staticmethod
    def extract_focus_points(
        stock_info: dict,
        technical_analysis: dict,
        current_price: Optional[float] = None,
    ) -> list:
        """
        今週の注目ポイント（4-5個）を抽出

        出力形式:
        [{"title": str, "level": float or None, "importance": int, "description": str, "action": str}, ...]
        """
        points = []

        sma_20 = technical_analysis.get("sma_20")
        sma_50 = technical_analysis.get("sma_50")
        bb = technical_analysis.get("bollinger_bands") or {}
        ichimoku = technical_analysis.get("ichimoku") or {}

        bb_upper = bb.get("upper")
        bb_lower = bb.get("lower")
        cloud_top = ichimoku.get("cloud_top")
        cloud_bottom = ichimoku.get("cloud_bottom")

        # SMA50: 中期的な抵抗線・支持線
        if sma_50 is not None:
            if current_price and current_price > sma_50:
                points.append({
                    "title": "SMA50 サポートライン",
                    "level": sma_50,
                    "importance": 4,
                    "description": f"SMA50（¥{sma_50:,.0f}）は中期トレンドの支持線として機能する可能性。",
                    "action": f"¥{sma_50:,.0f} を割り込んだ場合、下降トレンド転換の可能性があるため要注意。",
                })
            else:
                points.append({
                    "title": "SMA50 抵抗線",
                    "level": sma_50,
                    "importance": 4,
                    "description": f"SMA50（¥{sma_50:,.0f}）は中期トレンドの抵抗線として機能する可能性。",
                    "action": f"¥{sma_50:,.0f} を上抜けた場合、中期上昇トレンドへの転換シグナルとして注目。",
                })

        # SMA20: 短期的な支持線・抵抗線
        if sma_20 is not None:
            if current_price and current_price > sma_20:
                points.append({
                    "title": "SMA20 短期サポート",
                    "level": sma_20,
                    "importance": 4,
                    "description": f"SMA20（¥{sma_20:,.0f}）は短期トレンドの支持線として機能する可能性。",
                    "action": f"¥{sma_20:,.0f} を割り込んだ場合、短期下降転換の可能性あり。早めの対応を検討。",
                })
            else:
                points.append({
                    "title": "SMA20 短期抵抗線",
                    "level": sma_20,
                    "importance": 3,
                    "description": f"SMA20（¥{sma_20:,.0f}）が短期的な抵抗線として機能する可能性。",
                    "action": f"¥{sma_20:,.0f} を上抜けた場合、短期反転シグナルとして積極的なエントリーを検討。",
                })

        # Bollinger Bands 上限
        if bb_upper is not None:
            points.append({
                "title": "Bollinger Bands 上限",
                "level": bb_upper,
                "importance": 3,
                "description": f"Bollinger Bands 上限（¥{bb_upper:,.0f}）付近での値動きに注目。",
                "action": f"¥{bb_upper:,.0f} に到達した場合、買われすぎによる反落を警戒。利確のタイミングを検討。",
            })

        # Bollinger Bands 下限
        if bb_lower is not None:
            points.append({
                "title": "Bollinger Bands 下限",
                "level": bb_lower,
                "importance": 3,
                "description": f"Bollinger Bands 下限（¥{bb_lower:,.0f}）付近での反発に注目。",
                "action": f"¥{bb_lower:,.0f} 付近まで下落した場合、売られすぎによる反発を期待してエントリーを検討。",
            })

        # 一目均衡表 雲上限
        if cloud_top is not None:
            points.append({
                "title": "一目均衡表 雲上限",
                "level": cloud_top,
                "importance": 4,
                "description": f"一目均衡表の雲上限（¥{cloud_top:,.0f}）は重要なサポートライン。",
                "action": f"雲上限（¥{cloud_top:,.0f}）を割り込む場合は慎重に。維持できれば強気を継続できる。",
            })

        # 重要度の高い順に並び替え（最大5件）
        points.sort(key=lambda x: x["importance"], reverse=True)
        return points[:5]

    @staticmethod
    def generate_qa(
        technical_analysis: dict,
        fundamental_analysis: dict,
        risk_reward: dict,
        stock_name: str,
    ) -> list:
        """
        よくある質問と回答を自動生成（5件）

        出力形式: [{"question": str, "answer": str}, ...]
        """
        qa_list = []

        tech_signal = technical_analysis.get("signal", "neutral")
        roe_eval = fundamental_analysis.get("roe_eval", "unknown")
        eps_growth_eval = fundamental_analysis.get("eps_growth_eval", "unknown")
        operating_margin_eval = fundamental_analysis.get("operating_margin_eval", "unknown")

        reward_target = risk_reward.get("reward_target")
        reward_pct = risk_reward.get("reward_percentage")
        stop_loss = risk_reward.get("stop_loss")
        risk_pct = risk_reward.get("risk_percentage")

        # シグナルの日本語マッピング
        signal_map = {
            "strong_buy": "強気買い",
            "buy": "買い",
            "neutral": "中立",
            "sell": "売り",
            "strong_sell": "強気売り",
        }
        signal_jp = signal_map.get(tech_signal, "中立")

        # 基礎的なファンダ課題チェック
        has_fund_concern = roe_eval == "poor" or operating_margin_eval == "poor"

        # Q1: 今すぐ買うべき？
        if tech_signal == "strong_buy":
            buy_answer = f"テクニカル指標は「{signal_jp}」シグナルを示しており、短期スイング（1週間〜1ヶ月）なら積極的なエントリーを検討できる水準です。"
        elif tech_signal == "buy":
            buy_answer = f"テクニカル指標は「{signal_jp}」シグナルを示しており、短期スイング（1週間〜1ヶ月）なら検討価値があります。"
        elif tech_signal in ("sell", "strong_sell"):
            buy_answer = f"現在のテクニカル指標は「{signal_jp}」シグナルを示しており、エントリーには慎重な判断が必要です。底打ちを確認してから検討することをお勧めします。"
        else:
            buy_answer = "現在のテクニカル指標は「中立」で方向感が定まっていません。より明確なシグナルが出るまで待つのも一つの選択肢です。"

        if has_fund_concern:
            buy_answer += "なお、ファンダメンタル面では課題があるため、長期保有には様子見が賢明です。"

        qa_list.append({
            "question": "今すぐ買うべきですか？",
            "answer": buy_answer,
        })

        # Q2: 目標株価
        if reward_target and reward_pct is not None:
            target_answer = (
                f"テクニカル分析に基づく短期目標株価は ¥{reward_target:,.0f}（現在値から約 +{reward_pct:.1f}%）と推定されます。"
                "ただし、市場全体の動向や突発的なニュースによって変動する可能性があります。あくまで参考水準としてご利用ください。"
            )
        else:
            target_answer = "現在のデータでは目標株価を算出できません。指標が揃ったタイミングで再度確認することをお勧めします。"

        qa_list.append({
            "question": "目標株価（上値目処）はいくらですか？",
            "answer": target_answer,
        })

        # Q3: 損切りレベル
        if stop_loss and risk_pct is not None:
            stop_answer = (
                f"テクニカル分析に基づく損切りの目安は ¥{stop_loss:,.0f}（現在値から約 {risk_pct:.1f}%）と推定されます。"
                "ただし、これはあくまで参考値です。あなたの資金量やリスク許容度に応じて調整してください。"
                "損切りは損失を限定するために重要なルールです。"
            )
        else:
            stop_answer = "現在のデータでは損切り水準を算出できません。SMA20 や直近安値を参考に、自身のリスク許容度で設定してください。"

        qa_list.append({
            "question": "損切り（ストップロス）はどこで設定すべきですか？",
            "answer": stop_answer,
        })

        # Q4: 警告があるのに買い？
        sell_warnings_exist = (
            technical_analysis.get("rsi_14") is not None
            and technical_analysis.get("rsi_14", 50) > 70
        ) or (
            (technical_analysis.get("bollinger_bands") or {}).get("signal") == "overbought"
        ) or has_fund_concern

        if sell_warnings_exist:
            mixed_answer = (
                f"このレポートは主に短期スイング（1週間〜1ヶ月）のテクニカル分析に基づいています。"
                "売り警告はリスク要因として認識しつつも、テクニカル指標が買いシグナルを示している場合は短期的なエントリー機会と見なすことができます。"
                "ただし、警告を無視するのではなく「リスクを把握した上で判断する」ことが重要です。"
                "特にファンダメンタルの課題は長期的なリスクですので、長期保有を考えている場合は慎重に判断してください。"
            )
        else:
            mixed_answer = (
                "現時点では大きな売り警告は検出されていません。"
                "ただし、相場は常に変動しますので、定期的にレポートを更新して状況を確認することをお勧めします。"
            )

        qa_list.append({
            "question": "売り警告があるのに買いシグナルが出るのはなぜですか？",
            "answer": mixed_answer,
        })

        # Q5: このレポートの対象期間
        qa_list.append({
            "question": "このレポートはどの投資期間向けですか？",
            "answer": (
                "このレポートは主に**短期スイング（1週間〜1ヶ月）**向けのテクニカル分析を中心に構成されています。"
                f"{stock_name}の中長期的な投資判断には、業界動向・競合分析・マクロ経済環境なども含めた別の観点が必要です。"
                "長期保有を検討する場合は、ファンダメンタル指標（ROE・EPS成長率・営業利益率）の継続的な改善を確認することをお勧めします。"
            ),
        })

        return qa_list
