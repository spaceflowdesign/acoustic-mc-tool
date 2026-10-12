# A.R.T ADMIN — 非公開日次ファネル保存（準備中）

状態：**未デプロイ、未稼働**。本PRは既存A.R.T ADMIN APIに手を加えず、Cloudflare CronからGoogle Sheetsへ集計のみを書き出すための準備である。管理画面の認証緩和や公開用URLの新設はしない。

## 前提

- 保存先：**SPACE FLOW DESIGN専用Googleアカウント内の非公開Google Sheets**。別の仕事のGoogle Driveには保存しない。
- シート名：`Funnel`。A1:N1ヘッダー：
  `DateJST, Window, GeneratedAtUTC, VISITORS, SIGNUP_VIEW, SIGNUPS, TOOL_START, RegisterRatePct, ToolStartRatePct, SourceX, SourceNote, SourceDirect, SourceOther, Status`
- 1日分（`1d`・`7d`）をその日のJST日付で記録。同じDateJST・Windowの行があれば上書きし、無制限の重複行を避ける。
- **獲得数はユニークユーザーが順に通過したGA4 closed funnel**。X/note/direct/otherはセッション。元ユーザー情報・録音・UID・メールは含まない。
- 当日 `1d` は遅延を考慮して「暫定」と表示。7dは当日を含む。前日分の確定比較が必要な場合は別途後日修正フローを追加する（本PRでは未実装）。

## 初回のみ必要な設定（オーナーまたは本人認証済みWork）

1. SPACE FLOW DESIGNのGoogle Driveで非公開Spreadsheetを作成し、上記`Funnel`ヘッダーを設置。保存先を公衆に共有しない。
2. Cloudflareに既に設定されている `GA_CLIENT_EMAIL` のサービスアカウントへ**そのSheet一つだけ**編集者権限を付与。
3. Google Cloud project `art-admin-ba592` にGoogle Sheets APIを有効化。既存のGA4 Data API有効設定は維持。
4. Cloudflare Worker `art-admin-analytics-api` の環境変数に `ART_DAILY_SHEET_ID` （非公開SheetのID）を設定。メール／ユーザーID／秘密鍵を新たに貼らない。既存`GA_PRIVATE_KEY`を流用し、OAuth取得スコープだけSheet用を追加する。
5. 本PRをレビュー・マージした後、Cloudflareへ`worker/analytics-api.js`をデプロイ。**既存の認証付き`/api/funnel`が正常動作することを再確認**。
6. Cloudflare Worker Cron trigger `30 13 * * *`（UTC＝JST22:30）を追加。Cloudflare CronはUTC。翌日の日報生成前にデータが更新されることを確認。
7. 1回試験実行して`Funnel`に`1d`・`7d`の2行が追加されること、ユーザーID等がないこと、本人以外から非公開であることを確認する。無認証APIが引き続き401/403であることも確認。
8. ChatGPTのGoogle DriveをSPACE FLOW DESIGN用アカウントに接続して`Funnel!A:N`を読み取り、日報のA.R.T ADMIN欄に実測値・計測日時・前段移行率・流入セッションを反映する。現在接続済みの別事業のDriveを流用しない。

## 検証・制限

- このPRには**Cloudflareへのデプロイ、Cron登録、Google Sheets作成／共有、GA4実データ取得は含まれない**。外部の認証済み操作が必要。
- 新しいCloudflare Workerの公開エンドポイントは作らない。Schedulerハンドラだけを追加する。
- Firebase管理者認証方式とGA4 closed funnelは既存実装を維持。
- Sheets APIが403ならサービスアカウントの当該SheetへのEditor共有とAPI有効化を確認。
- 出力が空なら「0人」と「GA4未反映」を区別。取得失敗はScheduler失敗としてログで検知し、成功記録を偽装しない。
- 予定運用はCloudflare無料枠等の規定確認を前提とし、追加課金を承認なく有効化しない。
