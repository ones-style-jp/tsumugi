-- 2026-11-05 写真が「image.jpg」と出て見られない件の確認(見るだけ・何も書き換えません)。Supabase の SQL Editor で 1 つずつ実行。
-- 写真の置き場所は pf/<利用者の番号>/… で、店舗の区別がない。利用者の番号は店舗ごとに 1,2,3… と振るので、
-- 別の店舗で同じ番号の利用者を「完全に削除」すると、その番号のフォルダごと消え、他の店舗の同じ番号の方の写真も消える(1105c で修正)。

-- ① 店舗ごと: 記録が指している写真のうち、置き場所に無いものの数
with refs as (
  select coalesce(a.data->'systemSettings'->'facilityInfo'->>'name', a.key) as 店舗, m[1] as path
    from app_state a, regexp_matches(a.data::text, '"storagePath": ?"([^"]+)"', 'g') m
)
select r.店舗, split_part(r.path, '/', 1) as 種類, count(*) as 指している数, count(*) filter (where o.name is null) as 無い数
  from refs r left join storage.objects o on o.bucket_id = 'personal-files' and o.name = r.path
 group by 1, 2 order by 4 desc, 1;

-- ② 負担割合証・保険証・お薬手帳・その他書類で、写真が無いもの(利用者の番号・登録日だけ。名前は出しません)
select coalesce(a.data->'systemSettings'->'facilityInfo'->>'name', a.key) as 店舗, p->>'id' as 利用者の番号, k as 書類, d->>'uploadedAt' as 登録日, d->>'storagePath' as 置き場所
  from app_state a, jsonb_array_elements(a.data->'patients') p, unnest(array['docInsurance','docBurden','medicationImages','docOther']) k,
       jsonb_array_elements(case when jsonb_typeof(p->k) = 'array' then p->k else '[]'::jsonb end) d
 where d ? 'storagePath'
   and not exists (select 1 from storage.objects o where o.bucket_id = 'personal-files' and o.name = d->>'storagePath')
 order by 1, 2;

-- ③ フォルダごと消えた番号(記録は指しているのに、そのフォルダに 1 枚も無い)＝ 別の店舗の「完全に削除」で消えた疑い
with refs as (
  select coalesce(a.data->'systemSettings'->'facilityInfo'->>'name', a.key) as 店舗, m[1] as path
    from app_state a, regexp_matches(a.data::text, '"storagePath": ?"((?:pf|fs)/[^/"]+)/[^"]+"', 'g') m
)
select r.path as フォルダ, string_agg(distinct r.店舗, '・') as 指している店舗, count(*) as 指している数
  from refs r
 where not exists (select 1 from storage.objects o where o.bucket_id = 'personal-files' and o.name like r.path || '/%')
 group by 1 order by 3 desc;
