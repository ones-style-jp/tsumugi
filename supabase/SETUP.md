# Supabase セットアップ手順 (Phase 1: 家族認証のみ)

> 目的: 家族の **端末越しログイン** を可能にする
> 範囲: 家族アカウント + 招待コード のみ Supabase で管理。利用者/事業所/記録データは引き続き localStorage。

## 全体の流れ (4 STEP)

1. **Supabase プロジェクト作成**
2. **SQL を実行 (1 ファイルだけ)**
3. **URL と Anon Key を Vercel に登録 (2 つ)**
4. **再デプロイで完了**

---

## STEP 1: Supabase プロジェクト

すでに Pro プランがあるなら、新規プロジェクト作成だけでよい:

1. https://supabase.com/dashboard → 「New project」
2. プロジェクト名: `tsumugi-prod` (任意)
3. データベースパスワード: 強いものを生成 (安全な場所に保存)
4. リージョン: **Tokyo (ap-northeast-1)** を選択 (日本ユーザーの遅延を最小化)
5. プランは Pro でOK
6. 「Create new project」

数分待つとプロジェクト準備完了。

---

## STEP 2: SQL 実行 (2ファイル)

1. 左サイドバー → 「**SQL Editor**」
2. 「New query」 → [`supabase/00_family_auth_minimal.sql`](./00_family_auth_minimal.sql) の中身を全コピー → 貼り付け → 「**Run**」
3. もう一度 「New query」 → [`supabase/05_app_state.sql`](./05_app_state.sql) の中身を全コピー → 貼り付け → 「**Run**」
4. それぞれエラーが出なければ完了
   - 00 の結果: `family_accounts | 0` と `family_invites | 0`
   - 05 の結果: `app_state | 1 (initial row)`

> ⚠️ `01_schema.sql` ～ `04_seed.sql` は **Phase 2 用** (将来のフル移行用)。今は実行しない。

---

## STEP 3: Vercel 環境変数を 2 つ追加

### 必要な値を取得

1. Supabase ダッシュボード → 左サイドバー一番下「**Project Settings**」 → 「**API**」
2. 以下 2 つをコピー:
   - **Project URL**: `https://xxxxxxxxxxxxxxxx.supabase.co`
   - **anon (public) API Key**: `eyJhbGciOi...` (長い文字列)

> 注: `service_role` キーは絶対に使わない (フロントエンドに露出するため anon のみ)

### Vercel に登録

1. https://vercel.com/ons-style/tsumugi → 「Settings」 → 「Environment Variables」
2. 以下 2 つを追加 (Brevo の時と同じ手順):

| Key | Value | Environments |
|-----|-------|-------------|
| `VITE_SUPABASE_URL` | (上で取得した Project URL) | Production, Preview |
| `VITE_SUPABASE_ANON_KEY` | (上で取得した anon キー) | Production, Preview |

---

## STEP 4: 再デプロイ

環境変数を追加しただけでは反映されないため、再デプロイが必要:

1. Vercel ダッシュボード → 「Deployments」
2. 最新のデプロイ右の「⋯」→ 「**Redeploy**」 → 「Redeploy」
3. ~1分待つ

---

## 動作確認

1. プレビュー URL を開く
2. スタッフ画面で利用者を選択 → 「家族アカウント発行・管理」 → メール招待
3. メールが届く → URL を **別の端末** (PC で発行したならスマホ) で開く
4. 必要事項を入力して登録
5. **別の端末** でログイン画面に行き、登録した ID/パスワードでログイン → **成功すれば完了 ✅**

---

## トラブルシューティング

### 「Supabase 未接続」と出る
→ 環境変数が反映されていない。Vercel で再デプロイ。

### 「IDまたはパスワードが違います」が別端末で出る
→ Supabase に同期されていない可能性。ブラウザの DevTools コンソールを開き、`[supabase] login fallback` などのエラーを確認。SQL が走っていない、または環境変数の Project URL/Key が間違っている可能性。

### 「招待コードが見つかりません」が新端末で出る
→ 招待が Supabase 側に push されていない。スタッフ画面で **新しい招待を再発行** すれば、新しい招待は Supabase にも保存される。

---

## Phase 2 以降 (将来)

- `01_schema.sql` のフルスキーマを適用
- 利用者/記録データを localStorage → Supabase に移行
- Supabase Auth に切り替え (現在の SHA-256 ハッシュより堅牢)
- 画像を Supabase Storage に保存
- RLS を本格化 (anon フル CRUD → 適切なポリシー)
