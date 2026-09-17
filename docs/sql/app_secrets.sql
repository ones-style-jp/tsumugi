-- つむぎ: サーバー専用の秘密情報テーブル(Claude APIキー等)
-- 実行場所: Supabase ダッシュボード → SQL Editor → 貼り付けて Run (1回だけ)
--
-- ★ なぜ専用テーブルが必要か
--   app_state テーブルは公開キー(publishable key)で誰でも読めます。実際、
--   これまで各店の「各種設定」に入れていた Claude APIキーは app_state に平文で保存されており、
--   アプリを開ける人なら誰でも取り出せる状態でした。APIキーが漏れると第三者が本部の課金で
--   使い放題になるため、キーは「サーバーだけが読めるテーブル」に置きます。
--
-- ★ このテーブルの守り方
--   RLS(行レベルセキュリティ)を有効にし、ポリシーを1つも作りません。
--   → anon(ブラウザ)からは SELECT も INSERT も一切できません。
--   → service_role キー(Vercelの環境変数にのみ存在)を持つサーバーだけが読み書きできます。

create table if not exists public.app_secrets (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.app_secrets enable row level security;

-- ポリシーは作らない(= service_role 以外は全拒否)。念のため明示的に権限も剥奪する。
revoke all on public.app_secrets from anon;
revoke all on public.app_secrets from authenticated;

-- 確認: 下の行を実行して 0 件ならブラウザからは読めない状態です。
-- select * from public.app_secrets;
