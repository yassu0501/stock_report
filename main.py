import os
import logging
import requests
import pandas as pd
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

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

# ─── Yahoo Finance API 直接取得用のヘルパー ───

def fetch_yahoo_v8(ticker: str, range_period: str = "1y", interval: str = "1d"):
    """SKILL.md の成功パターンに基づき直接 API を叩く"""
    # 期間変換 (1y -> 450d分確保)
    end = int(datetime.now().timestamp())
    start = int((datetime.now() - timedelta(days=450)).timestamp())
    
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval={interval}&period1={start}&period2={end}&events=history&includeAdjustedClose=true"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        result = data.get("chart", {}).get("result", [])
        if not result:
            raise ValueError("No data found")
            
        res = result[0]
        meta = res.get("meta", {})
        ts = res.get("timestamp", [])
        indicators = res.get("indicators", {}).get("quote", [{}])[0]
        adj = res.get("indicators", {}).get("adjclose", [{}])[0].get("adjclose", [])
        
        # DataFrame 化 (SKILL.md の補正ロジック)
        df = pd.DataFrame({
            "Date": [datetime.fromtimestamp(t) for t in ts],
            "Open": indicators.get("open", []),
            "High": indicators.get("high", []),
            "Low": indicators.get("low", []),
            "Close": indicators.get("close", []),
            "Adj Close": adj
        })
        
        # 株式分割補正 (Close と Adj Close の比率で他も補正)
        df['ratio'] = df['Adj Close'] / df['Close']
        for col in ['Open', 'High', 'Low']:
            df[col] = df[col] * df['ratio']
        df['Close'] = df['Adj Close']
        
        df = df.dropna().reset_index(drop=True)
        return df, meta
    except Exception as e:
        logger.error(f"Yahoo API Error: {str(e)}")
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
