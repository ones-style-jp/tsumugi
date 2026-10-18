-- つむぎ データ保護 段階3b: 店舗データ本体に行単位の制限(RLS)をかける (下書き 2026-10-17・実行はまだ)
--   対象: app_state(店舗データ本体・全店共通設定・端末の診断) / ticket_records(提供記録) / stores(店舗) / system_notices(お知らせ)
--
-- ★★ 実行の前提(これが終わるまで実行してはいけない) ★★
--   A. ご家族ポータルとケアマネポータルが「店舗の行を直接読まない」作りになっている(サーバー経由・段階4の前半)。
--      いまのポータルは公開キーで app_state の店舗行と ticket_records を直接読んでいるため、この SQL をかけると
--      ご家族・ケアマネの画面が何も出なくなる。
--   B. 段階3a が済んで数日問題がない。
--   C. 管理局「端末の更新状況」で全店の端末が「証あり」。
--   D. 戻す SQL(data_protection_3b_rollback.sql)を手元に開いておく。11/6〜11/10 は実行しない。
--
-- ★ ルール
--   app_state   : key = 自店ID → 読み書き / key = 'diag_'||自店ID → 読み書き / 全店共通キー → 読みだけ(書きは本部) / 本部は全行
--   ticket_records : store_id = 自店 → 読み(書き・削除は関数経由) / 本部は全行
--   stores      : id = 自店 → 読み / 本部は全行(作成・削除も本部だけ)
--   system_notices : 全店宛て(target_store_ids が空) または 自店宛て → 読み / 作成・削除は本部
--   証の無い端末(anon)は何も見えない。
--
-- 実行場所: Supabase ダッシュボード → SQL Editor → 全体を貼り付けて Run
-- (補助関数 tsumugi_* は段階3a で作成済みであること)

-- 1) app_state
alter table public.app_state enable row level security;
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='app_state' loop
    execute format('drop policy if exists %I on public.app_state', r.policyname);
  end loop; end $$;
-- 自店の行(本体・診断)は読み書き。本部は全行
create policy app_state_own_all on public.app_state for all to authenticated
  using (public.tsumugi_is_hq() or key = public.tsumugi_jwt_store_id() or key = 'diag_' || public.tsumugi_jwt_store_id())
  with check (public.tsumugi_is_hq() or key = public.tsumugi_jwt_store_id() or key = 'diag_' || public.tsumugi_jwt_store_id());
-- 全店共通の設定(同意ポリシー・傷病名マスタ)は証があれば誰でも読める(書きは上の本部ルールで)
create policy app_state_global_read on public.app_state for select to authenticated
  using (key in ('__tsumugi_global__', '__tsumugi_disease_master__'));

-- 2) ticket_records(書き込みは関数 upsert_ticket_records / delete_ticket_record 経由 → 関数の先頭に tsumugi_assert_store を足す)
alter table public.ticket_records enable row level security;
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='ticket_records' loop
    execute format('drop policy if exists %I on public.ticket_records', r.policyname);
  end loop; end $$;
create policy ticket_select_own on public.ticket_records for select to authenticated
  using (public.tsumugi_can_access_store(store_id::text));

-- 3) stores
alter table public.stores enable row level security;
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='stores' loop
    execute format('drop policy if exists %I on public.stores', r.policyname);
  end loop; end $$;
create policy stores_select_own on public.stores for select to authenticated
  using (public.tsumugi_can_access_store(id::text));
create policy stores_hq_write on public.stores for all to authenticated
  using (public.tsumugi_is_hq()) with check (public.tsumugi_is_hq());

-- 4) system_notices(棚卸し 2026-10-18 で確認: 旧 target_store_id:text と 新 target_store_ids:ARRAY の両方がある → 両方を見る)
alter table public.system_notices enable row level security;
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='system_notices' loop
    execute format('drop policy if exists %I on public.system_notices', r.policyname);
  end loop; end $$;
create policy notices_select_target on public.system_notices for select to authenticated
  using (
    public.tsumugi_is_hq()
    or ((target_store_ids is null or cardinality(target_store_ids) = 0) and (target_store_id is null or target_store_id = ''))
    or public.tsumugi_jwt_store_id() = any (coalesce(target_store_ids, array[]::text[]))
    or target_store_id = public.tsumugi_jwt_store_id()
  );
create policy notices_hq_write on public.system_notices for all to authenticated
  using (public.tsumugi_is_hq()) with check (public.tsumugi_is_hq());

-- 5) 関数(RPC)の店舗確認: data_protection_3_functions_guarded.sql(段階3a で実行済みのはず)。未実行ならここで実行する。

-- 6) 確認
--   公開キーだけ → すべて [] :
--   curl -s "https://<プロジェクト>.supabase.co/rest/v1/app_state?select=key&limit=1" -H "apikey: <公開キー>" -H "Authorization: Bearer <公開キー>"
--   curl -s ".../rest/v1/ticket_records?select=id&limit=1" ... / ".../rest/v1/stores?select=id&limit=1" ...
--   店舗の端末: ホーム・提供記録・同期・リアルタイム(他端末の更新が届く)・写真・お知らせ・元に戻す を確認。
--   本部: 管理局の店舗一覧・端末の更新状況・お知らせ管理・店舗に入っての操作を確認。
--   自動テスト: scripts/run_tests.py の T-SEC(他店の行が読めない)が PASS。
