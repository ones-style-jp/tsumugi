-- つむぎ: 提供記録テーブル(ticket_records)の書き込みRPCを「項目ごとの時刻比較」に変更する (2026-09-18・台帳432件目)
-- 実行場所: Supabase ダッシュボード → SQL Editor → 貼り付けて Run (1回だけ)
--
-- ★ なぜ必要か(実証済み)
--   現行の upsert_ticket_records は、送られてきた項目をそのまま上書き(jsonb 連結の後勝ち)しており、
--   項目ごとの更新時刻(_fieldTs)を一切比較していません。試作店舗に架空の行を作って確認したところ、
--   「気分=good(時刻T)」の行に対し、空の気分を「同時刻T」「古い時刻T-1000」「時刻なし」のどれで送っても
--   既存の気分が消え、_fieldTs まで古い値に戻りました。
--   → タブレットで入れた気分が、PCの古い画面の自動保存で消える事故の根本原因です。
--   アプリ側(0918e)で「触っていない項目の空を送らない」対策は入れましたが、サーバー側でも
--   「新しい入力が勝つ／古い・時刻不明の空は既存を消さない」を保証するのがこのSQLです。
--
-- ★ 変えないこと(現行と同じ挙動を維持)
--   ・主キーは (store_id, id) の組(同じidでも店舗が違えば別行)
--   ・削除済み(deleted_at あり)の行に書き込むと復活する(deleted_at を NULL に戻す)
--   ・patient_id / rec_date は受信値で更新(受信が空なら既存を維持)
--   ・戻り値は処理した行数
--
-- ★ 実行前に必ず控えを取る(元に戻せるように)
--   下の1行を先に実行し、結果(現行の関数定義)をメモ帳などに保存してください:
--     select pg_get_functiondef('public.upsert_ticket_records'::regproc);
--
-- ★ 実行後の確認
--   本部で「試作店舗の架空行テスト(scratchpad/probe)」を再実行し、B/C/D で気分が消えなくなっていれば成功。

create or replace function public.upsert_ticket_records(p_store_id text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r        jsonb;
  v_id     text;
  v_pid    text;
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
    v_pid := nullif(r->>'patientId', '');
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
      -- 新規行: 受信内容をそのまま登録
      insert into public.ticket_records (store_id, id, patient_id, rec_date, data, updated_at, deleted_at)
      values (p_store_id, v_id, v_pid, v_date, v_new, now(), null);
      n := n + 1;
      continue;
    end if;

    v_old   := coalesce(v_old, '{}'::jsonb);
    v_oldft := coalesce(v_old->'_fieldTs', '{}'::jsonb);
    v_newft := coalesce(v_new->'_fieldTs', '{}'::jsonb);
    v_out   := v_old;

    -- 項目ごとに「採用するか」を判定する
    for k, v_inc in select * from jsonb_each(v_new) loop
      if k = '_fieldTs' then continue; end if;
      v_cur := v_old->k;
      t_inc := nullif(v_newft->>k, '')::bigint;
      t_old := nullif(v_oldft->>k, '')::bigint;

      -- 「空(未入力)」の定義: null / '' / false / {}
      inc_empty := (v_inc is null or jsonb_typeof(v_inc) = 'null'
                    or (jsonb_typeof(v_inc) = 'string'  and (v_inc #>> '{}') = '')
                    or (jsonb_typeof(v_inc) = 'boolean' and not (v_inc #>> '{}')::boolean)
                    or (jsonb_typeof(v_inc) = 'object'  and v_inc = '{}'::jsonb));
      cur_empty := (v_cur is null or jsonb_typeof(v_cur) = 'null'
                    or (jsonb_typeof(v_cur) = 'string'  and (v_cur #>> '{}') = '')
                    or (jsonb_typeof(v_cur) = 'boolean' and not (v_cur #>> '{}')::boolean)
                    or (jsonb_typeof(v_cur) = 'object'  and v_cur = '{}'::jsonb));

      if t_old is null then
        -- 既存に時刻がない項目: 非空は採用。空は「受信に時刻がある=明示クリア」のときだけ採用
        if (not inc_empty) or (t_inc is not null) then
          v_out := v_out || jsonb_build_object(k,
                     case when jsonb_typeof(v_inc) = 'object' and jsonb_typeof(v_cur) = 'object'
                          then v_cur || v_inc else v_inc end);
        end if;
      elsif t_inc is not null and t_inc > t_old then
        -- 受信の方が新しい: 採用(明示クリアも反映)。オブジェクトはキー単位で統合
        v_out := v_out || jsonb_build_object(k,
                   case when jsonb_typeof(v_inc) = 'object' and jsonb_typeof(v_cur) = 'object'
                        then v_cur || v_inc else v_inc end);
      elsif t_inc is not null and t_inc = t_old then
        -- 同時刻: 非空だけ採用(同時刻の空で潰さない)
        if not inc_empty then
          v_out := v_out || jsonb_build_object(k,
                     case when jsonb_typeof(v_inc) = 'object' and jsonb_typeof(v_cur) = 'object'
                          then v_cur || v_inc else v_inc end);
        end if;
      elsif t_inc is null then
        -- 受信に時刻がなく既存に時刻がある: 既存が空のときだけ非空を採用(既存の非空は維持)
        if (not inc_empty) and cur_empty then
          v_out := v_out || jsonb_build_object(k, v_inc);
        end if;
      else
        -- 受信の方が古い: 既存を維持
        null;
      end if;
    end loop;

    -- _fieldTs は項目ごとに大きい方を残す(古い時刻で上書きしない)
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

-- 実行権限は既存のまま(CREATE OR REPLACE では変わりません)。念のため明示:
grant execute on function public.upsert_ticket_records(text, jsonb) to anon, authenticated;
