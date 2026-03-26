const API_BASE = '';
let chartInstance = null;
let lastPriceHistory = null;

// ── チャートインジケーター表示フラグ ──────────────────────────────────────────
const indVisible = { bb: true, volume: true, rsi: true, macd: true };

function toggleIndicator(name, btn) {
  indVisible[name] = !indVisible[name];
  btn.classList.toggle('active', indVisible[name]);
  if (lastPriceHistory) renderChart(lastPriceHistory);
}

// ── クライアント側インジケーター計算 ─────────────────────────────────────────

function computeBBHistory(closes, period = 20, k = 2) {
  const upper = [], middle = [], lower = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(null); middle.push(null); lower.push(null); continue; }
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
    upper.push(+(mean + k * std).toFixed(2));
    middle.push(+mean.toFixed(2));
    lower.push(+(mean - k * std).toFixed(2));
  }
  return { upper, middle, lower };
}

function computeRSIHistory(closes, period = 14) {
  if (closes.length <= period) return closes.map(() => null);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  const result = new Array(period).fill(null);
  result.push(avgLoss === 0 ? 100 : +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    result.push(avgLoss === 0 ? 100 : +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
  }
  return result;
}

function computeMACDHistory(closes) {
  const k12 = 2 / 13, k26 = 2 / 27, k9 = 2 / 10;
  let ema12 = closes[0], ema26 = closes[0];
  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (i > 0) { ema12 = closes[i] * k12 + ema12 * (1 - k12); ema26 = closes[i] * k26 + ema26 * (1 - k26); }
    macdLine.push(i < 25 ? null : +(ema12 - ema26).toFixed(4));
  }
  let signal = null;
  const signalArr = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] === null) { signalArr.push(null); continue; }
    signal = signal === null ? macdLine[i] : macdLine[i] * k9 + signal * (1 - k9);
    signalArr.push(+signal.toFixed(4));
  }
  const histogram = macdLine.map((v, i) =>
    v !== null && signalArr[i] !== null ? +(v - signalArr[i]).toFixed(4) : null
  );
  return { macdLine, signalLine: signalArr, histogram };
}

function setLoading(on) {
  document.getElementById('loading').style.display = on ? 'block' : 'none';
  document.getElementById('fetch-btn').disabled = on;
  document.getElementById('refresh-btn').disabled = on;
}

function showError(msg) {
  const box = document.getElementById('error-box');
  box.textContent = msg;
  box.style.display = 'block';
}

function hideError() {
  document.getElementById('error-box').style.display = 'none';
}

function fmtNull(val, suffix = '', decimals = 2) {
  if (val === null || val === undefined) {
    return '<span class="null-val">N/A</span>';
  }
  return `${Number(val).toFixed(decimals)}${suffix}`;
}

function signalColor(sig) {
  if (sig === 'buy' || sig === 'strong_buy' || sig === 'positive' || sig === 'strong_positive') return 'var(--buy)';
  if (sig === 'sell' || sig === 'strong_sell' || sig === 'negative' || sig === 'strong_negative') return 'var(--sell)';
  return 'var(--neutral)';
}

function badgeClass(sig) {
  if (sig === 'buy' || sig === 'strong_buy' || sig === 'positive' || sig === 'strong_positive') return 'buy';
  if (sig === 'sell' || sig === 'strong_sell' || sig === 'negative' || sig === 'strong_negative') return 'sell';
  return 'neutral';
}

function signalLabel(sig) {
  const map = {
    buy: 'BUY', strong_buy: 'STRONG BUY', sell: 'SELL', strong_sell: 'STRONG SELL', neutral: 'NEUTRAL',
    positive: 'POSITIVE', strong_positive: 'STRONG POSITIVE',
    negative: 'NEGATIVE', strong_negative: 'STRONG NEGATIVE',
    bullish: 'BULLISH', bearish: 'BEARISH',
    overbought: 'OVERBOUGHT', oversold: 'OVERSOLD',
    high_volatility: 'HIGH VOL', low_volatility: 'LOW VOL', normal: 'NORMAL',
    excellent: 'EXCELLENT', good: 'GOOD', average: 'AVERAGE', poor: 'POOR',
    high_growth: 'HIGH GROWTH', steady_growth: 'STEADY', stable: 'STABLE', unknown: 'N/A',
    high: 'HIGH', low: 'LOW',
  };
  return map[sig] || sig?.toUpperCase() || '-';
}

function animateCards() {
  document.querySelectorAll('.card').forEach((el, i) => {
    setTimeout(() => el.classList.add('visible'), i * 80);
  });
}

function renderChart(priceHistory) {
  lastPriceHistory = priceHistory;

  const dates   = priceHistory.map(d => d.date);
  const candles = priceHistory.map(d => [d.open, d.close, d.low, d.high]);
  const closes  = priceHistory.map(d => d.close);
  const volumes = priceHistory.map(d => d.volume ?? 0);
  const sma20   = priceHistory.map(d => d.sma20 ?? null);
  const sma50   = priceHistory.map(d => d.sma50 ?? null);

  // インジケーター計算
  const bb      = computeBBHistory(closes);
  const rsiData = computeRSIHistory(closes);
  const macdD   = computeMACDHistory(closes);

  // 出来高色（陽線=緑 / 陰線=赤）
  const volColors = priceHistory.map(d =>
    d.close >= d.open ? 'rgba(76,175,125,0.6)' : 'rgba(224,92,92,0.6)'
  );

  const el = document.getElementById('priceChart');
  if (chartInstance) { chartInstance.dispose(); chartInstance = null; }
  chartInstance = echarts.init(el, null, { renderer: 'canvas' });

  // ── グリッド構成 ──
  // 表示するサブチャートに応じてダイナミックにグリッドを構築
  const showVol  = indVisible.volume;
  const showRSI  = indVisible.rsi;
  const showMACD = indVisible.macd;

  // 高さ配分（px, 580pxチャート想定）
  // メイン占有 = 残りをサブに分配
  const subCount = [showVol, showRSI, showMACD].filter(Boolean).length;
  const subH    = 90;  // 各サブ高さ(px)
  const subGap  = 12;
  const sliderH = 28;
  const topPad  = 36;
  const mainBottom = topPad + subCount * (subH + subGap) + sliderH + 16;
  const totalH  = 580;
  const mainH   = totalH - mainBottom - topPad;

  const grids = [{ left: 70, right: 20, top: topPad, height: mainH }];
  const xAxes = [{
    gridIndex: 0, type: 'category', data: dates,
    axisLine: { lineStyle: { color: '#2a2d3a' } },
    axisLabel: { show: false },
    splitLine: { show: false },
    axisTick: { show: false },
  }];
  const yAxes = [{
    gridIndex: 0, scale: true,
    axisLine: { lineStyle: { color: '#2a2d3a' } },
    axisLabel: { color: '#8b8fa8', fontSize: 10 },
    splitLine: { lineStyle: { color: '#2a2d3a', type: 'dashed' } },
  }];

  let gridTop = topPad + mainH + subGap;
  const subGridIndices = [];  // [vol, rsi, macd] -> gridIndex

  if (showVol) {
    const gi = grids.length;
    subGridIndices.push({ type: 'volume', gi });
    grids.push({ left: 70, right: 20, top: gridTop, height: subH });
    xAxes.push({ gridIndex: gi, type: 'category', data: dates, axisLine: { lineStyle: { color: '#2a2d3a' } }, axisLabel: { show: false }, splitLine: { show: false }, axisTick: { show: false } });
    yAxes.push({ gridIndex: gi, scale: false, axisLabel: { color: '#8b8fa8', fontSize: 9, formatter: v => v >= 1e6 ? (v / 1e6).toFixed(0) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v }, splitLine: { show: false }, axisLine: { show: false }, splitNumber: 2 });
    gridTop += subH + subGap;
  }
  if (showRSI) {
    const gi = grids.length;
    subGridIndices.push({ type: 'rsi', gi });
    grids.push({ left: 70, right: 20, top: gridTop, height: subH });
    xAxes.push({ gridIndex: gi, type: 'category', data: dates, axisLine: { lineStyle: { color: '#2a2d3a' } }, axisLabel: { show: false }, splitLine: { show: false }, axisTick: { show: false } });
    yAxes.push({ gridIndex: gi, min: 0, max: 100, axisLabel: { color: '#8b8fa8', fontSize: 9 }, splitLine: { lineStyle: { color: '#2a2d3a', type: 'dashed' } }, axisLine: { show: false }, splitNumber: 2 });
    gridTop += subH + subGap;
  }
  if (showMACD) {
    const gi = grids.length;
    subGridIndices.push({ type: 'macd', gi });
    grids.push({ left: 70, right: 20, top: gridTop, height: subH });
    xAxes.push({
      gridIndex: gi, type: 'category', data: dates,
      axisLine: { lineStyle: { color: '#2a2d3a' } },
      axisLabel: {
        color: '#8b8fa8', fontSize: 9,
        formatter: (val, idx) => idx === 0 || val.slice(8) === '01' ? val.slice(0, 7) : '',
      },
      splitLine: { show: false },
    });
    yAxes.push({ gridIndex: gi, scale: true, axisLabel: { color: '#8b8fa8', fontSize: 9 }, splitLine: { lineStyle: { color: '#2a2d3a', type: 'dashed' } }, axisLine: { show: false }, splitNumber: 2 });
    gridTop += subH + subGap;
  }

  // 最後のxAxisにラベルを表示（MACDがオフの場合）
  if (!showMACD && xAxes.length > 1) {
    const last = xAxes[xAxes.length - 1];
    last.axisLabel = {
      show: true, color: '#8b8fa8', fontSize: 9,
      formatter: (val, idx) => idx === 0 || val.slice(8) === '01' ? val.slice(0, 7) : '',
    };
  } else if (xAxes.length === 1) {
    xAxes[0].axisLabel = {
      show: true, color: '#8b8fa8', fontSize: 9,
      formatter: (val, idx) => idx === 0 || val.slice(8) === '01' ? val.slice(0, 7) : '',
    };
  }

  const allGridIndices = grids.map((_, i) => i);

  // ── シリーズ構成 ──
  const legendData = ['株価', 'SMA20', 'SMA50'];
  if (indVisible.bb) legendData.push('BB上限', 'BB下限');

  const series = [
    {
      name: '株価', type: 'candlestick', xAxisIndex: 0, yAxisIndex: 0,
      data: candles,
      itemStyle: { color: '#4caf7d', color0: '#e05c5c', borderColor: '#4caf7d', borderColor0: '#e05c5c' },
    },
    {
      name: 'SMA20', type: 'line', xAxisIndex: 0, yAxisIndex: 0,
      data: sma20, smooth: false, symbol: 'none',
      lineStyle: { color: '#f0b040', width: 1.5 },
    },
    {
      name: 'SMA50', type: 'line', xAxisIndex: 0, yAxisIndex: 0,
      data: sma50, smooth: false, symbol: 'none',
      lineStyle: { color: '#e07090', width: 1.5, type: 'dashed' },
    },
  ];

  if (indVisible.bb) {
    series.push(
      {
        name: 'BB上限', type: 'line', xAxisIndex: 0, yAxisIndex: 0,
        data: bb.upper, smooth: false, symbol: 'none',
        lineStyle: { color: '#5b9cf6', width: 1, type: 'dotted' },
      },
      {
        name: 'BB下限', type: 'line', xAxisIndex: 0, yAxisIndex: 0,
        data: bb.lower, smooth: false, symbol: 'none',
        lineStyle: { color: '#5b9cf6', width: 1, type: 'dotted' },
        areaStyle: { color: 'rgba(91,156,246,0.05)' },
      }
    );
  }

  // サブチャートシリーズ
  for (const { type, gi } of subGridIndices) {
    if (type === 'volume') {
      legendData.push('出来高');
      series.push({
        name: '出来高', type: 'bar', xAxisIndex: gi, yAxisIndex: gi,
        data: volumes.map((v, i) => ({ value: v, itemStyle: { color: volColors[i] } })),
        barMaxWidth: 8,
      });
    } else if (type === 'rsi') {
      legendData.push('RSI');
      series.push(
        {
          name: 'RSI', type: 'line', xAxisIndex: gi, yAxisIndex: gi,
          data: rsiData, smooth: false, symbol: 'none',
          lineStyle: { color: '#c792ea', width: 1.5 },
        },
        {
          name: 'RSI70', type: 'line', xAxisIndex: gi, yAxisIndex: gi,
          data: dates.map(() => 70), symbol: 'none',
          lineStyle: { color: '#e05c5c', width: 1, type: 'dashed', opacity: 0.5 },
          tooltip: { show: false }, legendHoverLink: false,
        },
        {
          name: 'RSI30', type: 'line', xAxisIndex: gi, yAxisIndex: gi,
          data: dates.map(() => 30), symbol: 'none',
          lineStyle: { color: '#4caf7d', width: 1, type: 'dashed', opacity: 0.5 },
          tooltip: { show: false }, legendHoverLink: false,
        }
      );
    } else if (type === 'macd') {
      legendData.push('MACD', 'シグナル');
      series.push(
        {
          name: 'MACDヒスト', type: 'bar', xAxisIndex: gi, yAxisIndex: gi,
          data: macdD.histogram.map(v => ({
            value: v,
            itemStyle: { color: v >= 0 ? 'rgba(76,175,125,0.7)' : 'rgba(224,92,92,0.7)' },
          })),
          barMaxWidth: 6,
        },
        {
          name: 'MACD', type: 'line', xAxisIndex: gi, yAxisIndex: gi,
          data: macdD.macdLine, smooth: false, symbol: 'none',
          lineStyle: { color: '#5b9cf6', width: 1.5 },
        },
        {
          name: 'シグナル', type: 'line', xAxisIndex: gi, yAxisIndex: gi,
          data: macdD.signalLine, smooth: false, symbol: 'none',
          lineStyle: { color: '#ff9966', width: 1.5 },
        }
      );
    }
  }

  // ── ラベル表示（サブチャートタイトル） ──
  const graphics = [];
  for (const { type, gi } of subGridIndices) {
    const g = grids[gi];
    const label = type === 'volume' ? '出来高' : type === 'rsi' ? 'RSI(14)' : 'MACD(12,26,9)';
    graphics.push({
      type: 'text', left: 72, top: g.top + 2,
      style: { text: label, fill: '#8b8fa8', fontSize: 9 },
    });
  }

  chartInstance.setOption({
    backgroundColor: 'transparent',
    animation: false,
    graphic: graphics,
    legend: {
      data: legendData.filter(n => !['RSI70','RSI30','MACDヒスト'].includes(n)),
      textStyle: { color: '#8b8fa8', fontSize: 10 },
      top: 4, right: 20,
      selectedMode: true,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', link: [{ xAxisIndex: 'all' }] },
      backgroundColor: '#1a1d27',
      borderColor: '#2a2d3a',
      textStyle: { color: '#e8eaf0', fontSize: 11 },
      formatter(params) {
        if (!params.length) return '';
        const date = params[0].axisValue;
        let html = `<div style="font-weight:bold;margin-bottom:4px">${date}</div>`;
        for (const p of params) {
          if (p.seriesName === 'RSI70' || p.seriesName === 'RSI30') continue;
          const v = Array.isArray(p.value) ? p.value : p.value;
          if (v === null || v === undefined) continue;
          const color = p.color?.colorStops ? '#5b9cf6' : (p.color || '#8b8fa8');
          const fmt = Array.isArray(v)
            ? `O:${v[0]} C:${v[1]} L:${v[2]} H:${v[3]}`
            : typeof v === 'number' ? v.toFixed(Math.abs(v) < 10 ? 4 : 0) : v;
          html += `<div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:4px"></span>${p.seriesName}: ${fmt}</div>`;
        }
        return html;
      },
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: grids,
    xAxis: xAxes,
    yAxis: yAxes,
    dataZoom: [
      { type: 'inside', xAxisIndex: allGridIndices, start: 0, end: 100 },
      {
        type: 'slider', xAxisIndex: allGridIndices,
        height: 20, bottom: 4,
        borderColor: '#2a2d3a', fillerColor: 'rgba(91,156,246,0.1)',
        textStyle: { color: '#8b8fa8', fontSize: 9 },
      },
    ],
    series,
  });

  window.removeEventListener('resize', chartInstance._resizeHandler);
  chartInstance._resizeHandler = () => chartInstance && chartInstance.resize();
  window.addEventListener('resize', chartInstance._resizeHandler);
}

function renderReport(data, isFromCache) {
  // 株情報
  document.getElementById('s-name').textContent = data.stock.name;
  document.getElementById('s-code').textContent = data.stock.code;
  document.getElementById('s-price').textContent =
    data.stock.current_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('s-ts').textContent =
    '取得時刻: ' + new Date(data.stock.timestamp).toLocaleString('ja-JP');

  // テクニカル
  document.getElementById('t-sma20').innerHTML = fmtNull(data.technical.sma_20);
  document.getElementById('t-sma50').innerHTML = fmtNull(data.technical.sma_50);
  document.getElementById('t-rsi').innerHTML = fmtNull(data.technical.rsi_14);
  document.getElementById('t-macd-line').innerHTML = fmtNull(data.technical.macd.line, '', 4);
  document.getElementById('t-macd-signal').innerHTML = fmtNull(data.technical.macd.signal, '', 4);
  document.getElementById('t-macd-hist').innerHTML = fmtNull(data.technical.macd.histogram, '', 4);
  document.getElementById('t-dev25').innerHTML = fmtNull(data.technical.ma_deviation_25, '%');

  const tSig = data.technical.signal;
  document.getElementById('t-signal-badge').innerHTML =
    `<span class="badge ${badgeClass(tSig)}">${signalLabel(tSig)}</span>`;
  const tScore = data.technical.score ?? 50;
  document.getElementById('t-score-text').textContent = `${tScore.toFixed(1)}%`;
  document.getElementById('t-score-bar').style.width = `${tScore}%`;
  document.getElementById('t-score-bar').style.background = signalColor(tSig);

  // ファンダメンタル
  document.getElementById('f-per').innerHTML = fmtNull(data.fundamental.per, 'x');
  document.getElementById('f-div').innerHTML = fmtNull(data.fundamental.dividend_yield, '%');

  const mcap = data.fundamental.market_cap;
  document.getElementById('f-market-cap').innerHTML = mcap != null
    ? (mcap >= 10000 ? Math.floor(mcap / 10000) + '兆' + Math.floor(mcap % 10000) + '億円' : mcap.toLocaleString() + '億円')
    : '<span class="null-val">N/A</span>';

  const fEps = data.fundamental.eps_growth;
  document.getElementById('f-eps-growth').innerHTML = fEps != null
    ? (fEps >= 0 ? '+' : '') + fEps.toFixed(1) + '%'
    : '<span class="null-val">N/A</span>';

  const fShinyo = data.fundamental.shinyo_bairitu;
  document.getElementById('f-shinyo').innerHTML = fShinyo != null
    ? fShinyo.toFixed(2) + '倍'
    : '<span class="null-val">N/A</span>';

  const fOm = data.fundamental.keijo_margin;
  document.getElementById('f-operating-margin').innerHTML = fOm != null
    ? fOm.toFixed(1) + '%'
    : '<span class="null-val">N/A</span>';

  document.getElementById('f-ytd').innerHTML = fmtNull(data.fundamental.ytd_performance, '%');

  const fSig = data.fundamental.signal;
  document.getElementById('f-signal-badge').innerHTML =
    `<span class="badge ${badgeClass(fSig)}">${signalLabel(fSig)}</span>`;
  const fScore = data.fundamental.score ?? 50;
  document.getElementById('f-score-text').textContent = `${fScore.toFixed(1)}%`;
  document.getElementById('f-score-bar').style.width = `${fScore}%`;
  document.getElementById('f-score-bar').style.background = signalColor(fSig);

  // テクニカル詳細カード
  const atr = data.technical.atr;
  document.getElementById('d-atr-val').innerHTML = atr?.atr != null ? fmtNull(atr.atr, '', 2) : '<span class="null-val">N/A</span>';
  document.getElementById('d-atr-sig').innerHTML = atr ? `<span class="badge ${badgeClass(atr.signal)}">${signalLabel(atr.signal)}</span>` : '';

  const bb = data.technical.bollinger_bands;
  document.getElementById('d-bb-val').innerHTML = bb?.upper != null
    ? `${bb.upper.toFixed(0)} / ${bb.middle.toFixed(0)} / ${bb.lower.toFixed(0)}`
    : '<span class="null-val">N/A</span>';
  document.getElementById('d-bb-sig').innerHTML = bb ? `<span class="badge ${badgeClass(bb.signal)}">${signalLabel(bb.signal)}</span>` : '';

  const ichi = data.technical.ichimoku;
  document.getElementById('d-ichi-val').innerHTML = ichi?.cloud_top != null
    ? `${ichi.cloud_bottom.toFixed(0)} ～ ${ichi.cloud_top.toFixed(0)}`
    : '<span class="null-val">N/A</span>';
  document.getElementById('d-ichi-sig').innerHTML = ichi ? `<span class="badge ${badgeClass(ichi.signal)}">${signalLabel(ichi.signal)}</span>` : '';

  // ファンダメンタル詳細カード
  const f = data.fundamental;
  document.getElementById('d-pbr-val').innerHTML = f.pbr != null ? f.pbr.toFixed(2) + 'x' : '<span class="null-val">N/A</span>';
  document.getElementById('d-pbr-eval').innerHTML = f.pbr != null
    ? `<span class="badge ${f.pbr < 1 ? 'buy' : f.pbr < 3 ? 'neutral' : 'sell'}">${f.pbr < 1 ? '割安' : f.pbr < 3 ? '普通' : '割高'}</span>`
    : '';

  document.getElementById('d-sales-val').innerHTML = f.sales_growth != null
    ? (f.sales_growth >= 0 ? '+' : '') + f.sales_growth.toFixed(1) + '%'
    : '<span class="null-val">N/A</span>';
  document.getElementById('d-sales-eval').innerHTML = f.sales_growth != null
    ? `<span class="badge ${f.sales_growth >= 10 ? 'buy' : f.sales_growth >= 0 ? 'neutral' : 'sell'}">${f.sales_growth >= 10 ? '高成長' : f.sales_growth >= 0 ? '安定' : '減収'}</span>`
    : '';

  document.getElementById('d-vol-val').innerHTML = f.avg_volume_20 != null
    ? f.avg_volume_20.toLocaleString() + '株'
    : '<span class="null-val">N/A</span>';

  // 総合
  const oSig = data.overall_signal;
  const oEl = document.getElementById('o-signal');
  oEl.textContent = signalLabel(oSig);
  oEl.className = `overall-signal-text ${badgeClass(oSig)}`;

  const oCard = document.getElementById('overall-card');
  oCard.classList.remove('sig-buy', 'sig-sell', 'sig-neutral');
  oCard.classList.add(`sig-${badgeClass(oSig)}`);

  const confidencePct = (data.confidence * 100);
  document.getElementById('o-confidence').textContent = `${confidencePct.toFixed(1)}%`;
  
  const oBar = document.getElementById('o-confidence-bar');
  if (oBar) {
    oBar.style.width = `${confidencePct}%`;
    oBar.style.background = signalColor(oSig);
  }

  // ─── v2.5 レポートセクション ───
  const rpt = data.report;
  if (rpt) {
    // テクニカルサマリー
    document.getElementById('r-tech-summary').innerHTML =
      (rpt.technical_summary || '').split('\n').map(l => `<p>${l}</p>`).join('');

    // ファンダメンタルサマリー
    document.getElementById('r-fund-summary').innerHTML =
      (rpt.fundamental_summary || '').split('\n').map(l => `<p>${l}</p>`).join('');

    // 買い根拠
    const buyEl = document.getElementById('r-buy-reasons');
    if (rpt.buy_reasons && rpt.buy_reasons.length > 0) {
      buyEl.innerHTML = rpt.buy_reasons.map(r =>
        `<div class="reason-item buy">
          <span class="reason-indicator">${r.indicator}</span>
          <span class="reason-detail">${r.detail}</span>
        </div>`
      ).join('');
    } else {
      buyEl.innerHTML = '<span class="null-val">買いシグナルなし</span>';
    }

    // 売り警告
    const sellEl = document.getElementById('r-sell-warnings');
    if (rpt.sell_warnings && rpt.sell_warnings.length > 0) {
      sellEl.innerHTML = rpt.sell_warnings.map(r =>
        `<div class="reason-item sell">
          <span class="reason-indicator">${r.indicator}</span>
          <span class="reason-detail">${r.detail}</span>
        </div>`
      ).join('');
    } else {
      sellEl.innerHTML = '<span class="null-val">警告なし</span>';
    }

    // リスク・リワード
    const rr = rpt.risk_reward || {};
    document.getElementById('rr-target').textContent =
      rr.reward_target != null ? `¥${rr.reward_target.toLocaleString()}` : 'N/A';
    document.getElementById('rr-reward-pct').textContent =
      rr.reward_percentage != null ? `+${rr.reward_percentage.toFixed(1)}%` : '';
    document.getElementById('rr-stop').textContent =
      rr.stop_loss != null ? `¥${rr.stop_loss.toLocaleString()}` : 'N/A';
    document.getElementById('rr-risk-pct').textContent =
      rr.risk_percentage != null ? `${rr.risk_percentage.toFixed(1)}%` : '';
    document.getElementById('rr-ratio').textContent =
      rr.risk_reward_ratio != null ? `${rr.risk_reward_ratio.toFixed(2)}` : 'N/A';
    document.getElementById('rr-evaluation').textContent = rr.evaluation || '';

    // 注目ポイント
    const fpEl = document.getElementById('r-focus-points');
    if (rpt.focus_points && rpt.focus_points.length > 0) {
      fpEl.innerHTML = rpt.focus_points.map(fp =>
        `<div class="focus-item">
          <div class="focus-header">
            <span class="focus-title">${fp.title}</span>
            <span class="focus-level">¥${fp.level != null ? fp.level.toLocaleString() : 'N/A'}</span>
            <span class="focus-importance">${'★'.repeat(fp.importance)}${'☆'.repeat(5 - fp.importance)}</span>
          </div>
          <p class="focus-desc">${fp.description}</p>
          <p class="focus-action">${fp.action}</p>
        </div>`
      ).join('');
    } else {
      fpEl.innerHTML = '<span class="null-val">データなし</span>';
    }

    // Q&A
    const qaEl = document.getElementById('r-qa');
    if (rpt.qa && rpt.qa.length > 0) {
      qaEl.innerHTML = rpt.qa.map(qa =>
        `<div class="qa-item">
          <div class="qa-q">${qa.question}</div>
          <div class="qa-a">${qa.answer}</div>
        </div>`
      ).join('');
    } else {
      qaEl.innerHTML = '<span class="null-val">データなし</span>';
    }

    // 総合判定テキスト
    document.getElementById('o-judgment').textContent = rpt.overall_judgment || '';
  }

  // 最終更新
  document.getElementById('last-updated').textContent =
    '最終更新: ' + new Date().toLocaleString('ja-JP');

  // キャッシュインジケーター
  const indicator = document.getElementById('cache-indicator');
  if (isFromCache) {
    document.getElementById('cache-time').textContent = getCacheTimestamp(currentCode);
    indicator.style.display = 'flex';
  } else {
    indicator.style.display = 'none';
  }

  // 先に表示してからチャートを描画（display:none だとサイズが 0 になるため）
  document.getElementById('report-area').style.display = 'block';
  document.querySelectorAll('.card').forEach(el => el.classList.remove('visible'));
  requestAnimationFrame(() => {
    renderChart(data.price_history);
    animateCards();
  });
}

// ── localStorage キャッシュ ──────────────────────────────────────────────────

const CACHE_DURATION = 3600000; // 1時間
const CACHE_PREFIX = 'stock_report_';

function getCachedReport(code) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + code);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_DURATION) {
      localStorage.removeItem(CACHE_PREFIX + code);
      return null;
    }
    return entry;
  } catch (e) {
    return null;
  }
}

function setCachedReport(code, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + code, JSON.stringify({ data, timestamp: Date.now(), code }));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      // 最も古いキャッシュを削除してリトライ
      const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
      if (keys.length > 0) {
        const oldest = keys.reduce((a, b) => {
          const at = JSON.parse(localStorage.getItem(a) || '{}').timestamp || 0;
          const bt = JSON.parse(localStorage.getItem(b) || '{}').timestamp || 0;
          return at < bt ? a : b;
        });
        localStorage.removeItem(oldest);
        try { localStorage.setItem(CACHE_PREFIX + code, JSON.stringify({ data, timestamp: Date.now(), code })); } catch (_) {}
      }
    }
  }
}

function getCacheTimestamp(code) {
  const entry = getCachedReport(code);
  return entry ? new Date(entry.timestamp).toLocaleString('ja-JP') : null;
}

function clearCacheForCode(code) {
  if (code) localStorage.removeItem(CACHE_PREFIX + code.trim().toUpperCase());
}

// ── エラーハンドリング ───────────────────────────────────────────────────────

function classifyError(status) {
  if (status === 429) return { type: 'rate_limit', retryable: true,  msg: '⏰ レート制限に達しました。しばらく後に再試行してください。' };
  if (status === 404) return { type: 'not_found',  retryable: false, msg: '❌ 銘柄が見つかりません。コードをご確認ください。' };
  if (status >= 500)  return { type: 'server',     retryable: true,  msg: '⚠️ サーバーエラーが発生しました。後ほど再度お試しください。' };
  return                     { type: 'unknown',    retryable: false, msg: `❌ エラーが発生しました (${status})` };
}

async function fetchWithRetry(url, maxRetries = 3) {
  const baseDelay = 1000;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (res.ok) return res;
      const { retryable } = classifyError(res.status);
      if (retryable && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
}

function handleFetchError(err, code) {
  const status = err.status;
  const { type, msg } = status ? classifyError(status) : { type: 'network', msg: '🌐 ネットワークエラー。接続をご確認ください。' };

  // エラーボックスにスタイルを付与
  const box = document.getElementById('error-box');
  box.className = type === 'rate_limit' ? 'error-rate-limit' : type === 'network' ? 'error-network' : '';

  // キャッシュフォールバック
  const cached = getCachedReport(code);
  if (cached) {
    renderReport(cached.data, true, code);
    showError(msg + `\n\n📦 キャッシュデータを表示しています（${getCacheTimestamp(code)}）`);
  } else {
    showError(err.message || msg);
  }
}

// ── 銘柄コード正規化 ─────────────────────────────────────────────────────────

// 銘柄コードを正規化（4桁の英数字なら .T を自動補完）
function normalizeCode(raw) {
  const code = raw.trim().toUpperCase();
  if (/^[A-Z0-9]{4}$/.test(code)) return code + '.T';
  return code;
}

// ── API 呼び出し ─────────────────────────────────────────────────────────────

let currentCode = '';

async function fetchReport() {
  const raw = document.getElementById('code-input').value.trim();
  if (!raw) { showError('銘柄コードを入力してください'); return; }
  const code = normalizeCode(raw);
  currentCode = code;
  document.getElementById('code-input').value = code;
  hideError();

  // localStorage キャッシュ確認
  const cached = getCachedReport(code);
  if (cached) {
    renderReport(cached.data, true, code);
    return;
  }

  setLoading(true);
  try {
    const res = await fetchWithRetry(`${API_BASE}/api/v2/report?code=${encodeURIComponent(code)}`);
    const data = await res.json();
    if (!res.ok) {
      const errMsg = data.error?.message || data.detail || `エラー: ${res.status}`;
      throw Object.assign(new Error(errMsg), { status: res.status });
    }
    setCachedReport(code, data);
    renderReport(data, false, code);
  } catch (e) {
    handleFetchError(e, code);
  } finally {
    setLoading(false);
  }
}

async function refreshReport() {
  const raw = document.getElementById('code-input').value.trim();
  if (!raw) { showError('銘柄コードを入力してください'); return; }
  const code = normalizeCode(raw);
  currentCode = code;
  document.getElementById('code-input').value = code;
  hideError();
  clearCacheForCode(code); // localStorage を削除して強制更新

  setLoading(true);
  try {
    const res = await fetchWithRetry(`${API_BASE}/api/v2/refresh?code=${encodeURIComponent(code)}`);
    const data = await res.json();
    if (!res.ok) {
      const errMsg = data.error?.message || data.detail || `エラー: ${res.status}`;
      throw Object.assign(new Error(errMsg), { status: res.status });
    }
    setCachedReport(code, data);
    renderReport(data, false, code);
  } catch (e) {
    handleFetchError(e, code);
  } finally {
    setLoading(false);
  }
}

// Enterキーでフェッチ
document.getElementById('code-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') fetchReport();
});

// キャッシュクリアボタン
document.getElementById('clear-cache-btn').addEventListener('click', () => {
  clearCacheForCode(currentCode);
  document.getElementById('cache-indicator').style.display = 'none';
});
