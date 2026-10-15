# A.R.T ADMIN — 非公開日次ファネル保存

状態（2026-10-15）：**PR #49 / #50は統合済み。Cronは本人が23:30 JSTに設定・保存済み。本番の集計成功は未確認。**
Issue #51の読取記録ではFunnelは旧14列のヘッダーのみでデータ行なし。作成やCron設定を繰り返さず、Workerのデプロイ版と実行ログを先に確認する。以下の導入手順は初期構築用であり、完了済み操作の再実施指示ではない。

## 収集契約

- 保存先はSPACE FLOW DESIGN専用Googleアカウントの非公開 `A.R.T ADMIN - DAILY ACQUISITION`。別の仕事のDriveに作成・保存・共有しない。
- タブ `Funnel`、A1:P1は下記の固定ヘッダー。旧14列（Statusまで）は互換入力として許容し、全GA4取得成功後の単一batchでO/Pを追加する。それ以外の列名不一致は誤書込防止のため停止する。

```text
DateJST,Window,GeneratedAtUTC,VISITORS,SIGNUP_VIEW,SIGNUPS,TOOL_START,RegisterRatePct,ToolStartRatePct,SourceX,SourceNote,SourceDirect,SourceOther,Status,SourceYouTube,SourceSearch
```

- DateJST＝集計終了日(JST)、Window＝`1d`／`7d`、GeneratedAtUTC＝取得日時(ISO 8601 UTC)。7dは終了日とその6日前の計7暦日。プロパティのタイムゾーンがAsia/Tokyoであることを応答で確認し、不一致時は書込を止める。
- 獲得数は既存GA4 closed funnelの順次通過ユニークユーザー数。日別人数を足して7日UUにしない。X/note/YouTube/SEARCH/direct/otherは別単位のセッション数。
- 登録率＝SIGNUPS/VISITORS×100、利用開始率＝TOOL_START/SIGNUPS×100。分母0は空欄、日報では「算出不可」。
- 毎日23:30 JST (`30 14 * * *` UTC)。当日と過去7日の各1d/7dを再計測し16行をupsert。初回も過去データを取得する。
- 同一DateJST・Windowは上書き。既存重複行は自動削除せずエラーで停止。Cronは1本だけにし、手動再実行と重ねない（Sheetsは分散ロックを持たない）。
- 全GA4応答を検証してから1回のbatchUpdate。HTTP失敗・不正な応答・期間切れの応答キャッシュ・取得上限による欠落を0人として成功保存しない。既存成功行を保持する。
- 正しいスキーマの空応答は「GA4で報告された0人」として暫定記録する。GA4遅延による未反映と、本当に訪問がない状態はAPI応答だけで判別できない。
- 当日は「暫定・当日途中」、1〜2日前は「暫定・後日再集計」、3日以上前も「再集計済・確定保証なし」。GA4から確定保証は得られないため自動で確定とは書かない。しきい値・サンプリング等の制限応答は書込せず停止する。
- UID、メール、個人別データ、録音、Room情報を保存しない。公開エンドポイントは追加しない。Firebase管理者認証・既存HTTPハンドラ・Tool本体を変更しない。
- 既存ADMINの7dは従来の`7daysAgo`〜today（8暦日）のまま。本変更は日次保存側だけを正しい7暦日にする。既存画面とSheetsの7dは比較期間が異なるため、数値一致を合格条件にしない。画面側の修正は今回行わない。

## 本番導入手順

1. 本人認証したCloudflareで `art-admin-analytics-api` の現行コード・バージョン・Bindings・既存Cronを確認し、本リポジトリmainと照合。差分があれば上書き前に確認する。秘密鍵は表示・抽出しない。
2. SPACE FLOW DESIGN用Googleアカウントを確認して非公開Sheetを作成。本人が所有し、`Funnel!A1:P1`を上記ヘッダーにする。列A:C/Nはテキスト（O/Pはセッション数）。百分率列H:Iは既に0〜100の値なので百分率表示形式で再度100倍しない。
3. 既存GA4サービスアカウント `GA_CLIENT_EMAIL` を確認し、このSheetだけにEditorを付与。リンク共有は制限付き。不要な他の共有を作らない。
4. `art-admin-ba592` とサービスアカウントの所属を確認し、Google Sheets APIを有効化。GA4 Property `557622748` の既存閲覧権限を維持。API有効化のために新しい課金契約を作らない。
5. Workerに `ART_DAILY_SHEET_ID` を設定。既存 `GA_CLIENT_EMAIL`、`GA_PRIVATE_KEY`、`GA4_PROPERTY_ID`、`FIREBASE_PROJECT_ID`、`ALLOWED_ORIGIN`を保持。秘密鍵をGitHub/Sheets/チャットへ転記しない。Sheets用scopeは日次書込時だけ要求し、管理画面はanalytics.readonlyを維持する。
6. PRをマージし、`worker/analytics-api.js` をWorker本番へデプロイ。GitHub PagesのデプロイとWorkerのデプロイは別。元Workerバージョンを復旧先として記録する。
7. Cron `30 14 * * *` を1本登録。重複Cronがないことを確認。Cloudflareの反映待ちを考慮し、成功イベントを確認する。開発用ローカルscheduled URLを本番公開しない。
8. 本人認証済み管理手段でscheduledを試験実行するか、次のCron実行を確認。16行の取得と同日再実行の上書き、1d/7d、JST日付、サービスアカウント以外に追加共有がないことを確認。API未認証拒否と既存ADMINログイン後表示を検証する。
9. ChatGPTのGoogle Drive接続先をSPACE FLOW DESIGN用に切り替える/接続する本人操作を行い、プロフィールとSheet所有者を再照合。対象Sheetをコネクタで実際に読み取る。ブラウザだけでGoogleログインしてもChatGPTのDriveコネクタ接続は変わらない。
10. 既存00:00 JSTの日報タスクを下記契約で更新し、実データで日報を試作して確認する。全工程が終わるまで「利用可能」と報告しない。

## 日報読取契約（実数接続後に既存タスクへ追加）

- 既存タスクID `6ab7ec4e5be88191bce8f6102aa81cc9` は毎日00:00 JST、有効を確認済み。新しい重複タスクは作らない。
- 実行日の前日を対象日Dとする。例：10/14 00:00の日報は10/13 23:30のD=10/13を読む。10/13 00:00は10/12分なので、10/13初回Cronより先に実行される。初回手動取得なしでは間に合わない。
- D/1d、D/7d、D−1/1d、D−1/7d、D−7/7dを読む。Dの行がない、重複する、GeneratedAtが当該バッチの取得日時でない場合は「未取得／更新遅延」。直近の別日を当日実績として代用しない。
- 23:30時点は1日が終了していない。前日との差は「当日途中対前日全日」の参考比較であり、改善/悪化の確定判断に使わない。GA4反映遅延も明記。
- 前段移行率＝V→閲覧、閲覧→登録、登録→開始。累積率＝各段階/V。分母0は算出不可。前日比較は人数差と可能なら率差（ポイント）を併記。
- 7dの人数/移行率を併記し、前日終了7dとの変化、必要ならD−7終了7dとの前週比較を示す。UU/7を「日平均UU」にしない。D/1dとD/7dは期間が違うので人数の直接増減率を出さない。
- 流入元はX/note/YouTube/SEARCH/direct/otherのセッション表を別枠にする。
- 最多離脱段階は隣接段階の人数差で判定。率も併記し、同数は同率、全て0なら離脱箇所特定不可。母数が小さい場合、原因を断定しない。
- 翌日の具体的改善案は観測された段階に対応した1案と検証指標を出す。実数なしは数値根拠のある改善案を捏造しない。
- 非公開データをX投稿本文へ自動転載しない。

## 2026-10-12 作業記録

- AGENTS.md、SPACE_FLOW_WORKFLOW.md、TESTING.md、mainとPR #49のWorkerをレビュー。
- 日次7暦日の指定、過去7日再集計、batch upsert、応答検証、ゼロ分母、Sheets OAuth scope分離を追加。
- `node tests/analytics-daily.mjs` PASS（合成応答）。JST日付、7日範囲、closed funnel、流入単位、再実行、翌日追加、GA4失敗/不正応答/タイムゾーン不一致で既存行維持、空応答、重複/ヘッダー、401/403、scheduledTimeを検証。
- 既存7スイート中6つPASS。`tests/regression.mjs` はHTML抽出箇所で `SyntaxError: Unexpected token '<'`。修正前コミットc1e5921の別worktreeでも同じ失敗を再現。今回と無関係なのでテストを変更して通したことにしない。
- Cloudflareはログイン画面。現在のGoogle Driveコネクタは別の仕事用であるとプロフィール照合済み。ファイル作成・保存・共有は一切行っていない。
- 本番デプロイ、Cron、Sheets URL、実データ、ChatGPT読取、実数日報テストは未完了。日報タスク本体はまだ変更していない。

参考：
- https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/
- https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1alpha/properties/runFunnelReport
- https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/ResponseMetaData


## 2026-10-15 無人検証結果（Issue #51）

- main `935e208` の日次テストは旧行保存のassertで失敗を再現。10/13実行時に10/11は再集計対象なのに不変を期待していた。Workerのupsert仕様ではなくテストfixtureの誤り。
- 保存確認を期間外の10/01に変更し、期間内10/11は16列へ更新・重複なしを確認。32回目のGA4読取失敗、取得上限による欠落、しきい値制限、Sheets読取/書込403、Sheet ID未設定も検査する。
- Workerの実装変更は不要と判断。逐次再実行はupsertするが、並行実行の分散ロックはない。既存方針どおりCronは1本、手動実行と重ねない。並行安全を検証済みとはしない。
- Cloudflareの読取を試したが `https://dash.cloudflare.com/login` へ遷移。デプロイ版・Cronログ・Bindings・実数は未確認。秘密鍵の表示・操作、本番書込は実施していない。
- 旧14列のままという事実だけでは原因確定不可。GA4検証失敗などで最後のbatch書込まで到達しない場合もヘッダーは旧状態に残る。

### 次の最小確認（本番変更前）

1. Cloudflare → Workers & Pages → `art-admin-analytics-api` → Deploymentsで有効版を確認し、mainのWorkerと照合する。秘密値は開かない。
2. 同WorkerのObservability / Logsで23:30 JST（14:30 UTC）のscheduledイベントを確認する。表示名は管理画面により異なる。成功/失敗とエラーの種類だけ記録し、秘密や生の認証応答を転載しない。
3. `ART_DAILY_SHEET_ID` missing、Sheets HTTP 403、GA4応答エラー、timezone、headerなど、実ログが示す原因だけ対処案を作る。ログがなければ実行の有無も未確認のまま。
4. Worker反映・権限/秘密設定変更が必要な場合のみ本人承認を得る。保存済みCronの再設定・ヘッダーの手動移行は不要。成功後は16列・16データ行と同日再実行での重複なしを確認する。
