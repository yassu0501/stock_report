import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const app = express();
const PORT = process.env.PORT || 8000;
const __filename = fileURLToPath(import.meta.url);
const BASE_DIR = path.dirname(__filename);

app.use(cors());
app.use(express.json());

// ─── In-Memory Cache ───

class InMemoryCache {
  constructor(maxItems = 30) {
    this._store = {};
    this._maxItems = maxItems;
  }
  get(key) {
    if (!(key in this._store)) return null;
    const entry = this._store[key];
    if (Date.now() > entry.expiresAt) { delete this._store[key]; return null; }
    return entry.data;
  }
  set(key, data, ttl = 3600) {
    if (Object.keys(this._store).length >= this._maxItems && !(key in this._store)) {
      const oldest = Object.entries(this._store).sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0][0];
      delete this._store[oldest];
    }
    this._store[key] = { data, expiresAt: Date.now() + ttl * 1000 };
  }
  clear(key) {
    if (key) delete this._store[key];
    else this._store = {};
  }
}

const cache = new InMemoryCache(30);

// ─── Technical Indicators ───

function emaList(prices, period) {
  if (!prices.length) return [];
  const k = 2.0 / (period + 1);
  const emas = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    emas.push(prices[i] * k + emas[emas.length - 1] * (1 - k));
  }
  return emas;
}

function sma(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rsi(prices, period = 14) {
  if (prices.length < period + 1) return null;
  const gains = [], losses = [];
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  if (avgLoss === 0) return 100.0;
  return 100.0 - (100.0 / (1 + avgGain / avgLoss));
}

function macd(prices) {
  const ema12 = emaList(prices, 12);
  const ema26 = emaList(prices, 26);
  if (ema12.length < 26 || ema26.length < 26) return { line: null, signal: null, histogram: null };
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = emaList(macdLine, 9);
  const histogram = macdLine[macdLine.length - 1] - signalLine[signalLine.length - 1];
  return {
    line: +macdLine[macdLine.length - 1].toFixed(4),
    signal: +signalLine[signalLine.length - 1].toFixed(4),
    histogram: +histogram.toFixed(4),
  };
}

function atr(high, low, close, period = 14) {
  if (high.length < period + 1 || close.length < period + 1) return { atr: null, atr_avg: null, signal: 'normal' };
  const trs = [];
  for (let i = 1; i < close.length; i++) {
    const tr = Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
    trs.push(tr);
  }
  if (trs.length < period) return { atr: null, atr_avg: null, signal: 'normal' };
  let atrVal = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const k = 1.0 / period;
  for (let i = period; i < trs.length; i++) atrVal = atrVal * (1 - k) + trs[i] * k;
  const atrAvg = trs.slice(-period).reduce((a, b) => a + b, 0) / period;
  const signal = atrVal > atrAvg * 1.5 ? 'high_volatility' : atrVal < atrAvg * 0.5 ? 'low_volatility' : 'normal';
  return { atr: +atrVal.toFixed(4), atr_avg: +atrAvg.toFixed(4), signal };
}

function bollingerBands(prices, period = 20, stdDev = 2) {
  if (prices.length < period) return { upper: null, middle: null, lower: null, width: null, signal: 'neutral' };
  const recent = prices.slice(-period);
  const middle = recent.reduce((a, b) => a + b, 0) / period;
  const variance = recent.reduce((s, p) => s + (p - middle) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  const upper = middle + stdDev * std;
  const lower = middle - stdDev * std;
  const current = prices[prices.length - 1];
  const signal = current > upper ? 'overbought' : current < lower ? 'oversold' : 'neutral';
  return { upper: +upper.toFixed(4), middle: +middle.toFixed(4), lower: +lower.toFixed(4), width: +(upper - lower).toFixed(4), signal };
}

function ichimoku(high, low, close) {
  const empty = { conversion_line: null, base_line: null, leading_span_a: null, leading_span_b: null, lagging_span: null, cloud_top: null, cloud_bottom: null, signal: 'neutral' };
  if (high.length < 52 || low.length < 52 || close.length < 52) return empty;
  const conversion = (Math.max(...high.slice(-9)) + Math.min(...low.slice(-9))) / 2;
  const base = (Math.max(...high.slice(-26)) + Math.min(...low.slice(-26))) / 2;
  const leadingA = (conversion + base) / 2;
  const leadingB = (Math.max(...high.slice(-52)) + Math.min(...low.slice(-52))) / 2;
  const lagging = close[close.length - 26];
  const cloudTop = Math.max(leadingA, leadingB);
  const cloudBottom = Math.min(leadingA, leadingB);
  const current = close[close.length - 1];
  const signal = current > cloudTop ? 'bullish' : current < cloudBottom ? 'bearish' : 'neutral';
  return {
    conversion_line: +conversion.toFixed(4), base_line: +base.toFixed(4),
    leading_span_a: +leadingA.toFixed(4), leading_span_b: +leadingB.toFixed(4),
    lagging_span: +lagging.toFixed(4), cloud_top: +cloudTop.toFixed(4), cloud_bottom: +cloudBottom.toFixed(4), signal,
  };
}

function analyzeTechnical(prices, high, low) {
  const current = prices.length ? prices[prices.length - 1] : null;
  const sma20 = sma(prices, 20);
  const sma50 = sma(prices, 50);
  const rsi14 = rsi(prices, 14);
  const macdData = macd(prices);
  const atrData = atr(high, low, prices, 14);
  const bbData = bollingerBands(prices, 20, 2);
  const ichiData = ichimoku(high, low, prices);

  let points = 0;
  if (sma20 && sma50 && current) {
    if (current > sma20 && sma20 > sma50) points += 2;
    else if (current < sma20 && sma20 < sma50) points -= 2;
  }
  if (rsi14 !== null) {
    if (rsi14 < 30) points += 2;
    else if (rsi14 > 70) points -= 2;
    else if (rsi14 < 45) points += 1;
    else if (rsi14 > 55) points -= 1;
  }
  if (macdData.histogram !== null) points += macdData.histogram > 0 ? 2 : -2;
  if (bbData.signal === 'oversold') points += 2;
  else if (bbData.signal === 'overbought') points -= 2;
  if (ichiData.signal === 'bullish') points += 2;
  else if (ichiData.signal === 'bearish') points -= 2;

  const score = Math.max(0, Math.min(100, (points + 10) / 20 * 100));
  const signal = score >= 75 ? 'strong_buy' : score >= 60 ? 'buy' : score >= 40 ? 'neutral' : score >= 25 ? 'sell' : 'strong_sell';

  return {
    sma_20: sma20 !== null ? +sma20.toFixed(2) : null,
    sma_50: sma50 !== null ? +sma50.toFixed(2) : null,
    rsi_14: rsi14 !== null ? +rsi14.toFixed(2) : null,
    macd: macdData, atr: atrData, bollinger_bands: bbData, ichimoku: ichiData,
    score: +score.toFixed(2), signal,
  };
}

// ─── Fundamental Analysis ───

function evaluateShinyoBairitu(val) {
  if (val === null || val === undefined) return 'unknown';
  if (val > 10) return 'high';     // 過熱（売り圧力リスク）
  if (val >= 2) return 'normal';   // 適正
  return 'low';                    // 信用売り多め
}

function evaluateEpsGrowth(rate) {
  if (rate === null || rate === undefined) return 'unknown';
  if (rate > 15) return 'high_growth';
  if (rate > 5) return 'steady_growth';
  if (rate < 0) return 'negative';
  return 'stable';
}

function evaluateKeijoMargin(pct) {
  if (pct === null || pct === undefined) return 'unknown';
  if (pct > 15) return 'excellent';
  if (pct > 8) return 'good';
  if (pct > 3) return 'average';
  return 'poor';
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
let _yahooCrumb = null;
let _yahooCookie = null;

async function fetchKabutanFundamental(code) {
  const stockCode = code.split('.')[0];
  const url = `https://kabutan.jp/stock/?code=${stockCode}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html',
      'Accept-Language': 'ja,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`Kabutan ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  let per = null, pbr = null, dividendYield = null;

  // th/td/spanを全収集してラベルと値をペアリング
  const allTexts = $('th, td, span, dt, dd').map((_, el) => $(el).text().trim()).get();
  const perIdx = allTexts.findIndex(t => t === 'PER');
  const pbrIdx = allTexts.findIndex(t => t === 'PBR');
  const yieldIdx = allTexts.findIndex(t => t === '利回り' || t === '配当利回り');
  const shinyoIdx = allTexts.findIndex(t => t === '信用倍率');

  // 前の値の次のインデックスから検索することで、同じ値の重複取得を防ぐ
  const parseFrom = (startIdx) => {
    for (let i = startIdx; i < Math.min(startIdx + 20, allTexts.length); i++) {
      const v = parseFloat(allTexts[i].replace(/,/g, ''));
      if (!isNaN(v) && v > 0) return { value: v, next: i + 1 };
    }
    return { value: null, next: startIdx };
  };

  const perRes = parseFrom(perIdx + 1);
  per = perRes.value;
  const pbrRes = parseFrom(Math.max(perRes.next, pbrIdx + 1));
  pbr = pbrRes.value;
  const yieldRes = parseFrom(Math.max(pbrRes.next, yieldIdx + 1));
  dividendYield = yieldRes.value;
  const shinyoRes = parseFrom(Math.max(yieldRes.next, shinyoIdx + 1));
  const shinyoBairitu = shinyoRes.value;

  // 業績テーブルからEPS成長率・経常利益率・売上高成長率を取得
  let epsGrowth = null, keijoMargin = null, salesGrowth = null;
  const tableRows = [];
  $('table tr').each((_, tr) => {
    const cells = $(tr).find('th, td').map((_, c) => $(c).text().trim()).get();
    tableRows.push(cells);
  });
  const headerIdx = tableRows.findIndex(r => r.includes('売上高') && r.includes('経常益') && (r.includes('１株益') || r.includes('1株益')));
  console.log(`Kabutan table: totalRows=${tableRows.length}, headerIdx=${headerIdx}`);
  console.log(`Kabutan table rows (30-56):`, JSON.stringify(tableRows.slice(30, 56)));
  if (headerIdx >= 0) {
    const headers = tableRows[headerIdx];
    const salesCol = headers.indexOf('売上高');
    const keijoCol = headers.indexOf('経常益');
    const epsCol = headers.indexOf('１株益') >= 0 ? headers.indexOf('１株益') : headers.indexOf('1株益');
    const actualRows = tableRows.slice(headerIdx + 1).filter(r => r[0] && !r[0].includes('予') && !r[0].includes('前期比') && r.length > epsCol);
    if (actualRows.length >= 2) {
      const prev = actualRows[actualRows.length - 2];
      const curr = actualRows[actualRows.length - 1];
      const prevEps = parseFloat(prev[epsCol]?.replace(/,/g, ''));
      const currEps = parseFloat(curr[epsCol]?.replace(/,/g, ''));
      if (!isNaN(prevEps) && !isNaN(currEps) && prevEps !== 0) {
        epsGrowth = +((currEps - prevEps) / Math.abs(prevEps) * 100).toFixed(2);
      }
      const prevSales = parseFloat(prev[salesCol]?.replace(/,/g, ''));
      const currSales = parseFloat(curr[salesCol]?.replace(/,/g, ''));
      const currKeijo = parseFloat(curr[keijoCol]?.replace(/,/g, ''));
      if (!isNaN(currSales) && !isNaN(currKeijo) && currSales > 0) {
        keijoMargin = +((currKeijo / currSales) * 100).toFixed(2);
      }
      if (!isNaN(prevSales) && !isNaN(currSales) && prevSales > 0) {
        salesGrowth = +((currSales - prevSales) / prevSales * 100).toFixed(2);
      }
    }
  }

  // 銘柄名
  const name = $('h1').first().text().trim() || code;

  console.log(`Kabutan [${code}]: PER=${per}, PBR=${pbr}, 利回り=${dividendYield}, 信用倍率=${shinyoBairitu}, EPS成長率=${epsGrowth}%, 経常利益率=${keijoMargin}%, 売上高成長率=${salesGrowth}%`);
  return { name, per, pbr, dividendYield, shinyoBairitu, epsGrowth, keijoMargin, salesGrowth };
}

async function getYahooCrumb() {
  if (_yahooCrumb) return;
  const consentRes = await fetch('https://finance.yahoo.com/', {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  });
  const rawCookie = consentRes.headers.getSetCookie?.() ?? [];
  _yahooCookie = Array.isArray(rawCookie) ? rawCookie.map(c => c.split(';')[0]).join('; ') : '';
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, 'Cookie': _yahooCookie },
  });
  if (!crumbRes.ok) throw new Error(`Crumb fetch failed: ${crumbRes.status}`);
  _yahooCrumb = await crumbRes.text();
  console.log(`Yahoo crumb acquired: ${_yahooCrumb}`);
}

async function analyzeFundamental(code, priceHistory) {
  let info = {};
  try {
    await getYahooCrumb();
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${code}?modules=summaryDetail%2CdefaultKeyStatistics%2CfinancialData%2Cprice&crumb=${encodeURIComponent(_yahooCrumb)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com/',
        'Cookie': _yahooCookie,
      },
    });
    console.log(`Fundamental fetch [${code}]: status=${res.status}`);
    if (res.ok) {
      const data = await res.json();
      const r = data.quoteSummary?.result?.[0] || {};
      info = { ...r.summaryDetail, ...r.defaultKeyStatistics, ...r.financialData, ...r.price };
    } else if (res.status === 401 || res.status === 403) {
      _yahooCrumb = null;
      _yahooCookie = null;
    }
  } catch (e) {
    console.error(`Fundamental fetch error [${code}]:`, e.message);
    _yahooCrumb = null;
    _yahooCookie = null;
  }

  let name = info.longName || info.shortName || code;
  let per = info.trailingPE || info.forwardPE || null;
  let dividendYield = info.dividendYield || null;

  if (dividendYield !== null) {
    dividendYield = dividendYield < 1.0 ? +(dividendYield * 100).toFixed(2) : +dividendYield.toFixed(2);
  }

  // かぶたんからファンダメンタル取得（常に試みる）
  let pbr = null, shinyoBairitu = null, epsGrowth = null, keijoMargin = null, salesGrowth = null;
  try {
    const kb = await fetchKabutanFundamental(code);
    if (kb.name && kb.name !== code) name = kb.name;
    if (per === null && kb.per != null && !isNaN(kb.per)) per = kb.per;
    if (dividendYield === null && kb.dividendYield != null && !isNaN(kb.dividendYield)) dividendYield = kb.dividendYield;
    if (kb.pbr != null && !isNaN(kb.pbr)) pbr = kb.pbr;
    if (kb.shinyoBairitu != null && !isNaN(kb.shinyoBairitu)) shinyoBairitu = kb.shinyoBairitu;
    if (kb.epsGrowth != null && !isNaN(kb.epsGrowth)) epsGrowth = kb.epsGrowth;
    if (kb.keijoMargin != null && !isNaN(kb.keijoMargin)) keijoMargin = kb.keijoMargin;
    if (kb.salesGrowth != null && !isNaN(kb.salesGrowth)) salesGrowth = kb.salesGrowth;
  } catch (e) {
    console.error(`Kabutan fetch error [${code}]:`, e.message);
  }

  // 平均出来高（20日）
  let avgVolume20 = null;
  if (priceHistory && priceHistory.length >= 20) {
    const last20 = priceHistory.slice(-20);
    const total = last20.reduce((s, r) => s + (r.volume || 0), 0);
    if (total > 0) avgVolume20 = Math.round(total / 20);
  }

  // 年初来パフォーマンス（価格履歴から計算）
  let ytdPerformance = null;
  if (priceHistory && priceHistory.length >= 2) {
    const yearStart = new Date().getFullYear();
    const ytdPrices = priceHistory.filter(p => new Date(p.date).getFullYear() === yearStart);
    if (ytdPrices.length >= 2) {
      const startPrice = ytdPrices[0].close;
      const endPrice = ytdPrices[ytdPrices.length - 1].close;
      ytdPerformance = +((endPrice - startPrice) / startPrice * 100).toFixed(2);
    }
  }

  const shinyoEval = evaluateShinyoBairitu(shinyoBairitu);
  const epsGrowthEval = evaluateEpsGrowth(epsGrowth);
  const keijoMarginEval = evaluateKeijoMargin(keijoMargin);

  let points = 0;
  if (per !== null) {
    if (per < 15) points += 2;
    else if (per < 25) points += 1;
    else if (per > 35) points -= 1;
  }
  if (dividendYield !== null && dividendYield > 1.5) points += 1;
  if (ytdPerformance !== null) {
    if (ytdPerformance > 5) points += 2;
    else if (ytdPerformance > 0) points += 1;
    else points -= 1;
  }
  if (shinyoEval === 'normal') points += 1;
  else if (shinyoEval === 'high') points -= 1;
  if (epsGrowthEval === 'high_growth') points += 2;
  else if (epsGrowthEval === 'steady_growth') points += 1;
  else if (epsGrowthEval === 'negative') points -= 1;
  if (keijoMarginEval === 'excellent') points += 2;
  else if (keijoMarginEval === 'good') points += 1;
  else if (keijoMarginEval === 'poor') points -= 1;

  const score = Math.max(0, Math.min(100, (points + 6) / 17 * 100));
  const signal = score >= 75 ? 'strong_positive' : score >= 60 ? 'positive' : score >= 40 ? 'neutral' : score >= 25 ? 'negative' : 'strong_negative';

  return {
    name, per: per !== null ? +per.toFixed(2) : null, pbr: pbr !== null ? +pbr.toFixed(2) : null,
    dividend_yield: dividendYield,
    ytd_performance: ytdPerformance,
    shinyo_bairitu: shinyoBairitu, shinyo_bairitu_eval: shinyoEval,
    eps_growth: epsGrowth, eps_growth_eval: epsGrowthEval,
    keijo_margin: keijoMargin, keijo_margin_eval: keijoMarginEval,
    sales_growth: salesGrowth,
    avg_volume_20: avgVolume20,
    score: +score.toFixed(2), signal,
  };
}

// ─── Report Generator ───

function generateTechnicalSummary(tech, currentPrice) {
  const lines = [];
  const { sma_20: s20, sma_50: s50, rsi_14: r14, macd: m, atr: a, bollinger_bands: bb, ichimoku: ichi } = tech;

  if (currentPrice && s20 && s50) {
    if (currentPrice > s20 && s20 > s50) lines.push(`現在値が SMA20（¥${s20.toLocaleString()}）> SMA50（¥${s50.toLocaleString()}）で上昇トレンド継続中。`);
    else if (currentPrice < s20 && s20 < s50) lines.push(`現在値が SMA20（¥${s20.toLocaleString()}）< SMA50（¥${s50.toLocaleString()}）で下降トレンド継続中。`);
    else lines.push(`SMA20（¥${s20.toLocaleString()}）と SMA50（¥${s50.toLocaleString()}）付近で推移中。方向感を確認中。`);
  }
  if (r14 !== null) {
    if (r14 < 30) lines.push(`RSI ${r14.toFixed(1)} と売られすぎ水準にあり、反発の可能性がある。`);
    else if (r14 > 70) lines.push(`RSI ${r14.toFixed(1)} と買われすぎ水準にあり、過熱感に注意が必要。`);
    else if (r14 < 45) lines.push(`RSI ${r14.toFixed(1)} とやや弱め。押し目買い検討の水準。`);
    else if (r14 > 55) lines.push(`RSI ${r14.toFixed(1)} とやや強め。上昇モメンタムが継続中。`);
  }
  if (m && m.histogram !== null) {
    lines.push(m.histogram > 0
      ? `MACD ヒストグラムがプラス（${m.histogram.toFixed(4)}）で上昇モメンタム継続中。`
      : `MACD ヒストグラムがマイナス（${m.histogram.toFixed(4)}）で下降圧力あり。`);
  }
  if (a && a.atr !== null) {
    if (a.signal === 'high_volatility') lines.push(`ATR ${a.atr.toFixed(1)} と値動きが大きく、ボラティリティ高め。トレード時の注意が必要。`);
    else if (a.signal === 'low_volatility') lines.push(`ATR ${a.atr.toFixed(1)} と値動きが小さく、ブレイクアウト待ちの推定。`);
  }
  if (bb) {
    if (bb.signal === 'oversold' && bb.lower) lines.push(`Bollinger Bands の下限（¥${Math.round(bb.lower).toLocaleString()}）付近で売られすぎ。反発の可能性がある。`);
    else if (bb.signal === 'overbought' && bb.upper) lines.push(`Bollinger Bands の上限（¥${Math.round(bb.upper).toLocaleString()}）付近で買われすぎ。反落に注意。`);
  }
  if (ichi) {
    if (ichi.signal === 'bullish' && ichi.cloud_top) lines.push(`一目均衡表では雲の上（雲上限: ¥${Math.round(ichi.cloud_top).toLocaleString()}）で堅調。テクニカルは強気。`);
    else if (ichi.signal === 'bearish' && ichi.cloud_bottom) lines.push(`一目均衡表では雲の下（雲下限: ¥${Math.round(ichi.cloud_bottom).toLocaleString()}）で弱気。反転サインを確認してから判断を。`);
    else lines.push('一目均衡表では雲の中にあり、方向感が定まっていない推定。');
  }
  return lines.length ? lines.join('\n') : 'テクニカル指標のデータが不足しているため、判定できません。';
}

function generateFundamentalSummary(fund) {
  const lines = [];
  const { per, shinyo_bairitu, shinyo_bairitu_eval, eps_growth, eps_growth_eval, keijo_margin, keijo_margin_eval, dividend_yield, ytd_performance } = fund;

  if (per !== null) {
    if (per < 15) lines.push(`PER ${per.toFixed(1)} 倍と割安水準。バリュー投資の観点から魅力的な水準。`);
    else if (per < 25) lines.push(`PER ${per.toFixed(1)} 倍と適正水準。市場平均に近い評価。`);
    else lines.push(`PER ${per.toFixed(1)} 倍とやや割高。成長への期待が織り込まれている可能性。`);
  }
  if (shinyo_bairitu !== null) {
    if (shinyo_bairitu_eval === 'high') lines.push(`信用倍率 ${shinyo_bairitu.toFixed(2)} 倍と高水準。信用買い残が多く、売り圧力に注意が必要。`);
    else if (shinyo_bairitu_eval === 'normal') lines.push(`信用倍率 ${shinyo_bairitu.toFixed(2)} 倍と適正水準。`);
    else lines.push(`信用倍率 ${shinyo_bairitu.toFixed(2)} 倍と低め。信用売りが優勢な状況。`);
  }
  if (eps_growth !== null) {
    if (eps_growth_eval === 'high_growth') lines.push(`EPS 成長率 ${eps_growth.toFixed(1)}% と高成長企業。利益拡大が続いている推定。`);
    else if (eps_growth_eval === 'steady_growth') lines.push(`EPS 成長率 ${eps_growth.toFixed(1)}% と安定成長。堅実な業績拡大が見込まれる。`);
    else if (eps_growth_eval === 'negative') lines.push(`EPS 成長率 ${eps_growth.toFixed(1)}% とマイナス成長。業績の回復を確認してから判断が賢明。`);
  }
  if (keijo_margin !== null) {
    if (keijo_margin_eval === 'excellent') lines.push(`経常利益率 ${keijo_margin.toFixed(1)}% と高い収益性。本業の競争力が強い。`);
    else if (keijo_margin_eval === 'good') lines.push(`経常利益率 ${keijo_margin.toFixed(1)}% と良好な収益性。`);
    else if (keijo_margin_eval === 'poor') lines.push(`経常利益率 ${keijo_margin.toFixed(1)}% と低め。収益改善動向を注視。`);
  }
  if (dividend_yield !== null && dividend_yield > 0) {
    lines.push(`配当利回り ${dividend_yield.toFixed(1)}% と${dividend_yield > 2.5 ? '高め。インカムゲインも期待できる。' : '配当あり。'}`);
  }
  if (ytd_performance !== null) {
    if (ytd_performance > 10) lines.push(`年初来パフォーマンス +${ytd_performance.toFixed(1)}% と好調。勢いが続くか注目。`);
    else if (ytd_performance < -10) lines.push(`年初来パフォーマンス ${ytd_performance.toFixed(1)}% と軟調。底打ち確認が重要。`);
  }
  if (per !== null && per < 15 && eps_growth_eval === 'high_growth' && keijo_margin_eval === 'excellent') {
    lines.push('割安・高成長・高収益率が揃っており、全体的に買い好機と言える水準。');
  } else if (eps_growth_eval === 'negative' && keijo_margin_eval === 'poor') {
    lines.push('EPS・経常利益率ともに低調で、長期保有には向きにくい状況。業績改善を待つべきかもしれない。');
  }

  return lines.length ? lines.join('\n') : 'ファンダメンタル指標のデータが不足しているため、判定できません。';
}

function generateBuyReasons(tech, fund, currentPrice) {
  const reasons = [];
  const { sma_20: s20, sma_50: s50, rsi_14: r14, macd: m, atr: a, bollinger_bands: bb, ichimoku: ichi } = tech;
  const { per, shinyo_bairitu, shinyo_bairitu_eval, eps_growth, eps_growth_eval, keijo_margin, keijo_margin_eval } = fund;

  if (currentPrice && s20 && s50 && currentPrice > s20 && s20 > s50)
    reasons.push({ indicator: 'SMA（20/50）', detail: `現在値（¥${Math.round(currentPrice).toLocaleString()}）> SMA20（¥${Math.round(s20).toLocaleString()}）> SMA50（¥${Math.round(s50).toLocaleString()}）で強い上昇トレンド。` });
  if (m && m.histogram !== null && m.histogram > 0)
    reasons.push({ indicator: 'MACD', detail: `MACD ヒストグラム +${m.histogram.toFixed(4)} でプラス。上昇モメンタムが継続中。` });
  if (r14 !== null && r14 < 30)
    reasons.push({ indicator: 'RSI（14）', detail: `RSI ${r14.toFixed(1)} と売られすぎ水準（30以下）。反発の可能性がある。` });
  if (a && a.atr && a.atr_avg && a.atr > a.atr_avg * 1.5)
    reasons.push({ indicator: 'ATR（ボラティリティ）', detail: `ATR ${a.atr.toFixed(1)} が平均（${a.atr_avg.toFixed(1)}）の 1.5 倍超。ブレイクアウトの可能性がある。` });
  if (bb && bb.signal === 'oversold' && bb.lower)
    reasons.push({ indicator: 'Bollinger Bands', detail: `現在値がバンド下限（¥${Math.round(bb.lower).toLocaleString()}）を下回り売られすぎ。平均回帰による反発を期待できる。` });
  if (ichi && ichi.signal === 'bullish' && ichi.cloud_top)
    reasons.push({ indicator: '一目均衡表', detail: `現在値が雲の上（雲上限: ¥${Math.round(ichi.cloud_top).toLocaleString()}）にあり、強気トレンド継続中。` });
  if (shinyo_bairitu_eval === 'normal' && shinyo_bairitu !== null)
    reasons.push({ indicator: '信用倍率', detail: `信用倍率 ${shinyo_bairitu.toFixed(2)} 倍と適正水準。需給バランスが安定している。` });
  if (per !== null && per < 15)
    reasons.push({ indicator: 'PER（バリュエーション）', detail: `PER ${per.toFixed(1)} 倍と割安水準。市場に低く評価されている可能性があり、割安株として注目できる。` });
  if (eps_growth_eval === 'high_growth' && eps_growth !== null)
    reasons.push({ indicator: 'EPS 成長率', detail: `EPS 成長率 ${eps_growth.toFixed(1)}% と高成長。利益拡大トレンドが続いている推定。` });
  if (keijo_margin_eval === 'excellent' && keijo_margin !== null)
    reasons.push({ indicator: '経常利益率', detail: `経常利益率 ${keijo_margin.toFixed(1)}% と高い収益性。本業の競争力が強い。` });
  return reasons;
}

function generateSellWarnings(tech, fund) {
  const warnings = [];
  const { rsi_14: r14, bollinger_bands: bb, ichimoku: ichi } = tech;
  const { shinyo_bairitu, shinyo_bairitu_eval, keijo_margin, keijo_margin_eval } = fund;

  if (r14 !== null && r14 > 70)
    warnings.push({ indicator: 'RSI（14）', detail: `RSI ${r14.toFixed(1)} と買われすぎ水準（70以上）。過熱感から調整が入る可能性がある。` });
  if (bb && bb.signal === 'overbought' && bb.upper)
    warnings.push({ indicator: 'Bollinger Bands', detail: `現在値がバンド上限（¥${Math.round(bb.upper).toLocaleString()}）を上回り買われすぎ。反落リスクあり。` });
  if (ichi && ichi.signal === 'bearish' && ichi.cloud_bottom)
    warnings.push({ indicator: '一目均衡表', detail: `現在値が雲の下（雲下限: ¥${Math.round(ichi.cloud_bottom).toLocaleString()}）にあり、弱気トレンド継続中。底打ち確認が必要。` });
  if (shinyo_bairitu_eval === 'high' && shinyo_bairitu !== null)
    warnings.push({ indicator: '信用倍率', detail: `信用倍率 ${shinyo_bairitu.toFixed(2)} 倍と高水準。信用買い残が多く、需給悪化リスクあり。` });
  if (keijo_margin_eval === 'poor' && keijo_margin !== null)
    warnings.push({ indicator: '経常利益率', detail: `経常利益率 ${keijo_margin.toFixed(1)}% と低め。本業の収益力に課題があり、改善動向を注視。` });
  return warnings;
}

function calculateRiskReward(currentPrice, highPrice, lowPrice52w, atrVal, sma50Val, sma20Val) {
  try {
    const candidates = [highPrice * 1.05];
    if (sma50Val !== null) candidates.push(sma50Val);
    let rewardRaw = Math.max(...candidates);
    let rewardTarget = Math.round(rewardRaw / 100) * 100;
    if (rewardTarget <= currentPrice) rewardTarget = (Math.floor(rewardRaw / 100) + 1) * 100;
    const rewardPct = +((rewardTarget - currentPrice) / currentPrice * 100).toFixed(2);

    let stopLossRaw;
    if (sma20Val !== null && atrVal !== null) stopLossRaw = Math.max(sma20Val - atrVal, lowPrice52w);
    else stopLossRaw = lowPrice52w;
    if (stopLossRaw >= currentPrice) stopLossRaw = currentPrice - (atrVal !== null ? atrVal * 2 : currentPrice * 0.03);
    const stopLoss = Math.round(stopLossRaw);
    const riskPct = +((stopLoss - currentPrice) / currentPrice * 100).toFixed(2);
    const ratio = riskPct !== 0 ? +Math.abs(rewardPct / riskPct).toFixed(2) : null;
    const evaluation = ratio === null ? 'リスク・リワード比率を計算できません'
      : ratio >= 2.0 ? '優秀なリスク・リワード比。積極的なエントリーを検討できる水準。'
      : ratio >= 1.5 ? '良好なリスク・リワード比。リワードがリスクを上回っている。'
      : ratio >= 1.0 ? '許容範囲のリスク・リワード比。ただし慎重な判断を。'
      : 'リスクがリワードを上回る（要注意）。エントリーは避けた方が無難。';
    return { reward_target: rewardTarget, reward_percentage: rewardPct, stop_loss: stopLoss, risk_percentage: riskPct, risk_reward_ratio: ratio, evaluation };
  } catch {
    return { reward_target: null, reward_percentage: null, stop_loss: null, risk_percentage: null, risk_reward_ratio: null, evaluation: '計算中にエラーが発生しました' };
  }
}

function extractFocusPoints(stockInfo, tech, currentPrice) {
  const points = [];
  const { sma_20: s20, sma_50: s50, bollinger_bands: bb, ichimoku: ichi } = tech;
  if (s50 !== null) {
    if (currentPrice && currentPrice > s50)
      points.push({ title: 'SMA50 サポートライン', level: s50, importance: 4, description: `SMA50（¥${Math.round(s50).toLocaleString()}）は中期トレンドの支持線として機能する可能性。`, action: `¥${Math.round(s50).toLocaleString()} を割り込んだ場合、下降トレンド転換の可能性があるため要注意。` });
    else
      points.push({ title: 'SMA50 抵抗線', level: s50, importance: 4, description: `SMA50（¥${Math.round(s50).toLocaleString()}）は中期トレンドの抵抗線として機能する可能性。`, action: `¥${Math.round(s50).toLocaleString()} を上抜けた場合、中期上昇トレンドへの転換シグナルとして注目。` });
  }
  if (s20 !== null) {
    if (currentPrice && currentPrice > s20)
      points.push({ title: 'SMA20 短期サポート', level: s20, importance: 4, description: `SMA20（¥${Math.round(s20).toLocaleString()}）は短期トレンドの支持線として機能する可能性。`, action: `¥${Math.round(s20).toLocaleString()} を割り込んだ場合、短期下降転換の可能性あり。早めの対応を検討。` });
    else
      points.push({ title: 'SMA20 短期抵抗線', level: s20, importance: 3, description: `SMA20（¥${Math.round(s20).toLocaleString()}）が短期的な抵抗線として機能する可能性。`, action: `¥${Math.round(s20).toLocaleString()} を上抜けた場合、短期反転シグナルとして積極的なエントリーを検討。` });
  }
  if (bb && bb.upper) points.push({ title: 'Bollinger Bands 上限', level: bb.upper, importance: 3, description: `Bollinger Bands 上限（¥${Math.round(bb.upper).toLocaleString()}）付近での値動きに注目。`, action: `¥${Math.round(bb.upper).toLocaleString()} に到達した場合、買われすぎによる反落を警戒。利確のタイミングを検討。` });
  if (bb && bb.lower) points.push({ title: 'Bollinger Bands 下限', level: bb.lower, importance: 3, description: `Bollinger Bands 下限（¥${Math.round(bb.lower).toLocaleString()}）付近での反発に注目。`, action: `¥${Math.round(bb.lower).toLocaleString()} 付近まで下落した場合、売られすぎによる反発を期待してエントリーを検討。` });
  if (ichi && ichi.cloud_top) points.push({ title: '一目均衡表 雲上限', level: ichi.cloud_top, importance: 4, description: `一目均衡表の雲上限（¥${Math.round(ichi.cloud_top).toLocaleString()}）は重要なサポートライン。`, action: `雲上限（¥${Math.round(ichi.cloud_top).toLocaleString()}）を割り込む場合は慎重に。維持できれば強気を継続できる。` });
  return points.sort((a, b) => b.importance - a.importance).slice(0, 5);
}

function generateQA(tech, fund, riskReward, stockName) {
  const { signal: techSignal } = tech;
  const { eps_growth_eval, keijo_margin_eval } = fund;
  const { reward_target, reward_percentage, stop_loss, risk_percentage } = riskReward;
  const signalMap = { strong_buy: '強気買い', buy: '買い', neutral: '中立', sell: '売り', strong_sell: '強気売り' };
  const signalJP = signalMap[techSignal] || '中立';
  const hasFundConcern = eps_growth_eval === 'negative' || keijo_margin_eval === 'poor';

  let buyAnswer;
  if (techSignal === 'strong_buy') buyAnswer = `テクニカル指標は「${signalJP}」シグナルを示しており、短期スイング（1週間〜1ヶ月）なら積極的なエントリーを検討できる水準です。`;
  else if (techSignal === 'buy') buyAnswer = `テクニカル指標は「${signalJP}」シグナルを示しており、短期スイング（1週間〜1ヶ月）なら検討価値があります。`;
  else if (techSignal === 'sell' || techSignal === 'strong_sell') buyAnswer = `現在のテクニカル指標は「${signalJP}」シグナルを示しており、エントリーには慎重な判断が必要です。底打ちを確認してから検討することをお勧めします。`;
  else buyAnswer = '現在のテクニカル指標は「中立」で方向感が定まっていません。より明確なシグナルが出るまで待つのも一つの選択肢です。';
  if (hasFundConcern) buyAnswer += 'なお、ファンダメンタル面では課題があるため、長期保有には様子見が賢明です。';

  const targetAnswer = reward_target && reward_percentage !== null
    ? `テクニカル分析に基づく短期目標株価は ¥${Math.round(reward_target).toLocaleString()}（現在値から約 +${reward_percentage.toFixed(1)}%）と推定されます。ただし、市場全体の動向や突発的なニュースによって変動する可能性があります。あくまで参考水準としてご利用ください。`
    : '現在のデータでは目標株価を算出できません。指標が揃ったタイミングで再度確認することをお勧めします。';

  const stopAnswer = stop_loss && risk_percentage !== null
    ? `テクニカル分析に基づく損切りの目安は ¥${Math.round(stop_loss).toLocaleString()}（現在値から約 ${risk_percentage.toFixed(1)}%）と推定されます。ただし、これはあくまで参考値です。あなたの資金量やリスク許容度に応じて調整してください。損切りは損失を限定するために重要なルールです。`
    : '現在のデータでは損切り水準を算出できません。SMA20 や直近安値を参考に、自身のリスク許容度で設定してください。';

  const hasSellWarning = (tech.rsi_14 !== null && tech.rsi_14 > 70)
    || (tech.bollinger_bands && tech.bollinger_bands.signal === 'overbought')
    || hasFundConcern;

  const mixedAnswer = hasSellWarning
    ? 'このレポートは主に短期スイング（1週間〜1ヶ月）のテクニカル分析に基づいています。売り警告はリスク要因として認識しつつも、テクニカル指標が買いシグナルを示している場合は短期的なエントリー機会と見なすことができます。ただし、警告を無視するのではなく「リスクを把握した上で判断する」ことが重要です。特にファンダメンタルの課題は長期的なリスクですので、長期保有を考えている場合は慎重に判断してください。'
    : '現時点では大きな売り警告は検出されていません。ただし、相場は常に変動しますので、定期的にレポートを更新して状況を確認することをお勧めします。';

  return [
    { question: '今すぐ買うべきですか？', answer: buyAnswer },
    { question: '目標株価（上値目処）はいくらですか？', answer: targetAnswer },
    { question: '損切り（ストップロス）はどこで設定すべきですか？', answer: stopAnswer },
    { question: '売り警告があるのに買いシグナルが出るのはなぜですか？', answer: mixedAnswer },
    { question: 'このレポートはどの投資期間向けですか？', answer: `このレポートは主に短期スイング（1週間〜1ヶ月）向けのテクニカル分析を中心に構成されています。${stockName}の中長期的な投資判断には、業界動向・競合分析・マクロ経済環境なども含めた別の観点が必要です。長期保有を検討する場合は、ファンダメンタル指標（ROE・EPS成長率・営業利益率）の継続的な改善を確認することをお勧めします。` },
  ];
}

// ─── Data Fetching (Kabutan Price) ───

async function fetchKabutanPrice(code) {
  const stockCode = code.split('.')[0];
  const allRows = [];
  const seen = new Set();

  for (let page = 1; page <= 13; page++) {
    const url = `https://kabutan.jp/stock/kabuka?code=${stockCode}&ashi=day&page=${page}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'ja,en;q=0.9' },
    });
    if (!res.ok) break;

    const html = await res.text();
    const $ = cheerio.load(html);

    let pageRows = 0;
    $('table tr').each((_, tr) => {
      const cells = $(tr).find('th, td').map((_, c) => $(c).text().trim()).get();
      if (cells.length < 8) return;

      const m = cells[0].match(/(\d{2,4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      if (!m) return;
      let year = parseInt(m[1]);
      if (year < 100) year += 2000;
      const date = `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
      if (seen.has(date)) return;

      const open  = parseFloat(cells[1].replace(/,/g, ''));
      const high  = parseFloat(cells[2].replace(/,/g, ''));
      const low   = parseFloat(cells[3].replace(/,/g, ''));
      const close = parseFloat(cells[4].replace(/,/g, ''));
      const volume = parseInt(cells[7].replace(/,/g, '')) || 0;
      if (isNaN(close) || close <= 0) return;

      seen.add(date);
      allRows.push({ date, open: isNaN(open) ? close : open, high: isNaN(high) ? close : high, low: isNaN(low) ? close : low, close, volume });
      pageRows++;
    });

    console.log(`KabutanPrice page=${page}: rows=${pageRows}, total=${allRows.length}`);
    if (pageRows === 0) break;
    if (allRows.length >= 310) break;
  }

  if (allRows.length === 0) throw new Error('No price data from Kabutan');
  return allRows.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Build Report ───

async function buildReport(code) {
  const df = await fetchKabutanPrice(code);

  const prices = df.map(r => r.close);
  const highs = df.map(r => r.high);
  const lows = df.map(r => r.low);
  const currentPrice = prices[prices.length - 1];

  const techDict = analyzeTechnical(prices, highs, lows);

  let fundDict;
  try {
    fundDict = await analyzeFundamental(code, df);
  } catch {
    fundDict = {
      name: code, per: null, dividend_yield: null, ytd_performance: null,
      shinyo_bairitu: null, shinyo_bairitu_eval: 'unknown',
      eps_growth: null, eps_growth_eval: 'unknown',
      keijo_margin: null, keijo_margin_eval: 'unknown', score: 50.0, signal: 'neutral',
    };
  }

  const name = fundDict.name || code;

  // 価格履歴（252日分）
  const recentDf = df.slice(-252);
  const offset = df.length - recentDf.length;
  const priceHistory = recentDf.map((row, i) => {
    const pos = offset + i;
    const s20 = sma(prices.slice(0, pos + 1), 20);
    const s50 = sma(prices.slice(0, pos + 1), 50);
    return {
      date: row.date,
      open: +row.open.toFixed(2),
      high: +row.high.toFixed(2),
      low: +row.low.toFixed(2),
      close: +row.close.toFixed(2),
      volume: row.volume,
      sma20: s20 !== null ? +s20.toFixed(2) : null,
      sma50: s50 !== null ? +s50.toFixed(2) : null,
    };
  });

  const techScore = techDict.score;
  const fundScore = fundDict.score;
  const overallScore = techScore * 0.6 + fundScore * 0.4;
  const confidence = +(overallScore / 100).toFixed(4);
  const overallSignal = overallScore >= 60 ? 'buy' : overallScore <= 40 ? 'sell' : 'neutral';

  return {
    stock: { code, name, current_price: +currentPrice.toFixed(2), timestamp: new Date().toISOString() },
    technical: techDict,
    fundamental: fundDict,
    overall_signal: overallSignal,
    confidence,
    price_history: priceHistory,
  };
}

// ─── Endpoints ───

app.get('/', (req, res) => res.sendFile(path.join(BASE_DIR, 'index.html')));
app.get('/app.js', (req, res) => res.sendFile(path.join(BASE_DIR, 'app.js')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(BASE_DIR, 'styles.css')));

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), api: 'node-v1' }));

app.get('/api/v2/report', async (req, res) => {
  const code = (req.query.code || '7203.T').trim().toUpperCase();
  console.info(`Report Request: ${code}`);

  const cached = cache.get(`detailed_report:${code}`);
  if (cached) return res.json(cached);

  try {
    const base = await buildReport(code);
    const tech = base.technical;
    const fund = base.fundamental;
    const curr = base.stock.current_price;
    const hist = base.price_history;

    const h52 = hist.length ? Math.max(...hist.map(p => p.high)) : curr;
    const l52 = hist.length ? Math.min(...hist.map(p => p.low)) : curr;

    const rpt = {
      technical_summary: generateTechnicalSummary(tech, curr),
      fundamental_summary: generateFundamentalSummary(fund),
      overall_judgment: `${base.overall_signal.toUpperCase()} (Confidence ${(base.confidence * 100).toFixed(1)}%)`,
      buy_reasons: generateBuyReasons(tech, fund, curr),
      sell_warnings: generateSellWarnings(tech, fund),
      risk_reward: calculateRiskReward(curr, h52, l52, tech.atr?.atr ?? null, tech.sma_50, tech.sma_20),
      focus_points: extractFocusPoints(base.stock, tech, curr),
      qa: generateQA(tech, fund, calculateRiskReward(curr, h52, l52, tech.atr?.atr ?? null, tech.sma_50, tech.sma_20), base.stock.name),
    };

    const result = { ...base, report: rpt };
    cache.set(`detailed_report:${code}`, result, 3600);
    return res.json(result);
  } catch (err) {
    console.error(`Report error [${code}]:`, err.message);
    return res.status(404).json({ detail: `銘柄 '${code}' の取得に失敗しました: ${err.message}` });
  }
});

app.get('/api/v2/refresh', async (req, res) => {
  const code = (req.query.code || '7203.T').trim().toUpperCase();
  cache.clear(`detailed_report:${code}`);
  req.query.code = code;
  // reuse the report handler
  return res.redirect(`/api/v2/report?code=${code}`);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
