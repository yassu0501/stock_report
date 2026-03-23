# Stock Report Generator

リアルタイム株式テクニカル・ファンダメンタル分析レポートを生成する FastAPI + バニラ JS アプリケーション。

---

## 概要

Stock Report Generator は、yfinance を通じて株式データを取得し、SMA・RSI・MACD などのテクニカル指標と PER・配当利回り・年初来パフォーマンスなどのファンダメンタル指標を組み合わせた総合的な売買シグナルを提供します。

### 主な機能

- **テクニカル分析**: SMA (20/50日)、RSI (14日)、MACD (12/26/9)
- **ファンダメンタル分析**: PER、配当利回り、年初来パフォーマンス
- **総合シグナル**: テクニカル 60% + ファンダメンタル 40% の加重スコアリング
- **30日チャート**: SMA20・SMA50 オーバーレイ付き価格チャート
- **インメモリキャッシュ**: TTL 60秒 のキャッシュでレスポンスを高速化
- **スタンドアロン UI**: Chart.js を使用したシングルページアプリケーション

---

## 対応銘柄

yfinance でサポートされているすべての銘柄に対応します。

- 日本株: `7203.T`（トヨタ自動車）、`9984.T`（ソフトバンク）など
- 米国株: `AAPL`、`GOOGL`、`TSLA` など
- ETF: `SPY`、`QQQ` など

---

## クイックスタート

### 必要環境

- Python 3.11 以上
- pip

### セットアップ

```bash
# 1. リポジトリをクローン（またはファイルを配置）
cd /path/to/株レポート

# 2. 仮想環境を作成・有効化
python -m venv venv
source venv/bin/activate       # macOS / Linux
# venv\Scripts\activate.bat    # Windows

# 3. 依存パッケージをインストール
pip install -r requirements.txt

# 4. サーバーを起動
python main.py
```

サーバーが起動したら、ブラウザで `index.html` を開いてください。

```
open index.html    # macOS
```

または、任意の HTTP サーバーで配信してください。

```bash
python -m http.server 3000
# → http://localhost:3000 でアクセス
```

---

## API 使用例

### ヘルスチェック

```bash
curl http://localhost:8000/health
```

レスポンス:
```json
{
  "status": "ok",
  "timestamp": "2026-03-23T10:00:00.000000"
}
```

### レポート取得

```bash
curl "http://localhost:8000/api/report?code=7203.T"
```

レスポンス例:
```json
{
  "stock": {
    "code": "7203.T",
    "name": "Toyota Motor Corporation",
    "current_price": 3215.50,
    "timestamp": "2026-03-23T10:00:00.000000"
  },
  "technical": {
    "sma_20": 3180.25,
    "sma_50": 3050.10,
    "rsi_14": 58.3,
    "macd": {
      "line": 42.1,
      "signal": 38.5,
      "histogram": 3.6
    },
    "signal": "buy"
  },
  "fundamental": {
    "per": 10.2,
    "dividend_yield": 2.8,
    "ytd_performance": 5.3,
    "signal": "positive"
  },
  "overall_signal": "buy",
  "confidence": 0.75,
  "price_history": [
    {"date": "2026-02-22", "close": 3100.00},
    ...
  ]
}
```

### キャッシュを無効化して最新データ取得

```bash
curl "http://localhost:8000/api/refresh?code=7203.T"
```

### キャッシュ状態確認

```bash
curl http://localhost:8000/api/cache-info
```

レスポンス:
```json
{
  "total_entries": 2,
  "keys": ["report:7203.T", "report:AAPL"]
}
```

---

## プロジェクト構成

```
株レポート/
├── main.py                    # FastAPI アプリケーション本体
├── models.py                  # Pydantic v2 データモデル
├── indicators.py              # テクニカル指標計算（SMA/EMA/RSI/MACD）
├── fundamental.py             # ファンダメンタルデータ取得
├── cache.py                   # インメモリキャッシュ
├── test_indicators.py         # ユニットテスト
├── index.html                 # フロントエンド UI
├── requirements.txt           # Python 依存パッケージ
├── README.md                  # このファイル
├── TECHNICAL_SPECIFICATION.md # 技術仕様書
├── DEPLOYMENT_GUIDE.md        # デプロイガイド
├── QA_TEST_PLAN.md            # QA テスト計画書
└── PROJECT_COMPLETION_REPORT.md # プロジェクト完成報告書
```

---

## テスト実行

```bash
python test_indicators.py
```

正常時の出力例:
```
============================================================
Stock Report Generator - テクニカル指標テスト
============================================================

[テスト] SMA基本計算テスト
  [PASS] SMA基本計算

[テスト] データ不足時のSMAテスト
  [PASS] SMAデータ不足時のNone返却

...

テスト結果: 16/16 PASS
全テスト PASS
============================================================
```

---

## API 自動ドキュメント

サーバー起動後、以下の URL でインタラクティブな API ドキュメントにアクセスできます。

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

## トラブルシューティング

### サーバーが起動しない

```
Error: No module named 'fastapi'
```

仮想環境が有効化されているか確認し、`pip install -r requirements.txt` を再実行してください。

### 銘柄データが取得できない（404 エラー）

- 銘柄コードが正しいか確認してください（日本株の場合 `.T` サフィックスが必要）
- インターネット接続を確認してください
- yfinance はリアルタイムではなく 15〜20 分遅延のデータを使用します

### フロントエンドが API に接続できない

- `index.html` 内の `API_BASE` が `http://localhost:8000` になっているか確認
- サーバーが起動しているか確認（`curl http://localhost:8000/health`）
- ブラウザのコンソールで CORS エラーが出ていないか確認

### RSI/MACD が N/A と表示される

取得できた価格データが計算に必要なデータ数に不足している場合、N/A が表示されます。
- RSI は 15 本以上の価格データが必要
- MACD は 26 本以上の価格データが必要

通常は十分な履歴が取得されますが、上場直後の銘柄では N/A になる場合があります。

### Python バージョンエラー

このアプリケーションは Python 3.11 以上を対象としています。
`list[float]` などの組み込み型ヒントは Python 3.9+ で使用可能です。

```bash
python --version  # 3.11.x 以上であることを確認
```

---

## ライセンス

本プロジェクトは社内利用を目的として作成されています。
yfinance の利用規約および Yahoo Finance の利用規約に従って使用してください。
