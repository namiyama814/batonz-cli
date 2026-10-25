# 内部 API 調査メモ

調査日: 2026-10-25（日本時間）

BATONZ の公式 API ではありません。[案件一覧画面](https://batonz.jp/sell_cases/) の検索・ページ送り・詳細表示の通信を、Chrome の CDP Network イベントとレスポンス本文で確認しました。Chrome DevTools MCP はプロファイル競合で接続できなかったため、Chrome 接続ツールの CDP 機能を使いました。

## 利用する API

すべて `https://batonz.jp` を起点にした GET リクエストです。

| 用途 | パス | 確認したレスポンス |
| --- | --- | --- |
| 検索 | `/api/v2/sell_cases` | `sellCases` 配列と画面用メタデータ |
| 件数 | `/api/v2/sell_cases/count` | `{ "count": 1711 }` |
| 詳細 | `/api/v2/sell_cases/96624` | `{ "canonical": null, "sellCase": {...} }` |

画面が送ったパラメータは `q`（キーワード）、`page`（1始まりのページ番号）、`undecorate=true` です。画面の操作種別を示す `trigger=submit` / `trigger=pager` も観測しましたが、取得に不要であることを確認したため CLI からは送りません。

譲渡希望額は `transfer_value_ranges[]=7_5m_10m` のように指定します。画面内の金額帯リンクから指定値を確認し、API の件数と画面の件数も照合しました。

## 実サイトでの検証結果

- 「カフェ」の件数は1,711件。
- 「カフェ」＋`7_5m_10m` の件数は107件。画面の同条件の件数も107件。
- 同条件の2ページ目は30枠、先頭の案件IDは77612。会員限定案件の表示枠が3枠含まれていた。
- 案件96624は画面で800万円、詳細 API で `transferRawValue: 800`。このフィールドは万円単位。
- 検索結果の会員限定枠は、`id`、`openedAt`、`meaningfulUpdatedAt`、`scope: "limited"` のみ。タイトルや金額を補完しない。
- 公開詳細は `description`、`productFeature`、`businessFlow`、`organizationFeature`、`sellingPoint` などを返す。閲覧できない財務情報を推測して埋めない。

値や件数は調査時点のものです。fixture は API 構造を再現した架空の案件で、実際の案件本文はリポジトリに保存していません。

## 通信と互換性

Node.js の `fetch` で検索・件数・詳細を確認しました。curl と、新規プロファイルで起動したヘッドレス Chrome は403でした。通常の Chrome の CDP 経由では `credentials: 'omit'` で API の取得が成功しました。接続環境による制限を、ログインの必要性と同一視しないでください。

通信処理は `src/transport.ts`、クエリ構築・レスポンスの検証は `src/client.ts` に分離しています。必須フィールドがなくなった場合や、利用する金額フィールドの型が変わった場合は終了コード7で停止します。追加フィールドは保持します。

Chrome 接続には Playwright の [connectOverCDP](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp) を使用します。作業用タブを閉じた後、接続したブラウザの [close](https://playwright.dev/docs/api/class-browser#browser-close) で接続を切断します。既存タブとブラウザ本体が残ることを統合テストで確認しています。
