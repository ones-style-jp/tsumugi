-- =====================================================================
-- つむぎ 控え(スナップショット)の整理(2026-11-22 案・本部が承認してから SQL Editor で実行)
--   今: 5 分ごとに控え(app_state_snapshots)・2 日を過ぎたら 20 分ごとだけ残す・7 日で消す(pg_cron 3 本)。
--   案: 2 日は全部・2 日を過ぎたら 1 日 1 件(その日のいちばん早い控え)・30 日で消す。
--       → 直近の事故対応には今までどおり細かく戻せ、長い期間はさかのぼれる日数が 7 日→30 日に延びる。
--   注意: これは「控えを減らす」SQL です。事故の調査中(復旧が終わっていないとき)は実行しない。
--         実行の前に、残したい控えがあれば別名の表に写す(例: create table snap_keep_20261122 as select * from app_state_snapshots where id in (...);)
-- =====================================================================

-- 0) 今の予定(読むだけ)
-- select jobid, jobname, schedule, command from cron.job where jobname like 'tsumugi-snapshot%' order by jobname;

-- 1) 今の「間引き」と「掃除」を止める(5 分ごとの控えはそのまま)
select cron.unschedule('tsumugi-snapshot-thin');
select cron.unschedule('tsumugi-snapshot-cleanup');

-- 2) 間引き: 2 日を過ぎた控えは、店舗(key)×日付ごとに「その日のいちばん早い 1 件」だけ残す(毎時 15 分)
select cron.schedule('tsumugi-snapshot-thin-daily', '15 * * * *', $$
  delete from public.app_state_snapshots s
  where s.taken_at < now() - interval '2 days'
    and s.id <> (
      select min(s2.id) from public.app_state_snapshots s2
      where s2.key = s.key and date_trunc('day', s2.taken_at at time zone 'Asia/Tokyo') = date_trunc('day', s.taken_at at time zone 'Asia/Tokyo')
    );
$$);

-- 3) 掃除: 30 日を過ぎた控えを消す(毎日 03:10 UTC = 12:10 JST)
select cron.schedule('tsumugi-snapshot-cleanup-30d', '10 3 * * *', $$
  delete from public.app_state_snapshots where taken_at < now() - interval '30 days';
$$);

-- 確認(読むだけ): 店舗ごとの控えの数と期間
-- select key, count(*) as n, min(taken_at) as oldest, max(taken_at) as newest from public.app_state_snapshots group by key order by key;

-- ---------------------------------------------------------------------
-- 戻す(元の 20 分間引き・7 日掃除に戻す)
-- select cron.unschedule('tsumugi-snapshot-thin-daily');
-- select cron.unschedule('tsumugi-snapshot-cleanup-30d');
-- select cron.schedule('tsumugi-snapshot-thin','15 * * * *', $$delete from app_state_snapshots where taken_at < now() - interval '2 days' and extract(minute from taken_at)::int % 20 <> 0;$$);
-- select cron.schedule('tsumugi-snapshot-cleanup','10 18 * * *', $$delete from app_state_snapshots where taken_at < now() - interval '7 days';$$);
