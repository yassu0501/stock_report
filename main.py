from datetime import datetime, timedelta

import yfinance as yf
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from cache import cache
from fundamental import FundamentalAnalysis
from indicators import TechnicalIndicators
from models import CacheInfo, StockReport
from reports import ReportGenerator
from yf_session import create_session

app = FastAPI(title="Stock Report Generator", version="2.0.0")


_ERROR_TYPE_MAP = {
    400: "invalid_input",
    404: "not_found",
    429: "rate_limit",
    500: "server_error",
}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "type": _ERROR_TYPE_MAP.get(exc.status_code, "unknown"),
                "message": exc.detail,
                "status_code": exc.status_code,
                "timestamp": datetime.now().isoformat(),
            }
        },
    )


# CORS全オリジン許可
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# フロントエンド静的ファイルを配信
app.mount("/static", StaticFiles(directory="."), name="static")


import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

@app.get("/", response_class=FileResponse)
async def root():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))


def _build_report(code: str) -> dict:
    """レポートデータを構築するメイン処理（v2.0）"""
    ticker = yf.Ticker(code, session=create_session())

    # 株価履歴取得（SMA50+一目均衡表52日+1年表示に必要な約450日分）
    end_date = datetime.now()
    start_date = end_date - timedelta(days=450)
    hist = ticker.history(start=start_date.strftime("%Y-%m-%d"))

    if hist is None or len(hist) == 0:
        raise HTTPException(status_code=404, detail=f"銘柄 '{code}' が見つかりません")

    # 銘柄基本情報取得
    try:
        info = ticker.info
    except Exception:
        raise HTTPException(
            status_code=404, detail=f"銘柄 '{code}' の情報を取得できませんでした"
        )

    name = info.get("longName") or info.get("shortName") or code
    current_price = float(hist["Close"].iloc[-1])

    # 価格リスト・High/Low リスト（テクニカル計算用）
    prices = [float(p) for p in hist["Close"].tolist()]
    high_prices = [float(p) for p in hist["High"].tolist()]
    low_prices = [float(p) for p in hist["Low"].tolist()]

    # ─── テクニカル分析（v2.0）───
    tech_dict = TechnicalIndicators.analyze_technical(prices, high_prices, low_prices)

    # ─── ファンダメンタル分析（v2.0）───
    try:
        fund_dict = FundamentalAnalysis.analyze_fundamental(code)
    except Exception:
        fund_dict = {
            "name": name,
            "per": None,
            "dividend_yield": None,
            "ytd_performance": None,
            "roe": None,
            "roe_eval": None,
            "eps_growth": None,
            "eps_growth_eval": None,
            "operating_margin": None,
            "operating_margin_eval": None,
            "score": 50.0,
            "signal": "neutral",
        }

    # ─── 直近252営業日分（約1年）の価格履歴（OHLC + SMA系列）───
    recent_hist = hist.tail(252)
    recent_indices = list(range(len(prices) - len(recent_hist), len(prices)))
    price_history = []
    for i, (idx, row) in enumerate(recent_hist.iterrows()):
        pos = recent_indices[i]
        s20 = TechnicalIndicators.sma(prices[: pos + 1], 20)
        s50 = TechnicalIndicators.sma(prices[: pos + 1], 50)
        price_history.append({
            "date":  str(idx.date()),
            "open":  round(float(row["Open"]),  2),
            "high":  round(float(row["High"]),  2),
            "low":   round(float(row["Low"]),   2),
            "close": round(float(row["Close"]), 2),
            "sma20": round(s20, 2) if s20 is not None else None,
            "sma50": round(s50, 2) if s50 is not None else None,
        })

    # ─── 総合シグナル判定 ───
    tech_score = tech_dict["score"]
    fund_score = fund_dict["score"]
    overall_score = tech_score * 0.6 + fund_score * 0.4
    confidence = round(overall_score / 100, 4)

    if overall_score >= 60:
        overall_signal = "buy"
    elif overall_score <= 40:
        overall_signal = "sell"
    else:
        overall_signal = "neutral"

    return {
        "stock": {
            "code": code,
            "name": name,
            "current_price": round(current_price, 2),
            "timestamp": datetime.now().isoformat(),
        },
        "technical": {
            "sma_20": tech_dict["sma_20"],
            "sma_50": tech_dict["sma_50"],
            "rsi_14": tech_dict["rsi_14"],
            "macd": tech_dict["macd"],
            "atr": tech_dict["atr"],
            "bollinger_bands": tech_dict["bollinger_bands"],
            "ichimoku": tech_dict["ichimoku"],
            "score": tech_dict["score"],
            "signal": tech_dict["signal"],
        },
        "fundamental": {
            "per": fund_dict["per"],
            "dividend_yield": fund_dict["dividend_yield"],
            "ytd_performance": fund_dict["ytd_performance"],
            "roe": fund_dict["roe"],
            "roe_eval": fund_dict["roe_eval"],
            "eps_growth": fund_dict["eps_growth"],
            "eps_growth_eval": fund_dict["eps_growth_eval"],
            "operating_margin": fund_dict["operating_margin"],
            "operating_margin_eval": fund_dict["operating_margin_eval"],
            "score": fund_dict["score"],
            "signal": fund_dict["signal"],
        },
        "overall_signal": overall_signal,
        "confidence": confidence,
        "price_history": price_history,
    }


@app.get("/api/report", response_model=StockReport)
async def get_report(
    code: str = Query(default="7203.T", description="銘柄コード（例: 7203.T）")
):
    """銘柄レポートを取得する"""
    if not code or not code.strip():
        raise HTTPException(status_code=400, detail="銘柄コードを指定してください")

    code = code.strip().upper()

    # キャッシュ確認
    cached = cache.get(f"report:{code}")
    if cached:
        return cached

    try:
        report = _build_report(code)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"レポート生成中にエラーが発生しました: {str(e)}",
        )

    # キャッシュに保存（TTL: 60秒）
    cache.set(f"report:{code}", report, ttl=3600)
    return report


@app.get("/api/refresh", response_model=StockReport)
async def refresh_report(
    code: str = Query(default="7203.T", description="銘柄コード（例: 7203.T）")
):
    """キャッシュを無効化して最新レポートを取得する"""
    if not code or not code.strip():
        raise HTTPException(status_code=400, detail="銘柄コードを指定してください")

    code = code.strip().upper()

    # キャッシュを削除して強制更新
    cache.clear(f"report:{code}")

    try:
        report = _build_report(code)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"レポート更新中にエラーが発生しました: {str(e)}",
        )

    cache.set(f"report:{code}", report, ttl=3600)
    return report


@app.get("/api/report/detailed")
async def get_detailed_report(
    code: str = Query(default="7203.T", description="銘柄コード（例: 7203.T）")
):
    """v2.5 版の詳細レポートを取得する"""
    if not code or not code.strip():
        raise HTTPException(status_code=400, detail="銘柄コードを指定してください")

    code = code.strip().upper()

    # キャッシュ確認
    cached = cache.get(f"detailed_report:{code}")
    if cached:
        return cached

    try:
        base = _build_report(code)

        tech = base["technical"]
        fund = base["fundamental"]
        current_price = base["stock"]["current_price"]
        price_history = base["price_history"]

        # 52週高値・安値を price_history から抽出
        highs = [p["high"] for p in price_history if p.get("high") is not None]
        lows = [p["low"] for p in price_history if p.get("low") is not None]
        high_52w = max(highs) if highs else current_price
        low_52w = min(lows) if lows else current_price

        atr_val = (tech.get("atr") or {}).get("atr")
        sma_20 = tech.get("sma_20")
        sma_50 = tech.get("sma_50")

        # ReportGenerator で各セクションを生成
        technical_summary = ReportGenerator.generate_technical_summary(tech, current_price)
        fundamental_summary = ReportGenerator.generate_fundamental_summary(fund)
        buy_reasons = ReportGenerator.generate_buy_reasons(tech, fund, current_price)
        sell_warnings = ReportGenerator.generate_sell_warnings(tech, fund)
        risk_reward = ReportGenerator.calculate_risk_reward(
            current_price, high_52w, low_52w, atr_val, sma_50, sma_20
        )
        focus_points = ReportGenerator.extract_focus_points(base["stock"], tech, current_price)
        qa = ReportGenerator.generate_qa(tech, fund, risk_reward, base["stock"]["name"])

        # 総合判定の日本語表記
        signal_jp_map = {
            "strong_buy": "強気買い",
            "buy": "買い",
            "neutral": "中立",
            "sell": "売り",
            "strong_sell": "強気売り",
        }
        overall_signal = base["overall_signal"]
        confidence_pct = round(base["confidence"] * 100, 1)
        overall_judgment = f"{signal_jp_map.get(overall_signal, '中立')}（確信度 {confidence_pct}%）"

        result = {
            **base,
            "report": {
                "technical_summary": technical_summary,
                "fundamental_summary": fundamental_summary,
                "overall_judgment": overall_judgment,
                "buy_reasons": buy_reasons,
                "sell_warnings": sell_warnings,
                "risk_reward": risk_reward,
                "focus_points": focus_points,
                "qa": qa,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"詳細レポート生成中にエラーが発生しました: {str(e)}",
        )

    cache.set(f"detailed_report:{code}", result, ttl=3600)
    return result


@app.get("/api/refresh/detailed")
async def refresh_detailed_report(
    code: str = Query(default="7203.T", description="銘柄コード（例: 7203.T）")
):
    """詳細レポートのキャッシュを無効化して最新データを取得する"""
    if not code or not code.strip():
        raise HTTPException(status_code=400, detail="銘柄コードを指定してください")

    code = code.strip().upper()
    cache.clear(f"report:{code}")
    cache.clear(f"detailed_report:{code}")

    return await get_detailed_report(code)


@app.get("/api/cache-info", response_model=CacheInfo)
@app.get("/api/cache/info", response_model=CacheInfo)
async def get_cache_info():
    """現在のキャッシュ状態を返す"""
    return cache.info()


@app.post("/api/cache/clear")
async def clear_cache(code: str = Query(default=None, description="銘柄コード（省略時は全削除）")):
    """キャッシュをクリアする"""
    if code:
        key = code.strip().upper()
        cache.clear(f"report:{key}")
        cache.clear(f"detailed_report:{key}")
        return {"message": f"キャッシュをクリアしました: {key}"}
    else:
        cache.clear()
        return {"message": "すべてのキャッシュをクリアしました"}


@app.get("/health")
async def health_check():
    """ヘルスチェックエンドポイント"""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
