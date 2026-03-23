from typing import Literal, Optional
from pydantic import BaseModel


class StockInfo(BaseModel):
    code: str
    name: str
    current_price: float
    timestamp: str


class MACDData(BaseModel):
    line: Optional[float]
    signal: Optional[float]
    histogram: Optional[float]


class ATRData(BaseModel):
    atr: Optional[float] = None
    atr_avg: Optional[float] = None
    signal: str


class BollingerBandsData(BaseModel):
    upper: Optional[float] = None
    middle: Optional[float] = None
    lower: Optional[float] = None
    width: Optional[float] = None
    signal: str


class IchimokuData(BaseModel):
    conversion_line: Optional[float] = None
    base_line: Optional[float] = None
    leading_span_a: Optional[float] = None
    leading_span_b: Optional[float] = None
    lagging_span: Optional[float] = None
    cloud_top: Optional[float] = None
    cloud_bottom: Optional[float] = None
    signal: str


class TechnicalAnalysis(BaseModel):
    sma_20: Optional[float]
    sma_50: Optional[float]
    rsi_14: Optional[float]
    macd: MACDData
    atr: ATRData
    bollinger_bands: BollingerBandsData
    ichimoku: IchimokuData
    score: float
    signal: str


class FundamentalAnalysis(BaseModel):
    per: Optional[float]
    dividend_yield: Optional[float]
    ytd_performance: Optional[float]
    roe: Optional[float] = None
    roe_eval: Optional[str] = None
    eps_growth: Optional[float] = None
    eps_growth_eval: Optional[str] = None
    operating_margin: Optional[float] = None
    operating_margin_eval: Optional[str] = None
    score: float
    signal: str


class StockReport(BaseModel):
    stock: StockInfo
    technical: TechnicalAnalysis
    fundamental: FundamentalAnalysis
    overall_signal: Literal["buy", "sell", "neutral"]
    confidence: float
    price_history: list[dict]


class CacheInfo(BaseModel):
    total_entries: int
    keys: list[str]
