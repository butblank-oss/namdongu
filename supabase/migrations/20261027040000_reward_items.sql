-- 리워드 정리 (2026-10-27, 현장 피드백)
-- · 일부 지급: 글로 적지 않고 받으신 리워드를 여러 개 고르기 (칼마디 / 콘드로이친 / 기타)
-- · 대상 아님: 칸 이름을 '지급 못한 사유'로
-- · 실명 칸은 쓰지 않음 (명단에 실명이 있고, 설문 시작 때 본인 확인). 응답 컬럼과 이어진 시스템 문항이라 지우지 않고 숨긴다
-- 여러 번 실행해도 결과가 같다. 설문이 잠겨 있으면 바꾸지 않는다.

update public.survey_schema s
   set payload = jsonb_set(s.payload, '{sections}', (
         select jsonb_object_agg(sec.key, (
           select coalesce(jsonb_agg(
             case e ->> 'key'
               when 'reward_partial' then
                 '{"key":"reward_partial","type":"multi","label":"받으신 리워드 (일부 수령)","required":true,
                   "help":"받으신 것만 골라 주세요. 리워드 종류가 더 있으면 관리자가 설문지 편집에서 보기를 추가합니다.",
                   "options":["칼마디","콘드로이친","기타"],
                   "showIf":{"key":"reward","in":["일부 지급 (재고 부족)"]}}'::jsonb
               when 'reward_reason' then jsonb_set(e, '{label}', '"지급 못한 사유"')
               when 'real_name' then jsonb_set(jsonb_set(e, '{label}', '"실명 (사용 안 함)"'), '{showIf}', '{"key":"reward","in":[]}')
               else e
             end order by i), '[]'::jsonb)
           from jsonb_array_elements(sec.value) with ordinality as t(e, i)
         ))
         from jsonb_each(s.payload -> 'sections') sec
       ))
 where s.id = 1 and not s.locked
   and not (s.payload::text like '%받으신 리워드 (일부 수령)%');
