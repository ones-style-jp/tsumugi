-- つむぎ データ保護 段階3: 関数(RPC)の「元の定義」(2026-10-18 棚卸しの結果そのまま・戻し用)
-- 実行すると、店舗の確認(tsumugi_assert_store)を足す前の状態に戻る

CREATE OR REPLACE FUNCTION public.delete_ticket_record(p_store_id text, p_id text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.ticket_records
     set deleted_at = now(), updated_at = now()
   where store_id = p_store_id and id = p_id;   -- ★店�__込みで論理削除(他店を消さな�_)
$function$;

CREATE OR REPLACE FUNCTION public.delete_undo_snapshot(p_store_id text, p_id bigint)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  delete from public.undo_snapshots where id = p_id and store_id = p_store_id;
$function$;

CREATE OR REPLACE FUNCTION public.push_sync_ops(p_store_id text, p_ops jsonb)
 RETURNS TABLE(out_event_id uuid, out_revision bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
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
