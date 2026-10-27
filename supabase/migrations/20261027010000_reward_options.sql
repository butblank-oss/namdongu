-- 리워드 보기 변경 (2026-10-27)
-- '추후 배송' → '수량 부족 · 보건소 방문 지급', '대상 아님'을 고르면 사유를 적는 칸(reward_reason)을 보인다.
-- 이미 '추후 배송'으로 저장된 응답도 새 이름으로 바꾼다. 여러 번 실행해도 결과가 같다. 설문이 잠겨 있으면 설문지는 그대로 둔다.

-- 1) 설문지: 보기 이름 바꾸기 (리워드 보기 + 실명 문항의 표시 조건)
update public.survey_schema
   set payload = replace(payload::text, '"추후 배송"', '"수량 부족 · 보건소 방문 지급"')::jsonb
 where id = 1 and not locked and payload::text like '%"추후 배송"%';

-- 2) 설문지: '리워드 처리' 바로 뒤에 '대상 아님 사유' 넣기 (어느 섹션에 있든)
update public.survey_schema s
   set payload = jsonb_set(s.payload, array['sections', sec.name], (
         select jsonb_agg(x order by o)
           from (
             select e as x, i * 2 as o from jsonb_array_elements(s.payload -> 'sections' -> sec.name) with ordinality as t(e, i)
             union all
             select '{"key":"reward_reason","type":"text","label":"대상 아님 사유","showIf":{"key":"reward","in":["대상 아님"]}}'::jsonb,
                    i * 2 + 1
               from jsonb_array_elements(s.payload -> 'sections' -> sec.name) with ordinality as t(e, i)
              where e ->> 'key' = 'reward'
           ) z
       ))
  from (
    select k as name from public.survey_schema s2, jsonb_object_keys(s2.payload -> 'sections') k
     where s2.id = 1
       and exists (select 1 from jsonb_array_elements(s2.payload -> 'sections' -> k) e where e ->> 'key' = 'reward')
     limit 1
  ) sec
 where s.id = 1 and not s.locked and not (s.payload::text like '%"reward_reason"%');

-- 3) 이미 저장된 응답
update public.responses
   set answers = jsonb_set(answers, '{reward}', '"수량 부족 · 보건소 방문 지급"'),
       client_rev = client_rev + 1
 where answers ->> 'reward' = '추후 배송';
