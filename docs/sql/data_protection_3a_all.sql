-- つむぎ データ保護 段階3a【まとめ・1回の Run で完了】 (2026-10-19)
--   = data_protection_3a_apply.sql(補助関数・sync_ops/undo_snapshots の制限) ＋ data_protection_3_functions_guarded.sql(関数の守り) をこの順で続けたもの。
--   実行場所: Supabase ダッシュボード → SQL Editor → 新規クエリ → 全部貼り付けて Run(エラーが出たらその画面を撮って Claude へ)
--   戻し: data_protection_3a_rollback.sql → data_protection_3_functions_original.sql
--   実行したら docs/sql/rls_status.json の 3a_sync_ops_undo_snapshots と 3_functions_guarded を true に(Claude がやります)

-- ===================== (1/2) 3a: 補助関数と sync_ops / undo_snapshots の制限 =====================
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
-- サーバー(service_role キー: /api/*・本部の復旧ツール)か。証の店舗IDを持たないので常に通す
create or replace function public.tsumugi_is_service() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role' or current_user in ('postgres', 'service_role', 'supabase_admin')
$$;
-- 行の店舗IDにアクセスしてよいか(本部・サーバーは常に可)
create or replace function public.tsumugi_can_access_store(p_store_id text) returns boolean
language sql stable as $$
  select public.tsumugi_is_service() or public.tsumugi_is_hq() or (public.tsumugi_jwt_store_id() is not null and public.tsumugi_jwt_store_id() = p_store_id)
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
grant execute on function public.tsumugi_is_service() to anon, authenticated;
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
--   ★ この SQL のあとに data_protection_3_functions_guarded.sql を実行する(5つの関数の先頭に店舗の確認を足した版・2026-10-18 棚卸し済み)。
--   関数を書き換えないと、証の無い端末でも RPC 経由で書けてしまう。戻しは data_protection_3_functions_original.sql。

-- 4) 確認
--   select policyname, roles, cmd, qual from pg_policies where schemaname='public' and tablename in ('sync_ops','undo_snapshots');
--   ターミナル(公開キーだけ → [] が返れば成功):
--   curl -s "https://<プロジェクト>.supabase.co/rest/v1/undo_snapshots?select=id&limit=1" -H "apikey: <公開キー>" -H "Authorization: Bearer <公開キー>"
--   店舗の端末: 提供記録の「元に戻す」の一覧が出る(証つきで読める)。

-- ★ 実行したら docs/sql/rls_status.json の "3a_sync_ops_undo_snapshots" を true にして commit(scripts/run_tests.py の T-SEC-04/05/06 が「閉じていること」を毎回確かめるようになる)。戻したら false に。


-- ===================== (2/2) 関数(RPC)の守り =====================
-- つむぎ データ保護 段階3: ブラウザから呼ばれる関数(RPC)に「証の店舗と一致するか」の確認を足した版 (2026-10-18)
--   元の定義は 2026-10-18 の棚卸し(data_protection_3_functions_original.sql)。中身の処理は一切変えず、先頭に
--     perform public.tsumugi_assert_store(p_store_id);
--   を足しただけ。security definer の関数は RLS をすり抜けるため、ここで店舗を確かめる。
--   サーバー(service_role)・本部(super_admin)は常に通る(tsumugi_can_access_store 参照)。
--   ★ 実行の順番: data_protection_3a_apply.sql(補助関数 tsumugi_* の作成)より後。段階3a の一部として実行する。
--   ★ 戻し: data_protection_3_functions_original.sql を実行。

create or replace function public.delete_ticket_record(p_store_id text, p_id text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.tsumugi_assert_store(p_store_id); -- ★ 証の店舗と一致しなければ例外(段階3)
  update public.ticket_records
     set deleted_at = now(), updated_at = now()
   where store_id = p_store_id and id = p_id;   -- 削除は論理削除(他端末からも消える)
end
$function$;

create or replace function public.delete_undo_snapshot(p_store_id text, p_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.tsumugi_assert_store(p_store_id); -- ★ 証の店舗と一致しなければ例外(段階3)
  delete from public.undo_snapshots where id = p_id and store_id = p_store_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.push_sync_ops(p_store_id text, p_ops jsonb)
 RETURNS TABLE(out_event_id uuid, out_revision bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.tsumugi_assert_store(p_store_id); -- ★ 証の店舗と一致しなければ例外(段階3)
  insert into public.sync_ops (store_id, event_id, path, op_type, value, sender_id)
  select p_store_id,
         (o->>'eventId')::uuid,
         array(select jsonb_array_elements_text(o->'path')),
         coalesce(o->>'type', 'SET'),
         o->'value',
         coalesce(o->>'senderId', '')
  from jsonb_array_elements(p_ops) as o
  on conflict (event_id) do nothing;

  return query
  select s.event_id, s.revision
  from public.sync_ops s
  where s.store_id = p_store_id
    and s.event_id in (select (o->>'eventId')::uuid from jsonb_array_elements(p_ops) as o);
end;
$function$;

CREATE OR REPLACE FUNCTION public.push_undo_snapshot(p_store_id text, p_kind text, p_skey text, p_t bigint, p_label text, p_data jsonb, p_keep integer DEFAULT 25)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint;
begin
  perform public.tsumugi_assert_store(p_store_id); -- ★ 証の店舗と一致しなければ例外(段階3)
  if p_store_id is null or p_store_id = '' or p_kind is null or p_skey is null then return null; end if;
  insert into public.undo_snapshots (store_id, kind, skey, t, label, data)
    values (p_store_id, p_kind, p_skey, coalesce(p_t, (extract(epoch from now()) * 1000)::bigint), coalesce(p_label, ''), p_data)
    returning id into v_id;
  delete from public.undo_snapshots where id in (
    select id from public.undo_snapshots where store_id = p_store_id and kind = p_kind and skey = p_skey order by t desc offset greatest(coalesce(p_keep, 25), 1)
  );
  delete from public.undo_snapshots where store_id = p_store_id and created_at < now() - interval '7 days';
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.upsert_ticket_records(p_store_id text, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r        jsonb;
  v_id     text;
  v_pid    integer;
  v_date   date;
  v_new    jsonb;
  v_old    jsonb;
  v_out    jsonb;
  v_oldft  jsonb;
  v_newft  jsonb;
  v_ft     jsonb;
  k        text;
  v_inc    jsonb;
  v_cur    jsonb;
  t_inc    bigint;
  t_old    bigint;
  inc_empty boolean;
  cur_empty boolean;
  n        integer := 0;
begin
  perform public.tsumugi_assert_store(p_store_id); -- ★ 証の店舗と一致しなければ例外(段階3)
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_id := r->>'id';
    if v_id is null or v_id = '' then continue; end if;
    begin
      v_pid := nullif(r->>'patientId', '')::integer;
    exception when others then
      v_pid := null;
    end;
    begin
      v_date := nullif(r->>'recDate', '')::date;
    exception when others then
      v_date := null;
    end;
    v_new := coalesce(r->'data', '{}'::jsonb);

    select data into v_old
      from public.ticket_records
     where store_id = p_store_id and id = v_id
       for update;

    if not found then
      insert into public.ticket_records (store_id, id, patient_id, rec_date, data, updated_at, deleted_at)
      values (p_store_id, v_id, v_pid, v_date, v_new, now(), null);
      n := n + 1;
      continue;
    end if;

    v_old   := coalesce(v_old, '{}'::jsonb);
    v_oldft := coalesce(v_old->'_fieldTs', '{}'::jsonb);
    v_newft := coalesce(v_new->'_fieldTs', '{}'::jsonb);
    v_out   := v_old;

    for k, v_inc in select * from jsonb_each(v_new) loop
      if k = '_fieldTs' then continue; end if;
      v_cur := v_old->k;
      t_inc := nullif(v_newft->>k, '')::bigint;
      t_old := nullif(v_oldft->>k, '')::bigint;

      inc_empty := (v_inc is null or jsonb_typeof(v_inc) = 'null'
                    or (jsonb_typeof(v_inc) = 'string'  and (v_inc #>> '{}') = '')
                    or (jsonb_typeof(v_inc) = 'boolean' and not (v_inc #>> '{}')::boolean)
                    or (jsonb_typeof(v_inc) = 'object'  and v_inc = '{}'::jsonb));
      cur_empty := (v_cur is null or jsonb_typeof(v_cur) = 'null'
                    or (jsonb_typeof(v_cur) = 'string'  and (v_cur #>> '{}') = '')
                    or (jsonb_typeof(v_cur) = 'boolean' and not (v_cur #>> '{}')::boolean)
                    or (jsonb_typeof(v_cur) = 'object'  and v_cur = '{}'::jsonb));

      if t_old is null then
        if (not inc_empty) or (t_inc is not null) then
          v_out := v_out || jsonb_build_object(k,
                     case when jsonb_typeof(v_inc) = 'object' and jsonb_typeof(v_cur) = 'object'
                          then v_cur || v_inc else v_inc end);
        end if;
      elsif t_inc is not null and t_inc > t_old then
        v_out := v_out || jsonb_build_object(k,
                   case when jsonb_typeof(v_inc) = 'object' and jsonb_typeof(v_cur) = 'object'
                        then v_cur || v_inc else v_inc end);
      elsif t_inc is not null and t_inc = t_old then
        if not inc_empty then
          v_out := v_out || jsonb_build_object(k,
                     case when jsonb_typeof(v_inc) = 'object' and jsonb_typeof(v_cur) = 'object'
                          then v_cur || v_inc else v_inc end);
        end if;
      elsif t_inc is null then
        if (not inc_empty) and cur_empty then
          v_out := v_out || jsonb_build_object(k, v_inc);
        end if;
      else
        null;
      end if;
    end loop;

    v_ft := v_oldft;
    for k, v_inc in select * from jsonb_each(v_newft) loop
      if coalesce(nullif(v_inc #>> '{}', '')::bigint, 0) > coalesce(nullif(v_oldft->>k, '')::bigint, 0) then
        v_ft := v_ft || jsonb_build_object(k, v_inc);
      end if;
    end loop;
    if v_ft <> '{}'::jsonb then
      v_out := v_out || jsonb_build_object('_fieldTs', v_ft);
    end if;

    update public.ticket_records
       set data       = v_out,
           patient_id = coalesce(v_pid, patient_id),
           rec_date   = coalesce(v_date, rec_date),
           updated_at = now(),
           deleted_at = null
     where store_id = p_store_id and id = v_id;
    n := n + 1;
  end loop;

  return n;
end
$function$;

-- 確認(実行後):
--   select proname, prosecdef from pg_proc where proname in ('upsert_ticket_records','delete_ticket_record','push_sync_ops','push_undo_snapshot','delete_undo_snapshot');
--   証なし(公開キーだけ)で呼ぶと 42501 の例外になること:
--   curl -s -X POST "https://<プロジェクト>.supabase.co/rest/v1/rpc/delete_undo_snapshot" -H "apikey: <公開キー>" -H "Authorization: Bearer <公開キー>" -H "Content-Type: application/json" -d '{"p_store_id":"x","p_id":0}'

-- ★ 実行したら docs/sql/rls_status.json の "3_functions_guarded" を true にして commit(scripts/run_tests.py の T-SEC-04/05/06 が「閉じていること」を毎回確かめるようになる)。戻したら false に。
