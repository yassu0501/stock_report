const API_BASE = '';
let chartInstance = null;

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
  const dates   = priceHistory.map(d => d.date);
  // ECharts ローソク足: [open, close, low, high]
  const candles = priceHistory.map(d => [d.open, d.close, d.low, d.high]);
  const sma20   = priceHistory.map(d => d.sma20 ?? '-');
  const sma50   = priceHistory.map(d => d.sma50 ?? '-');

  const el = document.getElementById('priceChart');

  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }

  chartInstance = echarts.init(el, null, { renderer: 'canvas' });

  chartInstance.setOption({
    backgroundColor: 'transparent',
    animation: false,
    legend: {
      data: ['株価', 'SMA20', 'SMA50'],
      textStyle: { color: '#8b8fa8', fontSize: 11 },
      top: 4,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: '#1a1d27',
      borderColor: '#2a2d3a',
      textStyle: { color: '#e8eaf0', fontSize: 11 },
    },
    grid: { left: 60, right: 20, top: 40, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: '#2a2d3a' } },
      axisLabel: {
        color: '#8b8fa8', fontSize: 10,
        // 月初のみ表示
        formatter: (val, idx) => {
          if (idx === 0 || val.slice(8) === '01') return val.slice(0, 7);
          return '';
        },
      },
      splitLine: { show: false },
    },
    yAxis: {
      scale: true,
      axisLine: { lineStyle: { color: '#2a2d3a' } },
      axisLabel: { color: '#8b8fa8', fontSize: 10 },
      splitLine: { lineStyle: { color: '#2a2d3a' } },
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', height: 20, bottom: 4,
        borderColor: '#2a2d3a', fillerColor: 'rgba(91,156,246,0.1)',
        textStyle: { color: '#8b8fa8' } },
    ],
    series: [
      {
        name: '株価',
        type: 'candlestick',
        data: candles,
        itemStyle: {
          color: '#4caf7d',        // 陽線（塗り）
          color0: '#e05c5c',       // 陰線（塗り）
          borderColor: '#4caf7d',
          borderColor0: '#e05c5c',
        },
      },
      {
        name: 'SMA20',
        type: 'line',
        data: sma20,
        smooth: false,
        symbol: 'none',
        lineStyle: { color: '#639922', width: 1.5, type: 'dashed' },
      },
      {
        name: 'SMA50',
        type: 'line',
        data: sma50,
        smooth: false,
        symbol: 'none',
        lineStyle: { color: '#e07090', width: 1.5, type: 'dashed' },
      },
    ],
  });

  // リサイズ対応
  window.addEventListener('resize', () => chartInstance && chartInstance.resize());
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

  const fEps = data.fundamental.eps_growth;
  document.getElementById('f-eps-growth').innerHTML = fEps != null
    ? (fEps >= 0 ? '+' : '') + fEps.toFixed(1) + '%'
    : '<span class="null-val">N/A</span>';

  const fShinyo = data.fundamental.shinyo_bairitu;
  document.getElementById('f-roe').innerHTML = fShinyo != null
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
