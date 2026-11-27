-- 2026-11-27 扇橋店 iPad「保存・同期・更新が重い」の調べ(読むだけ・何も変えない)
--   ・すべて SELECT だけです。データは 1 文字も変わりません。version を上げる必要もありません。
--   ・出てくるのは「大きさ」「時刻」「端末名」「版」「同期の記録(出来事の名前と数字)」だけで、利用者の名前や記録の中身は出ません。
--   ・Supabase の SQL Editor に、手順ごとに貼って実行してください。結果は画面の表をそのまま写真か CSV でください。

-- ────────────────────────────────────────────────────────────
-- 手順 0: 店舗ごとの「店舗データの大きさ」と、最後に書かれた時刻
--   見るところ: 扇橋店の行の mb(保存 1 回ごとに端末が受け取り・送る量の目安)。ほかの店舗との差。
--   ※ 扇橋店の key(店舗キー)をここで控えてください。手順 1〜3 で使います。
-- ────────────────────────────────────────────────────────────
select key,
       round(length(data::text) / 1024.0 / 1024.0, 2) as mb,          -- 送受信するときの大きさ(文字にしたとき)
       round(pg_column_size(data) / 1024.0 / 1024.0, 2) as db_mb,     -- データベースの中での大きさ(圧縮後)
       version,
       to_char(updated_at at time zone 'Asia/Tokyo', 'MM/DD HH24:MI') as updated_jst
from public.app_state
where key not like 'diag_%' and key not like 'app_%'
order by length(data::text) desc;

-- ────────────────────────────────────────────────────────────
-- 手順 1: 扇橋店の店舗データの「項目ごとの大きさ」(上から 25 個)
--   見るところ: どの項目が大きいか(=店舗データを分けるとき、どこから外へ出すと軽くなるか)。
--   ★ 下の <店舗キー> を、手順 0 で控えた key に置き換えてから実行してください。
-- ────────────────────────────────────────────────────────────
select e.key as item,
       round(length(e.value::text) / 1024.0, 1) as kb,
       jsonb_typeof(e.value) as kind,
       case when jsonb_typeof(e.value) = 'array' then jsonb_array_length(e.value) end as rows
from public.app_state s, jsonb_each(s.data) e
where s.key = '<店舗キー>'
order by length(e.value::text) desc
limit 25;

-- ────────────────────────────────────────────────────────────
-- 手順 2: 扇橋店の端末の一覧(端末名・版・最後に記録を送った時刻・かかった時間のまとめ)
--   見るところ: iPad がどの版か・最後に送ったのはいつか。
--   perf の列は、trial656 の変更が安定版に入ったあとから出ます(それまでは空)。
--     push=保存の送信 / prePull=保存の前の取り込み / pull=ほかの端末の変更の取り込み / send=送信そのもの / zip=圧縮
--     それぞれ n=回数・sum=合計ミリ秒・max=いちばん長かった回・last=直近。boot=開いたとき(js=プログラムの受信ミリ秒)。upd=「今すぐ更新」。
--   ★ <店舗キー> を手順 0 の key に置き換えてください(前の diag_ は残します)。
-- ────────────────────────────────────────────────────────────
select d.value->>'name' as device,
       d.value->>'ver'  as ver,
       to_char(to_timestamp((d.value->>'at')::bigint / 1000.0) at time zone 'Asia/Tokyo', 'MM/DD HH24:MI') as last_seen_jst,
       jsonb_array_length(coalesce(d.value->'logs', '[]'::jsonb)) as logs,
       d.value->'perf' as perf
from public.app_state s, jsonb_each(s.data) d
where s.key = 'diag_<店舗キー>'
  and d.key not like '\_\_%' escape '\'
order by (d.value->>'at')::bigint desc;

-- ────────────────────────────────────────────────────────────
-- 手順 3: 扇橋店の端末ごとの同期の記録(直近 20 件ずつ・「生きています」の合図は除く)
--   見るところ: push-time(保存にかかったミリ秒 pushMs・その前の取り込み pullMs)・push-timeout(時間切れ)・push-give-up(3 回失敗)・
--               cas-conflict(ほかの端末と書き込みが重なった)・persist-quota(端末の保存場所がいっぱい)・pull-full(全体の取り込み)。
--   ※ 端末が送るのは直近 20 件だけで、約 10 分ぶんしか残りません。「重い」と感じた直後(10 分以内)に実行すると当たりやすいです。
--   ★ <店舗キー> を手順 2 と同じように置き換えてください。
-- ────────────────────────────────────────────────────────────
select d.value->>'name' as device,
       d.value->>'ver'  as ver,
       l.value->>'t'    as time_on_device,
       l.value->>'ev'   as event,
       l.value->'d'     as detail
from public.app_state s,
     jsonb_each(s.data) d,
     jsonb_array_elements(coalesce(d.value->'logs', '[]'::jsonb)) l
where s.key = 'diag_<店舗キー>'
  and d.key not like '\_\_%' escape '\'
  and l.value->>'ev' not in ('alive', 'pull-same')
order by d.value->>'name', (l.value->>'n')::int;
