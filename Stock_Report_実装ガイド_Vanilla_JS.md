# Stock Report Generator - 機能1 & 10 実装プロンプト

## 📋 概要

このドキュメントは、**Vanilla JavaScript + HTML5 + CSS環境**で以下を実装するための詳細ガイドです：

- **機能1**: キャッシング機構（localStorage + サーバー側メモリキャッシュ）
- **機能10**: エラーハンドリング & フォールバック（リトライ + キャッシュ表示）

バックエンドは **Python Flask/FastAPI + yfinance** を想定しています。

---

## 🔧 機能1: キャッシング機構

### 1-1. 設計概要

```
ユーザー入力（銘柄コード）
  ↓
[フロント] localStorage キャッシュチェック
  ├→ キャッシュ有効（1時間以内） → キャッシュから読み込み（APIスキップ）
  └→ キャッシュ切れ/なし → API呼び出し
  ↓
[バック] yfinance からデータ取得 + メモリキャッシュ（server-side cache）
  ├→ キャッシュ有効期限: 1時間
  └→ メモリ節約: LRU キャッシュで最大30銘柄保持（Render無料枠）
  ↓
[フロント] レスポンス受信 → localStorage に保存（タイムスタンプ付き）
  ↓
画面表示 + 「✅ キャッシュデータ (2026-03-23 14:30)」を表示
```

### 1-2. フロント側実装（Vanilla JS）

#### a) キャッシュユーティリティモジュール

**ファイル: `js/cache.js`**

```javascript
/**
 * localStorage ベースのキャッシュマネージャー
 */

const CACHE_DURATION = 3600000;      // 1時間（ミリ秒）
const CACHE_KEY_PREFIX = 'stock_report_';

/**
 * キャッシュから取得
 * @param {string} code - 銘柄コード
 * @returns {Object|null} キャッシュデータまたはnull
 */
function getCachedReport(code) {
  try {
    const cached = localStorage.getItem(CACHE_KEY_PREFIX + code);
    if (!cached) return null;

    const data = JSON.parse(cached);
    const age = Date.now() - data.timestamp;

    // キャッシュ有効期限をチェック
    if (age > CACHE_DURATION) {
      localStorage.removeItem(CACHE_KEY_PREFIX + code);
      return null;
    }

    return data;
  } catch (error) {
    console.error('❌ Cache read error:', error);
    return null;
  }
}

/**
 * キャッシュに保存
 * @param {string} code - 銘柄コード
 * @param {Object} data - キャッシュするデータ
 */
function setCachedReport(code, data) {
  try {
    const cacheData = {
      data: data,
      timestamp: Date.now(),
      code: code
    };
    localStorage.setItem(CACHE_KEY_PREFIX + code, JSON.stringify(cacheData));
    console.log('✅ Cache saved:', code);
  } catch (error) {
    console.error('❌ Cache write error:', error);

    // localStorageクォータ超過時は古いキャッシュを削除
    if (error.name === 'QuotaExceededError') {
      clearOldestCache();
      try {
        localStorage.setItem(CACHE_KEY_PREFIX + code, JSON.stringify(cacheData));
      } catch (e) {
        console.error('❌ Cache write failed after cleanup:', e);
      }
    }
  }
}

/**
 * 最も古いキャッシュを削除（LRU削除）
 */
function clearOldestCache() {
  const allKeys = Object.keys(localStorage)
    .filter(k => k.startsWith(CACHE_KEY_PREFIX));

  if (allKeys.length === 0) return;

  // タイムスタンプが最も古いものを削除
  const oldest = allKeys.reduce((prev, current) => {
    const prevTime = JSON.parse(localStorage.getItem(prev) || '{}').timestamp || 0;
    const currTime = JSON.parse(localStorage.getItem(current) || '{}').timestamp || 0;
    return prevTime < currTime ? prev : current;
  });

  localStorage.removeItem(oldest);
  console.log('🗑️ Oldest cache cleared:', oldest);
}

/**
 * キャッシュのタイムスタンプを取得（日本語フォーマット）
 * @param {string} code - 銘柄コード
 * @returns {string|null} フォーマット済みのタイムスタンプ
 */
function getCacheTimestamp(code) {
  const cached = getCachedReport(code);
  return cached ? new Date(cached.timestamp).toLocaleString('ja-JP') : null;
}

/**
 * キャッシュをクリア
 * @param {string} code - 銘柄コード（省略時は全削除）
 */
function clearCache(code = null) {
  if (code) {
    localStorage.removeItem(CACHE_KEY_PREFIX + code);
    console.log('🗑️ Cache cleared for:', code);
  } else {
    Object.keys(localStorage)
      .filter(k => k.startsWith(CACHE_KEY_PREFIX))
      .forEach(k => localStorage.removeItem(k));
    console.log('🗑️ All cache cleared');
  }
}

/**
 * 全キャッシュキーを取得（デバッグ用）
 * @returns {string[]} キャッシュキーの配列
 */
function getAllCachedCodes() {
  return Object.keys(localStorage)
    .filter(k => k.startsWith(CACHE_KEY_PREFIX))
    .map(k => k.replace(CACHE_KEY_PREFIX, ''));
}
```

#### b) HTMLマークアップ

**ファイル: `index.html`** (抜粋)

```html
<div class="header">
  <h1>Stock Report Generator</h1>

  <div class="input-section">
    <input
      type="text"
      id="stockCode"
      placeholder="例: 7203 または AAPL"
      autocomplete="off"
    >
    <button id="getReportBtn" class="btn btn-primary">レポート取得</button>
    <button id="refreshBtn" class="btn btn-secondary">更新</button>
  </div>
</div>

<!-- キャッシュ状態表示 -->
<div id="cacheIndicator" style="display:none;" class="cache-indicator">
  <div class="cache-info">
    ✅ キャッシュデータ <span id="cacheTime"></span>
  </div>
  <button id="clearCacheBtn" class="btn btn-small">クリア</button>
</div>

<!-- エラー表示 -->
<div id="errorMessage" style="display:none;" class="error-message"></div>

<!-- ローディング状態 -->
<div id="loadingState" style="display:none;" class="loading-state">
  <div class="spinner">⏳</div>
  <p>データを取得中...</p>
</div>

<!-- レポート表示領域 -->
<main id="reportContent" style="display:none;">
  <!-- レポートコンテンツはJavaScriptで動的に生成 -->
</main>
```

#### c) JavaScriptのロジック統合

**ファイル: `js/app.js`**

```javascript
/**
 * Stock Report Generator - メインアプリケーションロジック
 */

// DOM要素の取得
const stockCodeInput = document.getElementById('stockCode');
const getReportBtn = document.getElementById('getReportBtn');
const refreshBtn = document.getElementById('refreshBtn');
const cacheIndicator = document.getElementById('cacheIndicator');
const cacheTimeSpan = document.getElementById('cacheTime');
const clearCacheBtn = document.getElementById('clearCacheBtn');
const errorMessage = document.getElementById('errorMessage');
const reportContent = document.getElementById('reportContent');
const loadingState = document.getElementById('loadingState');

/**
 * レポート取得メイン関数
 * @param {string} code - 銘柄コード
 * @param {boolean} forceRefresh - 強制更新フラグ
 */
async function fetchReport(code, forceRefresh = false) {
  code = code.trim().toUpperCase();

  if (!code) {
    showError('銘柄コードを入力してください');
    return;
  }

  // Step 1: キャッシュチェック（強制更新でない場合）
  if (!forceRefresh) {
    const cached = getCachedReport(code);
    if (cached) {
      console.log('✅ キャッシュから読み込み');
      displayReport(cached.data, true, code);
      hideError();
      return;
    }
  }

  // Step 2: API呼び出し
  showLoading(true);
  hideError();

  try {
    const response = await fetchWithRetry(
      `/api/report/detailed?code=${encodeURIComponent(code)}`
    );

    if (!response.ok) {
      // エラーレスポンスを解析
      let errorData = {};
      try {
        errorData = await response.json();
      } catch (e) {
        // JSONパースエラーの場合は無視
      }

      throw {
        status: response.status,
        message: errorData.error?.message || `HTTP ${response.status}`,
        details: errorData.error?.details || {}
      };
    }

    const data = await response.json();

    // Step 3: キャッシュに保存
    setCachedReport(code, data);
    displayReport(data, false, code);
  } catch (err) {
    // エラー処理（機能10で詳述）
    handleFetchError(err, code);
  } finally {
    showLoading(false);
  }
}

/**
 * レポートを画面に表示
 * @param {Object} data - レポートデータ
 * @param {boolean} isFromCache - キャッシュからの読み込みか
 * @param {string} code - 銘柄コード
 */
function displayReport(data, isFromCache, code) {
  // キャッシュ状態表示
  if (isFromCache) {
    cacheIndicator.style.display = 'flex';
    cacheTimeSpan.textContent = getCacheTimestamp(code);
  } else {
    cacheIndicator.style.display = 'none';
  }

  // レポートコンテンツを生成
  reportContent.style.display = 'block';
  reportContent.innerHTML = `
    <section class="report-summary">
      <h2>${data.name || data.code}</h2>
      <div class="current-price">
        <strong>現在株価:</strong> ¥${data.current_price?.toLocaleString() || 'N/A'}
      </div>

      <div class="metrics-grid">
        <div class="metric-card">
          <h3>総合判定</h3>
          <p class="value">${data.overall_judgment || 'N/A'}</p>
        </div>
        <div class="metric-card">
          <h3>信頼度</h3>
          <p class="value">${data.confidence || 0}%</p>
        </div>
      </div>

      <!-- テクニカル分析セクション -->
      <div class="section">
        <h3>テクニカル分析</h3>
        <div class="technical-indicators">
          <p><strong>SMA (20日):</strong> ${data.sma_20?.toFixed(2) || 'N/A'}</p>
          <p><strong>SMA (50日):</strong> ${data.sma_50?.toFixed(2) || 'N/A'}</p>
          <p><strong>RSI (14日):</strong> ${data.rsi?.toFixed(2) || 'N/A'}</p>
        </div>
        <!-- ECharts チャート -->
        <div id="chart" style="width: 100%; height: 400px;"></div>
      </div>

      <!-- ファンダメンタル分析セクション -->
      <div class="section">
        <h3>ファンダメンタル分析</h3>
        <div class="fundamental-data">
          <p><strong>PER:</strong> ${data.pe_ratio?.toFixed(2) || 'N/A'}</p>
          <p><strong>配当利回り:</strong> ${(data.dividend_yield * 100)?.toFixed(2) || 0}%</p>
          <p><strong>ROE:</strong> ${data.roe?.toFixed(2) || 'N/A'}</p>
        </div>
      </div>
    </section>
  `;

  // チャートの描画（ECharts）
  if (data.chart_data) {
    renderChart(data.chart_data);
  }
}

/**
 * エラーメッセージを表示
 * @param {string} message - エラーメッセージ
 */
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
}

/**
 * エラーメッセージを非表示
 */
function hideError() {
  errorMessage.style.display = 'none';
}

/**
 * ローディング状態を表示/非表示
 * @param {boolean} isLoading - ローディング中か
 */
function showLoading(isLoading) {
  if (isLoading) {
    loadingState.style.display = 'block';
    getReportBtn.disabled = true;
    refreshBtn.disabled = true;
    getReportBtn.textContent = '取得中...';
  } else {
    loadingState.style.display = 'none';
    getReportBtn.disabled = false;
    refreshBtn.disabled = false;
    getReportBtn.textContent = 'レポート取得';
  }
}

/**
 * ECharts チャート描画
 * @param {Object} chartData - チャートデータ
 */
function renderChart(chartData) {
  const chartContainer = document.getElementById('chart');
  if (!chartContainer) return;

  const chart = echarts.init(chartContainer);
  const option = {
    title: { text: '1年間の株価推移' },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: Object.keys(chartData).slice(-252) // 過去1年（営業日）
    },
    yAxis: { type: 'value' },
    series: [{
      data: Object.values(chartData).slice(-252),
      type: 'line',
      smooth: true,
      areaStyle: { color: 'rgba(46, 117, 182, 0.2)' },
      itemStyle: { color: '#2E75B6' }
    }]
  };

  chart.setOption(option);
  window.addEventListener('resize', () => chart.resize());
}

// ============ イベントリスナー登録 ============

getReportBtn.addEventListener('click', () => {
  fetchReport(stockCodeInput.value, false);
});

refreshBtn.addEventListener('click', () => {
  fetchReport(stockCodeInput.value, true); // 強制更新
});

stockCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    fetchReport(stockCodeInput.value, false);
  }
});

clearCacheBtn.addEventListener('click', () => {
  clearCache(stockCodeInput.value);
  cacheIndicator.style.display = 'none';
  showError(`✅ キャッシュをクリアしました: ${stockCodeInput.value}`);
});

// 初期化ログ
console.log('✅ Stock Report Generator initialized');
console.log('📦 Cached codes:', getAllCachedCodes());
```

### 1-3. バック側実装（Flask + Python）

#### a) キャッシュマネージャー

**ファイル: `backend/utils/cache.py`**

```python
import time
import logging

logger = logging.getLogger(__name__)

class CacheManager:
    """メモリベースのLRUキャッシュマネージャー"""

    def __init__(self, max_items=50, ttl_seconds=3600):
        """
        Args:
            max_items: キャッシュの最大アイテム数
            ttl_seconds: キャッシュの有効期限（秒）
        """
        self.cache = {}
        self.timestamps = {}
        self.max_items = max_items
        self.ttl_seconds = ttl_seconds

    def get(self, key: str):
        """
        キャッシュから値を取得
        TTLチェックを実施して期限切れなら削除
        """
        if key not in self.cache:
            return None

        # TTLチェック
        age = time.time() - self.timestamps[key]
        if age > self.ttl_seconds:
            logger.info(f"Cache expired for {key} (age: {age:.0f}s)")
            self.delete(key)
            return None

        logger.info(f"Cache hit for {key}")
        return self.cache[key]

    def set(self, key: str, value):
        """
        キャッシュに値を設定
        キャパシティ超過時は最も古いものを削除（LRU）
        """
        # LRU削除: キャパシティ超過時は最も古いものを削除
        if len(self.cache) >= self.max_items and key not in self.cache:
            oldest_key = min(
                self.timestamps.keys(),
                key=lambda k: self.timestamps[k]
            )
            logger.info(f"Cache full, removing oldest: {oldest_key}")
            self.delete(oldest_key)

        self.cache[key] = value
        self.timestamps[key] = time.time()
        logger.info(f"Cache set for {key}")

    def delete(self, key: str):
        """キャッシュから削除"""
        self.cache.pop(key, None)
        self.timestamps.pop(key, None)

    def clear(self):
        """すべてのキャッシュをクリア"""
        self.cache.clear()
        self.timestamps.clear()
        logger.info("All cache cleared")

    def get_info(self):
        """キャッシュ情報を取得（デバッグ用）"""
        return {
            'size': len(self.cache),
            'max_items': self.max_items,
            'keys': list(self.cache.keys()),
            'ttl_seconds': self.ttl_seconds
        }

# グローバルキャッシュインスタンス
# Renderの無料枠に合わせて max_items=30 で設定
cache_manager = CacheManager(max_items=30, ttl_seconds=3600)
```

#### b) APIエンドポイント

**ファイル: `backend/app.py`** (Flask)

```python
from flask import Flask, request, jsonify
import yfinance as yf
import pandas as pd
from utils.cache import cache_manager
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

@app.route('/api/report/detailed', methods=['GET'])
def get_detailed_report():
    """
    詳細レポート取得エンドポイント
    GET /api/report/detailed?code=7203
    """
    code = request.args.get('code', '').strip().upper()

    if not code:
        return jsonify({
            'error': {
                'type': 'invalid_input',
                'message': '銘柄コードが指定されていません'
            }
        }), 400

    # Step 1: サーバー側キャッシュをチェック
    cached_report = cache_manager.get(code)
    if cached_report:
        logger.info(f'✅ Cache hit for {code}')
        return jsonify({
            **cached_report,
            'cache_status': 'hit',
            'cache_timestamp': datetime.now().isoformat(),
        }), 200

    # Step 2: yfinance からデータ取得
    try:
        logger.info(f'📊 Fetching data for {code} from yfinance...')

        # Tickerオブジェクト作成
        ticker = yf.Ticker(code)

        # 基本情報取得
        info = ticker.info
        hist = ticker.history(period='1y')

        # データ検証
        if hist.empty:
            logger.warning(f'No data found for {code}')
            return jsonify({
                'error': {
                    'type': 'not_found',
                    'message': f'銘柄 \'{code}\' のデータが見つかりません'
                }
            }), 404

        # テクニカル指標計算
        close_prices = hist['Close']
        sma_20 = float(close_prices.rolling(20).mean().iloc[-1])
        sma_50 = float(close_prices.rolling(50).mean().iloc[-1])

        # RSI計算
        def calculate_rsi(prices, period=14):
            deltas = prices.diff()
            seed = deltas[:period+1]
            up = seed[seed >= 0].sum() / period
            down = -seed[seed < 0].sum() / period
            rs = up / down if down != 0 else 0
            rsi = 100 - (100 / (1 + rs)) if rs >= 0 else 0
            return float(rsi)

        rsi = calculate_rsi(close_prices, 14)

        # ファンダメンタルデータ抽出
        pe_ratio = info.get('trailingPE')
        dividend_yield = info.get('dividendYield', 0)
        roe = info.get('returnOnEquity')

        # レポート作成
        report = {
            'code': code,
            'name': info.get('longName', code),
            'currency': info.get('currency', 'JPY'),
            'current_price': float(info.get('currentPrice', 0)),
            'sma_20': sma_20,
            'sma_50': sma_50,
            'rsi': rsi,
            'pe_ratio': pe_ratio,
            'dividend_yield': dividend_yield,
            'roe': roe,
            'chart_data': hist['Close'].to_dict(),
            'overall_judgment': 'Buy' if rsi < 30 else 'Sell' if rsi > 70 else 'Hold',
            'confidence': 75,
            'timestamp': datetime.now().isoformat(),
        }

        # Step 3: キャッシュに保存
        cache_manager.set(code, report)

        return jsonify({
            **report,
            'cache_status': 'miss',
        }), 200

    except Exception as e:
        logger.error(f'❌ Error fetching data: {str(e)}')
        return jsonify({
            'error': {
                'type': 'fetch_error',
                'message': f'データ取得エラー: {str(e)}',
                'code': code
            }
        }), 500

@app.route('/api/cache/info', methods=['GET'])
def get_cache_info():
    """キャッシュ情報を取得（デバッグ用）"""
    return jsonify(cache_manager.get_info()), 200

@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    """キャッシュをクリア（デバッグ用）"""
    code = request.args.get('code')
    if code:
        cache_manager.delete(code)
        return jsonify({'message': f'キャッシュをクリア: {code}'}), 200
    else:
        cache_manager.clear()
        return jsonify({'message': 'すべてのキャッシュをクリア'}), 200

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000)
```

---

## 🚨 機能10: エラーハンドリング & フォールバック

### 10-1. エラー分類

| エラータイプ | ステータス | 原因 | ハンドリング |
|----------|---------|------|-----------|
| **Rate Limit** | 429 | APIレート制限 | キャッシュ使用 + 指数バックオフリトライ |
| **Not Found** | 404 | 銘柄が見つからない | ユーザーメッセージ + キャッシュ提供 |
| **Network Error** | - | タイムアウト、接続エラー | リトライ + キャッシュフォールバック |
| **Server Error** | 500+ | サーバーエラー | キャッシュフォールバック |
| **Unknown** | その他 | 予期しないエラー | ユーザーメッセージ |

### 10-2. フロント側実装（エラーハンドリング）

**ファイル: `js/errorHandler.js`**

```javascript
/**
 * エラー分類とハンドリング
 */

const ErrorTypes = {
  RATE_LIMIT: 'rate_limit',
  NOT_FOUND: 'not_found',
  NETWORK: 'network',
  SERVER: 'server',
  UNKNOWN: 'unknown'
};

/**
 * エラーを分類
 * @param {Error} error - エラーオブジェクト
 * @param {number} statusCode - HTTPステータスコード（オプション）
 * @returns {Object} 分類されたエラー情報
 */
function classifyError(error, statusCode) {
  if (statusCode === 429) {
    return {
      type: ErrorTypes.RATE_LIMIT,
      message: '⏰ APIレート制限に達しました。1分後に再試行してください。',
      retryable: true,
      retryAfterSeconds: 60
    };
  }

  if (statusCode === 404) {
    return {
      type: ErrorTypes.NOT_FOUND,
      message: '❌ 指定した銘柄が見つかりません。銘柄コードをご確認ください。',
      retryable: false
    };
  }

  if (error.name === 'AbortError' || (error.message && error.message.includes('timeout'))) {
    return {
      type: ErrorTypes.NETWORK,
      message: '🌐 ネットワークエラー。接続をご確認ください。',
      retryable: true
    };
  }

  if (statusCode && statusCode >= 500) {
    return {
      type: ErrorTypes.SERVER,
      message: '⚠️ サーバーエラーが発生しました。後ほど再度お試しください。',
      retryable: true
    };
  }

  return {
    type: ErrorTypes.UNKNOWN,
    message: `❌ エラーが発生しました: ${error.message || 'Unknown'}`,
    retryable: false
  };
}

/**
 * リトライ機能付き fetch
 * 指数バックオフで リトライします
 * @param {string} url - リクエストURL
 * @param {Object} options - fetchオプション
 * @param {number} maxRetries - 最大リトライ回数
 * @returns {Promise<Response>} fetchレスポンス
 */
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  const baseDelay = 1000; // 1秒

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(10000) // 10秒タイムアウト
      });

      if (response.ok) {
        return response;
      }

      // ステータスコードエラーの分類
      const classified = classifyError(new Error(), response.status);

      if (classified.retryable && attempt < maxRetries) {
        const delayMs = baseDelay * Math.pow(2, attempt); // 指数バックオフ
        console.log(`🔄 リトライ ${attempt + 1}/${maxRetries} (${delayMs}ms後)...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      return response; // リトライ不可 or 最大リトライ数に達した
    } catch (err) {
      const classified = classifyError(err, null);

      if (classified.retryable && attempt < maxRetries) {
        const delayMs = baseDelay * Math.pow(2, attempt);
        console.log(`🔄 リトライ ${attempt + 1}/${maxRetries} (${delayMs}ms後)...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      throw err;
    }
  }
}

/**
 * fetch エラーをハンドル
 * @param {Error|Object} error - エラーオブジェクト
 * @param {string} code - 銘柄コード
 */
function handleFetchError(error, code) {
  const fallbackCache = getCachedReport(code);

  // エラーメッセージを構成
  let errorDisplay = error.message || '予期しないエラーが発生しました';

  // リトライ可能なら追加情報を表示
  if (error.retryable) {
    errorDisplay += '\n💡 後ほど再度お試しください。';
  }

  // キャッシュがあればフォールバック表示
  if (fallbackCache) {
    console.log('💾 キャッシュからフォールバック表示');
    displayReport(fallbackCache.data, true, code);
    errorDisplay += `\n\n📦 キャッシュデータを表示しています (${getCacheTimestamp(code)})`;
  }

  showError(errorDisplay);
}
```

### 10-3. バック側実装（エラーハンドリング）

**ファイル: `backend/error_handlers.py`**

```python
from flask import jsonify
from datetime import datetime

class APIError(Exception):
    """API エラーの統一フォーマット"""

    def __init__(self, error_type, message, status_code, details=None):
        self.error_type = error_type
        self.message = message
        self.status_code = status_code
        self.details = details or {}

    def to_dict(self):
        return {
            'error': {
                'type': self.error_type,
                'message': self.message,
                'status_code': self.status_code,
                'timestamp': datetime.now().isoformat(),
                'details': self.details
            }
        }

def register_error_handlers(app):
    """Flask アプリケーションにエラーハンドラーを登録"""

    @app.errorhandler(429)
    def handle_rate_limit(error):
        resp = APIError(
            'rate_limit',
            'APIレート制限に達しました。1分後に再度お試しください。',
            429,
            {'retry_after_seconds': 60}
        )
        return jsonify(resp.to_dict()), 429

    @app.errorhandler(404)
    def handle_not_found(error):
        resp = APIError(
            'not_found',
            'リソースが見つかりません。',
            404
        )
        return jsonify(resp.to_dict()), 404

    @app.errorhandler(500)
    def handle_server_error(error):
        resp = APIError(
            'server_error',
            'サーバーでエラーが発生しました。',
            500
        )
        return jsonify(resp.to_dict()), 500

    @app.errorhandler(Exception)
    def handle_generic_error(error):
        resp = APIError(
            'unknown',
            '予期しないエラーが発生しました。',
            500,
            {'exception': str(error)}
        )
        return jsonify(resp.to_dict()), 500
```

**ファイル: `backend/app.py`** (エラーハンドラー統合)

```python
from flask import Flask
from error_handlers import register_error_handlers
import logging

app = Flask(__name__)

# エラーハンドラー登録
register_error_handlers(app)

# ロギング設定
logging.basicConfig(level=logging.INFO)

# ... その他のコード ...

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000)
```

---

## 🎨 CSS スタイル

**ファイル: `css/errors.css`**

```css
/**
 * エラーハンドリング関連のスタイル
 */

.error-message {
  background: #ffebee;
  border-left: 4px solid #f44336;
  padding: 16px;
  margin: 12px 0;
  border-radius: 4px;
  color: #c62828;
  white-space: pre-line;
  line-height: 1.6;
  font-size: 14px;
}

.error-message.error-rate-limit {
  background: #fff3e0;
  border-left-color: #ff9800;
  color: #e65100;
}

.error-message.error-network {
  background: #eceff1;
  border-left-color: #607d8b;
  color: #37474f;
}

.cache-indicator {
  background: #e8f5e9;
  border-left: 4px solid #4caf50;
  padding: 12px 16px;
  margin: 12px 0;
  border-radius: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #2e7d32;
}

.cache-info {
  flex: 1;
}

.btn-small {
  padding: 6px 12px;
  background: #f44336;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  transition: opacity 0.2s;
}

.btn-small:hover {
  opacity: 0.9;
}

.loading-state {
  text-align: center;
  padding: 40px 0;
}

.spinner {
  font-size: 48px;
  animation: spin 1s linear infinite;
  display: inline-block;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* ボタンスタイル */
.btn {
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-primary {
  background: #4caf50;
  color: white;
}

.btn-primary:hover {
  background: #45a049;
}

.btn-primary:disabled {
  background: #cccccc;
  cursor: not-allowed;
}

.btn-secondary {
  background: #999999;
  color: white;
}

.btn-secondary:hover {
  background: #888888;
}
```

---

## 🧪 テスト方法

### キャッシング機能のテスト

ブラウザのDeveloper Tools を使用：

1. **キャッシュの確認**
   ```javascript
   // コンソールで実行
   Object.keys(localStorage).filter(k => k.startsWith('stock_report_'))
   ```

2. **キャッシュの動作確認**
   - 同じ銘柄を2回リクエスト
   - Network タブで2回目のAPIリクエストがないことを確認
   - Console で "✅ キャッシュから読み込み" が表示される

3. **キャッシュ有効期限のテスト**
   - キャッシュを手動で編集して timestamp を古くする
   - 再度APIを呼ぶと新しいデータが取得される

### エラーハンドリングのテスト

1. **404エラーのテスト**
   ```
   銘柄コード: INVALID999
   期待: "指定した銘柄が見つかりません" エラーメッセージ表示
   ```

2. **ネットワークエラーのシミュレーション**
   - DevTools > Network > Offline に設定
   - レポート取得を実行
   - キャッシュがあればフォールバック表示される

3. **レート制限のテスト**
   - 短時間に複数のAPIリクエストを送信
   - リトライロジックが動作することを確認

---

## 📋 実装チェックリスト

- [ ] キャッシュユーティリティ（`js/cache.js`）を実装
- [ ] HTMLマークアップを追加
- [ ] メインロジック（`js/app.js`）を実装
- [ ] バック側キャッシュマネージャー（`backend/utils/cache.py`）を実装
- [ ] APIエンドポイントにキャッシュロジックを統合
- [ ] エラーハンドリング（`js/errorHandler.js`）を実装
- [ ] リトライロジックを実装
- [ ] バック側エラーハンドラー（`backend/error_handlers.py`）を実装
- [ ] CSSスタイル（`css/errors.css`）を追加
- [ ] ローカルでテスト実施
- [ ] Renderにデプロイしてテスト

---

## 🚀 デプロイ時の注意点

### 環境変数設定（Render Dashboard）

```
CACHE_TTL=3600          # キャッシュ有効期限（秒）
CACHE_MAX_ITEMS=30      # キャッシュの最大アイテム数（メモリ節約）
FLASK_ENV=production    # Flask 本番環境
```

### メモリ制限への対応

Renderの無料枠は512MBなので、キャッシュサイズを制限：

| 環境 | 推奨 max_items |
|------|--------------|
| 開発環境 | 100 |
| 本番環境（Render無料枠） | 30 |

### ログ監視

Render の Logs セクションで確認：

- ✅ キャッシュヒット率（"✅ Cache hit" の出現頻度）
- エラー発生頻度
- API応答時間

---

## 🎯 次のステップ

1. **機能2-9の実装**：多銘柄比較、ウォッチリスト など
2. **パフォーマンス最適化**：画像圧縮、lazy loading など
3. **モニタリング**：Google Analytics、Sentry などの統合

---

以上です。各ファイルのパスを確認して、プロジェクト構造に合わせて実装してください！ 🚀
