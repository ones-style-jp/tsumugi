-- 2026-10-28 施設休業日の書き戻し ②書き戻す(①で出た店舗だけ・いまも0日の店舗だけ)
--   書き戻すのは holidays だけ。ほかの項目(利用者・記録・設定)には触れない。
--   _holTs(休業日を変えた時刻)をいまにする → 新しい版(1028b〜)の端末は、古い中身を持っていても
--   クラウドの休業日を残す。version を1つ進める → 書き込み中の端末は取り直してから書く。
--   古い版の端末は丸ごと上書きするので、先に全端末を新しい版にしておくこと。
--   もう一度流しても、休業日が入った店舗は対象から外れる(何度流しても同じ結果)。
with last_good as (
  select distinct on (s.key) s.key, s.taken_at, s.data->'holidays' as h
  from app_state_snapshots s
  join app_state a on a.key = s.key
  where jsonb_array_length(coalesce(a.data->'holidays', '[]'::jsonb)) = 0
    and jsonb_array_length(coalesce(s.data->'holidays', '[]'::jsonb)) > 0
  order by s.key, s.taken_at desc
),
stamp as (
  select g.key, g.h,
         greatest((extract(epoch from now()) * 1000)::bigint,
                  coalesce((a.data->>'__clock')::numeric, 0)::bigint + 1) as t
  from last_good g join app_state a on a.key = g.key
),
upd as (
  update app_state a
  set data = jsonb_set(a.data, '{holidays}', st.h)
             || jsonb_build_object('_holTs', st.t, '__clock', st.t),
      version = coalesce(a.version, 0) + 1
  from stamp st
  where a.key = st.key
    and jsonb_array_length(coalesce(a.data->'holidays', '[]'::jsonb)) = 0
  returning a.key, jsonb_array_length(a.data->'holidays') as n, a.version
)
select key as 店舗, n as 戻した休業日の数, version from upd order by key;
