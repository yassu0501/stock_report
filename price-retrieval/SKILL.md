---
name: バックテストツールでの価格取得方法 (Price Retrieval Method)
description: stock_backtestプロジェクトにおける、Yahoo Finance APIを用いた株価データ（ヒストリカルデータおよび最新価格）の取得アーキテクチャ・ロジックをまとめたスキル。
---

# バックテストツールでの価格取得方法 (Price Retrieval Method)

このプロジェクト（`stock_backtest`）では、CORSエラーを回避し、APIのレート制限（Rate Limit）や一時的なエラーに堅牢に対応するため、Node.jsのプロキシサーバーを経由してYahoo Finance API（v8）から株価データを取得しています。

## 1. 全体アーキテクチャ

*   **クライアント (`app.js` 等)**:
    JavaScriptの `fetch()` を用いて、ローカルのプロキシサーバーにデータ取得をリクエストします。
*   **プロキシサーバー (`server.js`)**:
    リクエストを受け取り、Yahoo Finance API（`query1.finance.yahoo.com`）へリクエストを転送します。データの整形、エラーによるリトライ、キャッシングなどを担当します。

## 2. 実装されているAPIエンドポイント (server.js)

### A. ヒストリカルデータ取得 (`/api/stock`)
*   **目的**: バックテスト用の過去の日足データ（OHLCV）を指定期間（例: 1y, 6mo）で取得。
*   **Yahoo API 呼び出し先**: `https://query1.finance.yahoo.com/v8/finance/chart/[ticker]?interval=1d&period1=[start]&period2=[end]&events=history&includeAdjustedClose=true`
*   **主要な処理**:
    *   `period`（1y, 6mo等）をUnixタイムスタンプの `period1` と `period2` に変換。
    *   取得した調整後終値（`adjclose`）と通常の終値の比率を用いて、始値（Open）・高値（High）・安値（Low）を株式分割等を補正した値に再計算。
    *   データの欠損や値が0の行を除外するフィルタリング処理。

### B. 最新株価取得 (`/api/stock-price/:code`)
*   **目的**: 機関投資家分析や現在の株価評価用に、最新の単一価格情報を取得。
*   **Yahoo API 呼び出し先**: `https://query1.finance.yahoo.com/v8/finance/chart/[ticker]?interval=1d&range=1d`
*   **主要な処理**:
    *   取得したJSONから `meta.regularMarketPrice` などを抽出。
    *   **10分間のメモリキャッシュ (`priceCache`)** を利用し、短期間での同一銘柄へのアクセスによる負荷を軽減。
    *   APIリクエスト前に意図的に2秒間の待機（`setTimeout`）を差し込み、Yahoo側からのブロックを防ぐレート制限対策を実施。

## 3. 安定化・高可用性のための工夫

### 3.1. 銘柄コードの正規化 (`normalizeTicker`)
Yahoo Financeが受け付けるシンボル形式に統一するための処理（`server.js` 内）。
*   末尾の `.t`（小文字）を `.T` に変換。
*   4桁の数字のみの場合は自動的に `.T` を付与。
*   主要な指数を安定して取得できるティッカーにマッピング:
    *   `日経平均` / `N225` → `^N225`
    *   `TOPIX` → `1306.T`（指数の^TPXよりETFの方がデータが安定しているため）
    *   `マザーズ` / `グロース250` → `2516.T`
    *   米国株指数（S&P500 → `^GSPC` など）

### 3.2. リトライ機能とエクスポネンシャルバックオフ (`fetchWithRetry`)
ヒストリカルデータ取得時に通信エラーが発生した際の自動再試行ロジック。
*   **対象エラー**: 429 (Rate Limit)、503 (Service Unavailable)、タイムアウト、ネットワークエラー等。
*   **再試行回数**: 最大3回。
*   **待機時間**: 1.5秒 → 3.0秒 → 4.5秒 と再試行のたびに間隔を広げる（Exponential Backoffの類似手法）。

### 3.3 HTTPリクエストの偽装
リクエスト拒否（403 Forbidden）を避けるため、Node.jsからのリクエストヘッダーに一般的なブラウザの `User-Agent` を設定しています。

```javascript
headers: {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}
```

## 4. このスキルを活用する場面

*   他のツールやスクリプトで、同じようにYahoo Finance APIからデータを取得したい場合。
*   `server.js` の取得ロジックの改善（例えば、取得対象データを週足に広げたいなど）を行う場合。
*   新しい指標やリアルタイム性が必要なモジュールをフロントエンドに追加し、プロキシサーバーと連携させる場合。
