-- 2026-10-28 施設休業日の書き戻し ①確認(読むだけ・何も変えません)
--   いま休業日が0日で、7日分の控え(app_state_snapshots)には休業日があった店舗と、
--   いちばん新しい控えの中身(日付と名前)を出す。②はこの店舗・この中身をそのまま書き戻す。
with last_good as (
  select distinct on (s.key) s.key, s.taken_at, s.data->'holidays' as h
  from app_state_snapshots s
  join app_state a on a.key = s.key
  where jsonb_array_length(coalesce(a.data->'holidays', '[]'::jsonb)) = 0
    and jsonb_array_length(coalesce(s.data->'holidays', '[]'::jsonb)) > 0
  order by s.key, s.taken_at desc
)
select key as 店舗,
       to_char(taken_at at time zone 'Asia/Tokyo', 'MM/DD HH24:MI') as 控えの時刻,
       jsonb_array_length(h) as 休業日の数,
       (select string_agg(coalesce(e->>'date', e #>> '{}') || coalesce(' ' || (e->>'name'), ''), '、'
                          order by coalesce(e->>'date', e #>> '{}'))
          from jsonb_array_elements(h) e) as 休業日
from last_good
order by key;
