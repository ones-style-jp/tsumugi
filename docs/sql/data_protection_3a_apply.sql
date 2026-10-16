-- つむぎ データ保護 段階3a: 「職員の端末だけが触る表」に行単位の制限(RLS)をかける (下書き 2026-10-17・実行はまだ)
--   対象: sync_ops(同期の履歴) / undo_snapshots(元に戻す控え)
--   ご家族・ケアマネのポータルはこの2つの表を読まないので、全店の職員端末が「証あり」になれば先行してかけられる。
--   店舗データ本体(app_state・ticket_records・stores・system_notices)は段階3b(ポータルのサーバー化のあと)。
--
-- ★ 実行の条件(必ず守る)
--   1. 管理局「端末の更新状況」で、全店の端末が「証あり」になっている(古い版・証なしが 0 台)。
--   2. 安定版に段階1(証の発行)が入っていて、Vercel の SUPABASE_JWT_SECRET が Production にも設定済み。
--   3. 直前に docs/sql/data_protection_00_inventory.sql の結果を取り、関数(RPC)の定義を確認済み。
--   4. 戻す SQL(data_protection_3a_rollback.sql)を手元に開いておく。
--   5. 11/6〜11/10(LIFE 提出直前)は実行しない。
--
-- ★ 仕組み
--   証(JWT)の中の store_id と行の store_id が一致する行だけ見える・書ける。本部(staff_role = super_admin)は全行。
--   証の無い端末(anon)は何も見えない・書けない。
--   security definer の関数(RPC)は RLS をすり抜けるので、関数の先頭でも同じ確認(tsumugi_assert_store)をする。
--
-- 実行場所: Supabase ダッシュボード → SQL Editor → 全体を貼り付けて Run

-- 0) 証の確認用の関数(全テーブル共通で使う)
create or replace function public.tsumugi_jwt_store_id() returns text
language sql stable as $$
  select nullif(coalesce(auth.jwt() ->> 'store_id', ''), '')
$$;
create or replace function public.tsumugi_is_hq() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'staff_role', '') = 'super_admin'
$$;
-- 行の店舗IDにアクセスしてよいか(本部は常に可)
create or replace function public.tsumugi_can_access_store(p_store_id text) returns boolean
language sql stable as $$
  select public.tsumugi_is_hq() or (public.tsumugi_jwt_store_id() is not null and public.tsumugi_jwt_store_id() = p_store_id)
$$;
-- RPC の先頭で呼ぶ。許されない店舗なら例外(関数の中身は実行されない)
create or replace function public.tsumugi_assert_store(p_store_id text) returns void
language plpgsql stable as $$
begin
  if not public.tsumugi_can_access_store(p_store_id) then
    raise exception 'tsumugi: この店舗へのアクセスは許可されていません(証を確認してください)' using errcode = '42501';
  end if;
end;
$$;
grant execute on function public.tsumugi_jwt_store_id() to anon, authenticated;
grant execute on function public.tsumugi_is_hq() to anon, authenticated;
grant execute on function public.tsumugi_can_access_store(text) to anon, authenticated;
grant execute on function public.tsumugi_assert_store(text) to anon, authenticated;

-- 1) sync_ops: 自店の行だけ読める(書き込みは関数 push_sync_ops 経由のみ)
alter table public.sync_ops enable row level security;
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='sync_ops' loop
    execute format('drop policy if exists %I on public.sync_ops', r.policyname);
  end loop; end $$;
create policy sync_ops_select_own on public.sync_ops for select to authenticated
  using (public.tsumugi_can_access_store(store_id::text));

-- 2) undo_snapshots: 自店の行だけ読める(書き込み・削除は関数経由のみ)
alter table public.undo_snapshots enable row level security;
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='undo_snapshots' loop
    execute format('drop policy if exists %I on public.undo_snapshots', r.policyname);
  end loop; end $$;
create policy undo_select_own on public.undo_snapshots for select to authenticated
  using (public.tsumugi_can_access_store(store_id::text));

-- 3) 関数(RPC)の店舗確認
--   ★ 関数本体は inventory の結果(pg_get_functiondef)を見てから、先頭に
--        perform public.tsumugi_assert_store(p_store_id);
--      を1行足した版をここに貼る(push_sync_ops / push_undo_snapshot / delete_undo_snapshot)。
--   それまでは実行しないこと(関数を書き換えないと、証の無い端末でも RPC 経由で書けてしまう)。

-- 4) 確認
--   select policyname, roles, cmd, qual from pg_policies where schemaname='public' and tablename in ('sync_ops','undo_snapshots');
--   ターミナル(公開キーだけ → [] が返れば成功):
--   curl -s "https://<プロジェクト>.supabase.co/rest/v1/undo_snapshots?select=id&limit=1" -H "apikey: <公開キー>" -H "Authorization: Bearer <公開キー>"
--   店舗の端末: 提供記録の「元に戻す」の一覧が出る(証つきで読める)。
