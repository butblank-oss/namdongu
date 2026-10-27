-- 앱 업데이트 안내 (2026-10-27)
-- 명단의 앱 버전을 저장하고, 설문 마무리에 '앱 업데이트' 문항을 넣는다 (전 회원 대상, 인쇄 용지에는 없음).
-- 버전 값은 scripts/import-app-versions.mts 로 채운다.

alter table public.participants add column if not exists app_version text;
alter table public.participants add column if not exists app_os text;

-- 마무리 섹션의 '응대 결과' 바로 앞에 문항 2개를 넣는다. 이미 있거나 설문이 잠겨 있으면 그대로 둔다.
update public.survey_schema s
   set payload = jsonb_set(s.payload, '{sections,closing}', (
         with cur as (
           select e, i from jsonb_array_elements(s.payload -> 'sections' -> 'closing') with ordinality as t(e, i)
         ), pos as (
           select coalesce((select min(i) - 1 from cur where e ->> 'key' = 'result'), (select count(*) from cur)) as p
         )
         select coalesce((select jsonb_agg(e order by i) from cur, pos where i <= pos.p), '[]'::jsonb)
           || '[
                {"key":"app_update","type":"single","label":"앱 업데이트 (최신 4.1.1)","required":true,
                 "help":"휴대폰에서 Play 스토어(아이폰은 App Store) → 맬리브레인 → 업데이트",
                 "options":["이미 최신","현장에서 업데이트 완료","업데이트 못함"]},
                {"key":"app_update_fail","type":"single","label":"업데이트 못한 이유","required":true,
                 "options":["저장 공간 부족","스토어 로그인 모름","시간이 부족함","원하지 않으심","기타"],
                 "showIf":{"key":"app_update","in":["업데이트 못함"]}}
              ]'::jsonb
           || coalesce((select jsonb_agg(e order by i) from cur, pos where i > pos.p), '[]'::jsonb)
       ))
 where s.id = 1
   and not s.locked
   and not (s.payload::text like '%"app_update"%');
