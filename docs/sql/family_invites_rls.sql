-- つむぎ: 招待コードのテーブル(family_invites)をブラウザから見えなくする (2026-09-30 用意・まだ実行しない)
-- 実行場所: Supabase ダッシュボード → SQL Editor → 貼り付けて Run (1回だけ)
--
-- ★ なぜ必要か(招待コードの総当たり対策の仕上げ)
--   family_invites(招待コード・利用者名・メール・続柄)は、これまで公開キーで誰でも読み書きできました。
--   アプリの URL と公開キーを知る人は、有効な招待コードの一覧を取り出したり、自分で招待を作ったりできます。
--   アプリ側は試験版 trial123 以降、招待の照合・登録・作成・一覧・削除をすべてサーバー
--   (/api/family-invite・service_role キー・回数制限つき)経由に変えました。
--   このSQLでテーブルを閉じると、ブラウザからの直接アクセスができなくなり、回数制限を回避する道がなくなります。
--
-- ★ 順番(必ず守る)
--   1. /api/family-invite を含む版が【安定版】に入り、全店に配信されていることを確認する(ホーム画面の版数)。
--      ※ 古い版の端末が残っていると、その端末では招待の発行・一覧・取消が失敗します(登録済みアカウントには影響なし)。
--   2. このSQLを実行する。
--   3. 確認: ターミナルで下のコマンドを実行し、[] (空) が返れば成功。
--        curl -s "https://<プロジェクト>.supabase.co/rest/v1/family_invites?select=id&limit=1" \
--          -H "apikey: <公開キー>" -H "Authorization: Bearer <公開キー>"
--   4. 万一、招待の発行や登録ができなくなった場合の戻し方(最終手段・原因を直したらすぐ閉じ直すこと):
--        grant select, insert, update, delete on table public.family_invites to anon;
--        create policy family_invites_anon_all on public.family_invites for all to anon using (true) with check (true);
--
-- ★ 実行前の控え(ガードレール): 現在のポリシーを確認して保存しておく
--   select policyname, roles, cmd, qual from pg_policies where schemaname='public' and tablename='family_invites';
--
-- ★ 残る課題(別作業): family_accounts(ログインID・パスワードのハッシュ)も公開キーで読めます。
--   ご家族のログイン・ID重複確認・ケアマネ担当の自動付与などを先にサーバー経由へ移してから閉じます。

-- 1) RLS を有効化
alter table public.family_invites enable row level security;

-- 2) 既存のポリシーをすべて削除(ポリシーが1つも無い = anon/authenticated からは何も見えない)
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'family_invites' loop
    execute format('drop policy if exists %I on public.family_invites', r.policyname);
  end loop;
end $$;

-- 3) 念のため権限も外す(RLSが万一無効化されても読めないように)。service_role は影響を受けない。
revoke all on table public.family_invites from anon, authenticated;

-- 確認
select relname, relrowsecurity from pg_class where relname = 'family_invites';
select count(*) as policies from pg_policies where schemaname = 'public' and tablename = 'family_invites';
