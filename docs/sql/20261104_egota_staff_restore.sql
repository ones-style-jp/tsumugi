-- 2026-11-04 江古田店: 担当職員を削除・役職変更したことで過去の日誌の担当職員と送迎表の運転者の表示が消えた件の復旧
-- 本部が Supabase の SQL Editor で実行する。店舗での操作は不要。実行前に app_state の退避を取る。
-- 前提: 試験版 trial519 / 安定版 1104a 以降(担当職員の _to・_roles を見る版)が店舗に届いていること。
-- 置き換える所: <店舗キー>(例 store_egota)、<控えのid>、<変更があった日>(YYYY-MM-DD)、<役職を変えた職員のid>

-- 0) 退避
create table if not exists app_state_rescue_20261104 as select * from app_state;

-- 1) 変更より前の控えを探す(直近7日・5分おき)。変更があった日の朝の控えを選ぶ
select id, taken_at, version from app_state_snapshots where key = '<店舗キー>' and taken_at < '<変更があった日> 12:00+09' order by taken_at desc limit 20;

-- 2) 控えの担当職員(id・名前・役職)と、いまの担当職員を見比べる
select s->>'id' as id, s->>'name' as name, s->>'role' as role, s->>'role2' as role2
  from app_state_snapshots sn, jsonb_array_elements(sn.data->'diarySettings'->'staff') s where sn.id = <控えのid>;
select s->>'id' as id, s->>'name' as name, s->>'role' as role, s->>'role2' as role2, s->>'_to' as _to
  from app_state a, jsonb_array_elements(a.data->'diarySettings'->'staff') s where a.key = '<店舗キー>';

-- 3) 消された職員を、いつまで=<変更があった日の前日> を付けて戻す(いまの一覧に同じ id が無い人だけ)
update app_state a
   set data = jsonb_set(a.data, '{diarySettings,staff}',
         (a.data->'diarySettings'->'staff') ||
         coalesce((select jsonb_agg(s || jsonb_build_object('_to', '<変更があった日の前日>'))
                     from app_state_snapshots sn, jsonb_array_elements(sn.data->'diarySettings'->'staff') s
                    where sn.id = <控えのid>
                      and not exists (select 1 from jsonb_array_elements(a.data->'diarySettings'->'staff') c where c->>'id' = s->>'id')), '[]'::jsonb)),
       version = a.version + 1
 where a.key = '<店舗キー>';

-- 4) 役職を変えた職員(介護職員→生活相談員)に、前の役職の履歴を付ける(前日まで介護職員)
update app_state a
   set data = jsonb_set(a.data, '{diarySettings,staff}',
         (select jsonb_agg(case when s->>'id' = '<役職を変えた職員のid>'
                                 then s || jsonb_build_object('_roles', coalesce(s->'_roles', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('until', '<変更があった日の前日>', 'role', '介護職員', 'role2', '')))
                                 else s end)
            from jsonb_array_elements(a.data->'diarySettings'->'staff') s)),
       version = a.version + 1
 where a.key = '<店舗キー>';

-- 5) 確認: 担当職員の一覧(_to・_roles が付いているか)
select s->>'name' as name, s->>'role' as role, s->>'_to' as _to, s->'_roles' as roles
  from app_state a, jsonb_array_elements(a.data->'diarySettings'->'staff') s where a.key = '<店舗キー>';
-- 戻すとき: update app_state a set data = r.data, version = a.version + 1 from app_state_rescue_20261104 r where r.key = a.key and a.key = '<店舗キー>';
