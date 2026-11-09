-- 2026-11-09 南水元店「新しく利用者を登録して作業していたら利用者のデータが消えた」の調査(読み取りだけ・本番 SQL Editor で上から順に)
-- 結果は 件数・ID・時刻 だけが出るようにしてある(氏名は出さない)。そのまま Claude に貼り付けてよい。
-- 店舗キー: store_minamimizumoto

-- 0) まず保全(必ず最初に。既にあればそのまま)
create table if not exists app_state_rescue_20261109 as select * from app_state;
select count(*) as 退避件数, now() as 退避時刻 from app_state_rescue_20261109;

-- 1) 今のクラウドの状態
select key, version,
  jsonb_array_length(coalesce(data->'patients','[]'::jsonb)) as 利用者数,
  (select count(*) from jsonb_array_elements(coalesce(data->'patients','[]'::jsonb)) p where p->>'status' = '利用中') as 利用中,
  (select count(*) from jsonb_object_keys(coalesce(data->'deletedIds'->'patients','{}'::jsonb))) as 利用者墓石,
  data->>'patientIdSeq' as 連番,
  to_timestamp((data->>'_updatedAt')::bigint / 1000) at time zone 'Asia/Tokyo' as 最終更新
from app_state where key = 'store_minamimizumoto';

-- 2) 今日の控え(5分おき)の推移: 利用者数が減った所が事故の時刻
select id, version, taken_at at time zone 'Asia/Tokyo' as 時刻,
  jsonb_array_length(coalesce(data->'patients','[]'::jsonb)) as 利用者数,
  (select count(*) from jsonb_object_keys(coalesce(data->'deletedIds'->'patients','{}'::jsonb))) as 利用者墓石,
  data->>'patientIdSeq' as 連番
from app_state_snapshots
where key = 'store_minamimizumoto' and taken_at > now() - interval '36 hours'
order by taken_at;

-- 3) 今の状態に無くて、今日いちばん多かった控えにはいる利用者の ID と状態(名前は出さない)
with best as (
  select id from app_state_snapshots
  where key = 'store_minamimizumoto' and taken_at > now() - interval '36 hours'
  order by jsonb_array_length(coalesce(data->'patients','[]'::jsonb)) desc, taken_at desc limit 1
), snap as (
  select p from app_state_snapshots s, jsonb_array_elements(s.data->'patients') p where s.id = (select id from best)
), cur as (
  select p from app_state a, jsonb_array_elements(a.data->'patients') p where a.key = 'store_minamimizumoto'
)
select (select id from best) as 控えID,
  s.p->>'id' as 利用者ID, s.p->>'status' as 状態, s.p->>'startDate' as 利用開始日,
  to_timestamp(nullif(s.p->>'_updatedAt','')::bigint / 1000) at time zone 'Asia/Tokyo' as その方の最終更新
from snap s
where not exists (select 1 from cur c where c.p->>'id' = s.p->>'id')
order by (s.p->>'id')::int;

-- 4) 墓石(削除の記録)に今日の時刻のものがあるか(ID と時刻)
select k as 利用者ID, to_timestamp((v)::bigint / 1000) at time zone 'Asia/Tokyo' as 削除時刻
from app_state a, jsonb_each_text(coalesce(a.data->'deletedIds'->'patients','{}'::jsonb)) as t(k, v)
where a.key = 'store_minamimizumoto' and (v)::bigint > (extract(epoch from now() - interval '36 hours') * 1000)::bigint
order by 2;

-- 5) 端末の記録(diag): 今日動いていた端末と版、同期の記録のうち 保存・押し止め・取り込み の行
select d.key as 端末ID, d.value->>'name' as 端末名, d.value->>'ver' as 版,
  to_timestamp((d.value->>'at')::bigint / 1000) at time zone 'Asia/Tokyo' as 最後の知らせ,
  l->>'t' as 端末時刻, l->>'ev' as 事象, left(l->>'d', 160) as 内容
from app_state a, jsonb_each(a.data) d, jsonb_array_elements(coalesce(d.value->'logs','[]'::jsonb)) l
where a.key = 'diag_store_minamimizumoto' and d.key not like '\_\_%'
  and (d.value->>'at')::bigint > (extract(epoch from now() - interval '36 hours') * 1000)::bigint
  and (l->>'ev') in ('save','push-blocked-empty','boot-merge','pull','pull-merge','push','cas-retry','store-switch','pull-tomb-drop','merge-drop')
order by 端末名, (l->>'n')::int;

-- 6) 控え同士で利用者数が変わった所の前後の ID 差(控えID を 2) の結果から2つ選んで入れる)
-- select p->>'id' as 利用者ID from app_state_snapshots s, jsonb_array_elements(s.data->'patients') p where s.id = <前のID>
-- except
-- select p->>'id' from app_state_snapshots s, jsonb_array_elements(s.data->'patients') p where s.id = <後のID>;

-- ===== 復旧(調査の結果を見てから。Claude が確認した控えIDで) =====
-- 消えた方「だけ」を控えから足し戻す(今いる方は触らない・_savedAt と _updatedAt を今に刻んで古い端末に負けないように)
-- update app_state a
-- set data = jsonb_set(a.data, '{patients}',
--       a.data->'patients' || (
--         select coalesce(jsonb_agg(p || jsonb_build_object('_savedAt', (extract(epoch from now())*1000)::bigint, '_updatedAt', (extract(epoch from now())*1000)::bigint)), '[]'::jsonb)
--         from app_state_snapshots s, jsonb_array_elements(s.data->'patients') p
--         where s.id = <控えID>
--           and not exists (select 1 from jsonb_array_elements(a.data->'patients') c where c->>'id' = p->>'id')
--       )),
--     version = coalesce(a.version,0) + 1
-- where a.key = 'store_minamimizumoto';
-- ※ 墓石(deletedIds.patients)にその ID が残っていると端末側で再び消えるので、4) に出た ID は同時に外す:
-- update app_state a set data = a.data #- '{deletedIds,patients,<利用者ID>}', version = coalesce(a.version,0)+1 where a.key='store_minamimizumoto';

-- ===== 11/9 夜 追加(5 の結果を見て) =====
-- 7) 今日動いた端末の記録を「全部の事象」で(手で押した保存 manual:true・失敗・押し止めがあるか)。端末ごとに最後の60件
select d.value->>'name' as 端末名, d.value->>'ver' as 版, l->>'t' as 端末時刻, (l->>'n')::int as 連番, l->>'ev' as 事象, left(l->>'d', 200) as 内容
from app_state a, jsonb_each(a.data) d, jsonb_array_elements(coalesce(d.value->'logs','[]'::jsonb)) l
where a.key = 'diag_store_minamimizumoto' and d.key not like '\_\_%'
  and (d.value->>'at')::bigint > (extract(epoch from (date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo')) * 1000)::bigint
order by 端末名, 連番;

-- 8) 今のクラウドにいる方のうち、今日 変更・登録があった方(ID・状態・利用開始日・最終更新。名前は出さない)
select p->>'id' as 利用者ID, p->>'status' as 状態, p->>'startDate' as 利用開始日,
  to_timestamp(nullif(p->>'_updatedAt','')::bigint / 1000) at time zone 'Asia/Tokyo' as 最終更新,
  to_timestamp(nullif(p->>'_savedAt','')::bigint / 1000) at time zone 'Asia/Tokyo' as 保存時刻
from app_state a, jsonb_array_elements(a.data->'patients') p
where a.key = 'store_minamimizumoto'
  and (nullif(p->>'_updatedAt','')::bigint > (extract(epoch from now() - interval '36 hours') * 1000)::bigint
       or nullif(p->>'_savedAt','')::bigint > (extract(epoch from now() - interval '36 hours') * 1000)::bigint)
order by (p->>'id')::int;

-- 9) 控えの中で「今日いちばん大きい利用者ID」と、控えごとの最大ID(新しく登録した方の番号が一度でもクラウドに届いたか)
select id as 控えID, taken_at at time zone 'Asia/Tokyo' as 時刻, version,
  jsonb_array_length(coalesce(data->'patients','[]'::jsonb)) as 利用者数,
  (select max((p->>'id')::int) from jsonb_array_elements(coalesce(data->'patients','[]'::jsonb)) p) as 最大ID,
  data->>'patientIdSeq' as 連番
from app_state_snapshots where key = 'store_minamimizumoto' and taken_at > now() - interval '36 hours' order by taken_at;

-- ===== 11/9 23時 追加 =====
-- 9) の結果: 15:05〜15:25 の控え(18225/18258/18268)に 51名(最大ID 81・連番 81)、15:55(18332)で 50名・連番 79 に戻った。
-- 原因(コード): 保存の合成が「端末にいない利用者は復活させない」だったため、まだ取り込んでいない端末の保存で番号81が落ちた(試験版 trial534・安定版 1109c で修正)。

-- 10) 【復旧】番号81の方を 15:25 の控え(18268)から足し戻す(今いる方は触らない・時刻を今に刻む・連番は 81 以上に)
--     実行前に 4) で番号81の墓石が無いことを確認(あれば下の2本目も)
update app_state a
set data = jsonb_set(
      jsonb_set(a.data, '{patients}',
        a.data->'patients' || (
          select coalesce(jsonb_agg(p || jsonb_build_object('_savedAt', (extract(epoch from now())*1000)::bigint, '_updatedAt', (extract(epoch from now())*1000)::bigint)), '[]'::jsonb)
          from app_state_snapshots s, jsonb_array_elements(s.data->'patients') p
          where s.id = 18268
            and not exists (select 1 from jsonb_array_elements(a.data->'patients') c where c->>'id' = p->>'id')
        )),
      '{patientIdSeq}', to_jsonb(greatest(coalesce((a.data->>'patientIdSeq')::int, 0), 81))),
    version = coalesce(a.version,0) + 1
where a.key = 'store_minamimizumoto';
-- (番号81の墓石があるときだけ) update app_state a set data = a.data #- '{deletedIds,patients,81}', version = coalesce(a.version,0)+1 where a.key='store_minamimizumoto';
-- 確認
select jsonb_array_length(data->'patients') as 利用者数, data->>'patientIdSeq' as 連番,
  (select count(*) from jsonb_array_elements(data->'patients') p where p->>'id' = '81') as 番号81
from app_state where key = 'store_minamimizumoto';

-- 11) テスト店舗(store_test)が 22:30〜22:45 に空(利用者0・メンバー0)になっていた。同じ時間に Claude が2台のつもりの検査を流していたので、その控えと端末の記録
select id, version, taken_at at time zone 'Asia/Tokyo' as 時刻, jsonb_array_length(coalesce(data->'patients','[]'::jsonb)) as 利用者数, jsonb_array_length(coalesce(data->'storeMembers','[]'::jsonb)) as メンバー数
from app_state_snapshots where key = 'store_test' and taken_at > now() - interval '12 hours' order by taken_at;
select d.value->>'name' as 端末名, d.value->>'ver' as 版, l->>'t' as 端末時刻, (l->>'n')::int as 連番, l->>'ev' as 事象, left(l->>'d', 200) as 内容
from app_state a, jsonb_each(a.data) d, jsonb_array_elements(coalesce(d.value->'logs','[]'::jsonb)) l
where a.key = 'diag_store_test' and d.key not like '\_\_%' and (d.value->>'at')::bigint > (extract(epoch from now() - interval '6 hours') * 1000)::bigint
order by 端末名, 連番;

-- ===== 11/10 0時 追加 =====
-- 11) の端末の記録で確定: Claude の検査用の端末(証が無く行が読めない)が「行が無い=新規店舗」と誤認し、空の状態で上書きしていた(22:36〜22:42 に push-ok v184/191/192/195/197)。
--     安定版 1109d で、行の有無をサーバーで確かめてからでないと空で書かない・読み込み前の状態は書かないように直した。
-- 12) 【復旧・テスト店舗】利用者がいた最後の控えから丸ごと戻す(テスト店舗なので丸ごとでよい)
update app_state a
set data = s.data, version = coalesce(a.version,0) + 1
from (select data from app_state_snapshots where key = 'store_test' and jsonb_array_length(coalesce(data->'patients','[]'::jsonb)) > 0 order by taken_at desc limit 1) s
where a.key = 'store_test';
select jsonb_array_length(data->'patients') as 利用者数, jsonb_array_length(coalesce(data->'storeMembers','[]'::jsonb)) as メンバー数, version from app_state where key = 'store_test';
