import os
import logging
import pandas as pd
from datetime import datetime
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import yfinance as yf

from cache import cache
from fundamental import FundamentalAnalysis
from indicators import TechnicalIndicators
from models import CacheInfo, StockReport
from reports import ReportGenerator

# ロガーの設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = FastAPI(title="Stock Report Generator", version="2.5.0")

_ERROR_TYPE_MAP = {
    400: "invalid_input",
    404: "not_found",
    429: "rate_limit",
    500: "server_error",
}

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Yahoo Finance データ取得用のヘルパー ───

def fetch_yahoo_v8(ticker: str, range_period: str = "1y", interval: str = "1d"):
    """yfinance を使って価格データを取得する"""
    try:
        t = yf.Ticker(ticker)
        df = t.history(period="18mo", interval=interval, auto_adjust=True)
        if df.empty:
            raise ValueError("No data found")

        info = {}
        try:
            info = t.info or {}
        except Exception:
            pass

        df = df.reset_index()
        # カラム名を統一
        df = df.rename(columns={"index": "Date"})
        if "Datetime" in df.columns:
            df = df.rename(columns={"Datetime": "Date"})
        # Date を timezone-naive に変換
        if hasattr(df["Date"].dtype, "tz") and df["Date"].dt.tz is not None:
            df["Date"] = df["Date"].dt.tz_localize(None)
        # auto_adjust=True の場合 Adj Close = Close
        if "Adj Close" not in df.columns:
            df["Adj Close"] = df["Close"]

        df = df[["Date", "Open", "High", "Low", "Close", "Adj Close"]].dropna().reset_index(drop=True)
        return df, info
    except Exception as e:
        logger.error(f"yfinance fetch error [{ticker}]: {str(e)}")
        raise HTTPException(status_code=404, detail=f"銘柄 '{ticker}' の取得に失敗しました: {str(e)}")

def _build_report(code: str) -> dict:
    """レポートデータを構築するメイン処理 (Success Pattern v2.5)"""
    df, meta = fetch_yahoo_v8(code)
    
    if df.empty:
        raise HTTPException(status_code=404, detail=f"銘柄 '{code}' の価格データがありません")

    current_price = float(df["Close"].iloc[-1])
    name = meta.get("longName") or meta.get("shortName") or meta.get("symbol") or code

    prices = df["Close"].tolist()
    high_prices = df["High"].tolist()
    low_prices = df["Low"].tolist()

    # テクニカル分析
    tech_dict = TechnicalIndicators.analyze_technical(prices, high_prices, low_prices)

    # ファンダメンタル分析 (既存の yfinance ベースだが失敗時は黙認)
    try:
        fund_dict = FundamentalAnalysis.analyze_fundamental(code)
    except Exception:
        fund_dict = {
            "name": name, "per": None, "dividend_yield": None, "ytd_performance": None,
            "roe": None, "roe_eval": "unknown", "eps_growth": None, "eps_growth_eval": "unknown",
            "operating_margin": None, "operating_margin_eval": "unknown", "score": 50.0, "signal": "neutral"
        }

    # 価格履歴 (252日分)
    recent_df = df.tail(252).copy()
    price_history = []
    for i in range(len(recent_df)):
        row = recent_df.iloc[i]
        pos = len(df) - len(recent_df) + i
        s20 = TechnicalIndicators.sma(prices[: pos + 1], 20)
        s50 = TechnicalIndicators.sma(prices[: pos + 1], 50)
        price_history.append({
            "date": str(row["Date"].date()),
            "open": round(float(row["Open"]), 2),
            "high": round(float(row["High"]), 2),
            "low": round(float(row["Low"]), 2),
            "close": round(float(row["Close"]), 2),
            "sma20": round(s20, 2) if s20 is not None else None,
            "sma50": round(s50, 2) if s50 is not None else None,
        })

    # 総合判定
    tech_score = tech_dict["score"]
    fund_score = fund_dict["score"]
    overall_score = tech_score * 0.6 + fund_score * 0.4
    confidence = round(overall_score / 100, 4)
    overall_signal = "buy" if overall_score >= 60 else "sell" if overall_score <= 40 else "neutral"

    return {
        "stock": {
            "code": code, "name": name, "current_price": round(current_price, 2),
            "timestamp": datetime.now().isoformat(),
        },
        "technical": tech_dict,
        "fundamental": fund_dict,
        "overall_signal": overall_signal,
        "confidence": confidence,
        "price_history": price_history,
    }

# ─── エンドポイント定義 ───

@app.get("/")
async def root():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))

@app.get("/app.js")
async def get_js():
    return FileResponse(os.path.join(BASE_DIR, "app.js"))

@app.get("/styles.css")
async def get_css():
    return FileResponse(os.path.join(BASE_DIR, "styles.css"))

@app.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now().isoformat(), "api": "v8-direct"}

@app.get("/api/v2/report")
async def get_detailed_report_v2(code: str = Query(default="7203.T")):
    logger.info(f"Report Request: {code}")
    code = code.strip().upper()
    
    cached = cache.get(f"detailed_report:{code}")
    if cached: return cached

    base = _build_report(code)
    
    # 詳細レポートの構築 (ReportGenerator)
    tech = base["technical"]
    fund = base["fundamental"]
    curr = base["stock"]["current_price"]
    hist = base["price_history"]
    
    highs = [p["high"] for p in hist]
    lows = [p["low"] for p in hist]
    h52 = max(highs) if highs else curr
    l52 = min(lows) if lows else curr
    
    rpt = {
        "technical_summary": ReportGenerator.generate_technical_summary(tech, curr),
        "fundamental_summary": ReportGenerator.generate_fundamental_summary(fund),
        "overall_judgment": f"{base['overall_signal'].upper()} (Confidence {round(base['confidence']*100,1)}%)",
        "buy_reasons": ReportGenerator.generate_buy_reasons(tech, fund, curr),
        "sell_warnings": ReportGenerator.generate_sell_warnings(tech, fund),
        "risk_reward": ReportGenerator.calculate_risk_reward(curr, h52, l52, tech.get("atr",{}).get("atr"), tech.get("sma_50"), tech.get("sma_20")),
        "focus_points": ReportGenerator.extract_focus_points(base["stock"], tech, curr),
        "qa": ReportGenerator.generate_qa(tech, fund, {}, base["stock"]["name"]),
    }
    
    result = {**base, "report": rpt}
    cache.set(f"detailed_report:{code}", result, ttl=3600)
    return result

@app.get("/api/v2/refresh")
async def refresh_report(code: str = Query(default="7203.T")):
    code = code.strip().upper()
    cache.clear(f"detailed_report:{code}")
    return await get_detailed_report_v2(code)

app.mount("/static", StaticFiles(directory=BASE_DIR), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
