-- 2026-11-21 「欠席にしたのに出席に戻る」の調査(読むだけ・何も変えない)
-- 使い方: <店舗キー> を app_state.key(例: store_xxxx)に置き換えて、Supabase の SQL Editor で上から順に実行。
--         利用者は番号だけで出ます(名前は出ません)。結果の画面を Claude Code に見せてください。

-- 0) 店舗キーの確認(店舗の行だけ)
select key, pg_column_size(data) as bytes, updated_at
from public.app_state
where key not like 'diag_%' and key not like 'app_%'
order by key;

-- 1) その2日の提供記録(状態・保存時刻・状態の編集時刻)
with s as (select data from public.app_state where key = '<店舗キー>')
select r->>'patientId' as 利用者番号, r->>'date' as 日付, r->>'status' as 状態, r->>'id' as 記録id,
       to_timestamp((r->>'_savedAt')::bigint / 1000) at time zone 'Asia/Tokyo' as 保存時刻,
       to_timestamp(nullif(r->'_fieldTs'->>'status', '')::bigint / 1000) at time zone 'Asia/Tokyo' as 状態の編集時刻,
       left(coalesce(r->>'tokki', ''), 20) as 特記の先頭
from s, jsonb_array_elements(coalesce(s.data->'ticketRecords', '[]'::jsonb)) r
where r->>'date' in ('11月11日', '11月17日') and coalesce((r->>'year')::int, 2026) = 2026
order by 1, 2;

-- 2) 休止の履歴に「終了日が無い」のに状態が休止でない方(支援経過表で休止扱いになる原因)
with s as (select data from public.app_state where key = '<店舗キー>')
select p->>'id' as 利用者番号, p->>'status' as 状態, h->>'fromDate' as 休止開始, h->>'toDate' as 休止終了, h->>'reason' as 理由
from s, jsonb_array_elements(coalesce(s.data->'patients', '[]'::jsonb)) p,
     jsonb_array_elements(coalesce(p->'pauseHistory', '[]'::jsonb)) h
where coalesce(h->>'toDate', '') = '' and coalesce(p->>'status', '') <> '休止'
order by 1;

-- 3) 変更ログ(auditLog)に、その2日の状態の変更があれば(端末・職員・時刻)
with s as (select data from public.app_state where key = '<店舗キー>')
select to_timestamp((a->>'at')::bigint / 1000) at time zone 'Asia/Tokyo' as 時刻,
       a->>'by' as 職員_端末, left(a::text, 160) as 内容
from s, jsonb_array_elements(coalesce(s.data->'auditLog', '[]'::jsonb)) a
where a::text like '%11月11日%' or a::text like '%11月17日%'
order by 1;

-- 4) 直近のスナップショットで、その2日の記録の状態がいつ変わったか(表の名前は環境により app_state_snapshots)
--    ※ 件数が多い店舗は時間がかかります。必要なときだけ。
-- select s.created_at at time zone 'Asia/Tokyo' as 控えの時刻, r->>'patientId' as 利用者番号, r->>'date' as 日付, r->>'status' as 状態
-- from public.app_state_snapshots s, jsonb_array_elements(coalesce(s.data->'ticketRecords', '[]'::jsonb)) r
-- where s.key = '<店舗キー>' and s.created_at > now() - interval '7 days'
--   and r->>'date' in ('11月11日', '11月17日')
-- order by 2, 3, 1;
