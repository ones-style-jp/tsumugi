-- つむぎ: 提供記録テーブル(ticket_records)の書き込みRPCを「項目ごとの時刻比較」に変更する (2026-09-18・台帳432件目)
-- 実行場所: Supabase ダッシュボード → SQL Editor → 新しいタブに貼り付けて Run
--
-- ★ v2.1 (2026-09-18 修正): patient_id 列は整数型のため、受信の patientId を整数に変換するよう修正
--   (v2.0 は「COALESCE types text and integer cannot be matched」で全書き込みが失敗した)
--
-- ★ なぜ必要か(実証済み)
--   現行の upsert_ticket_records は、送られてきた項目をそのまま上書き(jsonb 連結の後勝ち)しており、
--   項目ごとの更新時刻(_fieldTs)を一切比較していません。「気分=good(時刻T)」の行に対し、空の気分を
--   同時刻/古い時刻/時刻なしのどれで送っても既存の気分が消えました(タブレットの気分がPCの自動保存で消える根本原因)。
--
-- ★ 変えないこと: 主キー(store_id,id) / 削除済み行への書き込みで復活 / patient_id・rec_date は受信値で更新 / 戻り値=行数
-- ★ 実行後の確認: 本部で python3 scripts/probe_ticket_rpc.py → 「OK」

create or replace function public.upsert_ticket_records(p_store_id text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.upsert_ticket_records(text, jsonb) to anon, authenticated;
