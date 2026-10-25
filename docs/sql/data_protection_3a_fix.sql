-- つむぎ データ保護 段階3a の修正【1回の Run】 (2026-10-19)
--   3a 実行後の確認で「関数(RPC)が証なしでも通る」ことが分かった。原因: tsumugi_is_service() が current_user で判定していたため、
--   security definer の関数の中では常に「サーバー扱い」になっていた。判定を証(JWT)の中身だけに直し、関数の守りを入れ直す。
--   実行場所: Supabase → SQL Editor → 新規クエリ → 全部貼り付けて Run
--   実行後の確認: scripts/run_tests.py の T-SEC-06 が「拒否」になる(Claude が確認)

-- サーバー(service_role キー: /api/*・本部の復旧ツール)か。証の店舗IDを持たないので常に通す
-- ★ 2026-10-19 修正: security definer の関数の中では current_user が所有者(postgres)になり誰でも「サーバー扱い」になってしまったため、
--   判定は証(JWT)の中身だけで行う。JWT が無い＝PostgREST を通らない直接の DB 接続(SQL Editor 等)も通す
create or replace function public.tsumugi_is_service() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or coalesce(current_setting('request.jwt.claims', true), '') = ''
$$;

grant execute on function public.tsumugi_is_service() to anon, authenticated;

-- 関数の守り(入れ直し・中身は data_protection_3_functions_guarded.sql と同じ)
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
