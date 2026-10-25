# batonz-cli

[BATONZ](https://batonz.jp/sell_cases/) の公開案件を検索・取得する非公式の TypeScript CLI です。画面で使われている内部 API から JSON を取得します。HTML の解析は行いません。

Node.js 22 以上と npm が必要です。まず「導入」と「案件を取得する」をお読みください。接続できない場合は「Chrome 経由で取得する」を参照してください。

## 導入

`npm link` でローカルの CLI を登録し、`batonz` コマンドとして使います。

```sh
git clone https://github.com/namiyama814/batonz-cli.git
cd batonz-cli
npm ci
npm run build
npm link
batonz --help
```

登録後は、どのディレクトリからでも `batonz` コマンドを実行できます。更新後は `npm ci` と `npm run build` を再実行してください。

npm パッケージとしては公開しません。`package.json` の `private: true` で公開を防ぎ、GitHub Actions にも公開処理を含めていません。

## 案件を取得する

```sh
batonz search カフェ
batonz search カフェ --page 2 --json
batonz search カフェ --transfer-range 7_5m_10m
batonz count カフェ --transfer-range 7_5m_10m --json
batonz show 96624
batonz show 96624 --json > case.json
```

検索語を省略すると、キーワードを指定せずに検索します。複数の金額帯は `--transfer-range` を繰り返して指定します。検索は1ページずつ取得し、全件巡回はしません。1ページの件数はサーバー側の設定に従います（調査時は30件）。

| オプション | 指定内容 | 既定値 |
| --- | --- | --- |
| `--page <number>` | 検索ページ。`search` のみ | `1` |
| `--transfer-range <range>` | 譲渡希望額の範囲。`search` と `count` | 指定なし |
| `--json` | 標準出力を JSON にする | 無効 |
| `--transport <mode>` | `http` または `chrome` | `http` |
| `--cdp-url <url>` | Chrome の接続先 | `http://127.0.0.1:9222` |
| `--timeout <ms>` | API取得・Chrome接続・初回画面読込それぞれの待ち時間 | `15000` |

### 譲渡希望額の指定値

| 値 | 金額帯 |
| --- | --- |
| `negotiable` | 応相談 |
| `0_1m` | 100万円未満 |
| `1m_3m` | 100万〜300万円 |
| `3m_5m` | 300万〜500万円 |
| `5m_7_5m` | 500万〜750万円 |
| `7_5m_10m` | 750万〜1,000万円 |
| `10m_20m` | 1,000万〜2,000万円 |
| `20m_30m` | 2,000万〜3,000万円 |
| `30m_50m` | 3,000万〜5,000万円 |
| `50m_75m` | 5,000万〜7,500万円 |
| `75m_100m` | 7,500万〜1億円 |
| `100m_250m` | 1億〜2.5億円 |
| `250m_500m` | 2.5億〜5億円 |
| `500m_1b` | 5億〜10億円 |
| `1b_` | 10億円以上 |

境界の扱いは BATONZ の API に従います。CLI 側で金額を再判定して結果を除外する処理はありません。

### JSON の形式

`search` は `{ "page": 2, "items": [...] }`、`count` は `{ "count": 107 }`、`show` は案件オブジェクトを返します。案件オブジェクトのフィールド名と追加フィールドは API の形式を保ちます。金額の `transferRawValue` は **万円単位**です。`null` や欠損は未公開として扱い、0万円とは区別します。

検索結果には `scope: "limited"` の会員限定案件の表示枠が含まれる場合があります。API が返した ID や公開日時だけを保持し、テキスト表示では「会員限定案件（詳細非公開）」と示します。件数は API の値で、これらの表示枠も含みます。JSON の案件フィールドは非公式 API の変更に伴って変わる可能性があります。

## Chrome 経由で取得する

HTTP で403になる場合は、リモートデバッグを有効にした Chrome に接続できます。CDP（Chrome DevTools Protocol）は、外部プログラムが Chrome を操作するための接続方式です。CLI によるブラウザの自動起動は行いません。

macOS の起動例です。普段のプロファイルとは別の専用ディレクトリを指定します。

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.batonz-cli-chrome" \
  https://batonz.jp/sell_cases/
```

Windows・Linux では Chrome の実行ファイルのパスを置き換えてください。デバッグポートはローカルの接続だけに使い、外部に公開しないでください。

```sh
batonz count カフェ --transport chrome
batonz search カフェ --transport chrome --cdp-url http://127.0.0.1:9222 --json
```

CLI は接続先の既定コンテキストに作業用タブを1つ作り、BATONZ を開いて同一オリジンの内部 API を呼び出します。API 呼び出しは `credentials: 'omit'` を指定し、ログイン Cookie を送りません。完了時は作業用タブを閉じ、接続を切断します。既存のタブやブラウザ本体は残ります。

Chrome 経由でもアクセスが許可されるとは限りません。2026-10-25 の検証では、通常の Chrome 画面と Node.js の HTTP 通信からの取得は成功しましたが、検証用に別途起動したヘッドレス Chrome と curl は403でした。403が続く場合は、その環境での取得を終了します。

## エラーと終了コード

取得結果は stdout、エラーは stderr に出します。`--json` 指定時もエラーは stderr のテキストです。自動リトライは行いません。

| 終了コード | 内容 |
| --- | --- |
| `0` | 成功。検索結果0件も成功 |
| `1` | 予期しないエラー |
| `2` | 引数の誤り |
| `3` | HTTP 403 |
| `4` | HTTP 404 |
| `5` | HTTP 429。時間を置いて再実行 |
| `6` | 通信・Chrome接続失敗、その他の HTTP エラー |
| `7` | JSONの解析失敗、APIレスポンスの形式変更 |
| `8` | API取得のタイムアウト |

## 開発と検証

```sh
npm run check
```

型チェック、fixture を使ったテスト、ビルドを実行します。通常のテストは実サイトにアクセスしません。GitHub Actions は Node.js 22 と24で同じチェックを実行します。

Google Chrome がインストールされている環境では、CDP接続の統合テストも実行できます。テスト専用ブラウザを起動し、BATONZ への通信を fixture で置き換えます。

```sh
BATONZ_TEST_CHROME=1 npm test
```

内部 API のパス、確認したレスポンス、実サイトでの検証結果は [API 調査メモ](docs/api.md) に記録しています。不具合は [GitHub Issues](https://github.com/namiyama814/batonz-cli/issues) に、コマンド・Node.js のバージョン・エラーコードを添えて報告してください。

ログイン、会員限定情報の取得、お気に入り変更、問い合わせ送信、全件収集、定期巡回は対象外です。利用時は BATONZ の利用条件とアクセス制限に従ってください。
