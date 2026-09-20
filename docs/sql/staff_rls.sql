-- つむぎ: 職員テーブル(staff)をブラウザから見えなくする (2026-09-21)
-- 実行場所: Supabase ダッシュボード → SQL Editor → 貼り付けて Run (1回だけ)
--
-- ★ なぜ必要か
--   staff テーブル(ログインID・パスワードのハッシュ・メール等)は、これまで公開キー(publishable key)で
--   誰でも読める状態でした。アプリのURLと公開キーを知る人は全店の職員のハッシュ一覧を取り出せます。
--   アプリ側は 2026-09-21(0921e) から、ログイン・職員作成・パスワード変更・一覧をすべて
--   サーバー(/api/staff-auth・service_role キー)経由に変えたので、ブラウザが staff を直接読む必要はなくなりました。
--
-- ★ 順番(必ず守る)
--   1. アプリの更新(0921e以降)が全店に配信されていることを確認する(ホーム画面の版数)。
--   2. このSQLを実行する。
--   3. 確認: ターミナルで下のコマンドを実行し、[] (空) が返れば成功。
--        curl -s "https://<プロジェクト>.supabase.co/rest/v1/staff?select=id&limit=1" \
--          -H "apikey: <公開キー>" -H "Authorization: Bearer <公開キー>"
--      または scripts/run_tests.py の T-SEC-03 が PASS になる。
--   4. 万一ログインできなくなった場合の戻し方(最終手段・すぐ再実行して閉じ直すこと):
--        create policy staff_anon_read on public.staff for select to anon using (true);
--
-- ★ 実行前の控え(ガードレール): 現在のポリシーを確認して保存しておく
--   select policyname, roles, cmd, qual from pg_policies where schemaname='public' and tablename='staff';

-- 1) RLS を有効化
alter table public.staff enable row level security;

-- 2) 既存のポリシーをすべて削除(ポリシーが1つも無い = anon/authenticated からは何も見えない)
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'staff' loop
    execute format('drop policy if exists %I on public.staff', r.policyname);
  end loop;
end $$;

-- 3) 念のため権限も外す(RLSが万一無効化されても読めないように)。service_role は影響を受けない。
revoke all on table public.staff from anon, authenticated;

-- 確認
select relname, relrowsecurity from pg_class where relname = 'staff';
select count(*) as policies from pg_policies where schemaname = 'public' and tablename = 'staff';
