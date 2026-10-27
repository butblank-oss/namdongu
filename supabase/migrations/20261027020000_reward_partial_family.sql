-- 리워드 일부 지급 + 가족 연락처 (2026-10-27)
-- 1) 리워드에 '일부 지급 (재고 부족)' 보기와 '드린 것 / 못 드린 것' 칸
-- 2) '앞으로 안내받고 싶은 방법'에서 '가족을 통해'를 고르면: 가족 본인 동의(고지문) → 동의 시 가족 성함·관계·번호
-- 여러 번 실행해도 결과가 같다. 설문이 잠겨 있으면 바꾸지 않는다.

-- 설문지의 어느 섹션이든 after_key 문항 바로 뒤에 items 를 넣는다 (이 파일에서만 쓰고 지운다)
create or replace function public._schema_insert_after(p jsonb, after_key text, items jsonb) returns jsonb
language plpgsql as $$
declare sec text; arr jsonb; out jsonb; e jsonb;
begin
  for sec in select jsonb_object_keys(p -> 'sections') loop
    arr := p -> 'sections' -> sec;
    if exists (select 1 from jsonb_array_elements(arr) x where x ->> 'key' = after_key) then
      out := '[]'::jsonb;
      for e in select x from jsonb_array_elements(arr) x loop
        out := out || jsonb_build_array(e);
        if e ->> 'key' = after_key then out := out || items; end if;
      end loop;
      return jsonb_set(p, array['sections', sec], out);
    end if;
  end loop;
  return p;
end $$;

-- 1) 리워드 보기 ('현장 지급' 바로 뒤) + 실명 칸 표시 조건
update public.survey_schema
   set payload = replace(payload::text,
         '"현장 지급", "수량 부족 · 보건소 방문 지급"',
         '"현장 지급", "일부 지급 (재고 부족)", "수량 부족 · 보건소 방문 지급"')::jsonb
 where id = 1 and not locked and payload::text not like '%일부 지급 (재고 부족)%';

update public.survey_schema
   set payload = public._schema_insert_after(payload, 'reward', '[
         {"key":"reward_partial","type":"text","label":"드린 것 / 못 드린 것",
          "help":"예) 칼마디 현장 지급 / 콘드로이친 재고 부족으로 미지급",
          "showIf":{"key":"reward","in":["일부 지급 (재고 부족)"]}}
       ]'::jsonb)
 where id = 1 and not locked and payload::text not like '%"reward_partial"%';

-- 2) 가족 연락처 ('앞으로 안내받고 싶은 방법' 바로 뒤)
update public.survey_schema
   set payload = public._schema_insert_after(payload, 'contact_pref', '[
         {"key":"family_consent","type":"single","label":"[선택] 가족 연락처 수집·이용에 동의하십니까? (가족분 본인 동의)",
          "help":"가족분이 현장에 계시거나 전화로 직접 동의하신 경우에만 받아 주세요. 어르신이 대신 동의하실 수 없습니다.",
          "options":["동의","미동의"],
          "showIf":{"key":"contact_pref","in":["가족을 통해"]},
          "notice":"원메딕스는 맬리브레인 안내를 가족분께 전하기 위해 아래와 같이 개인정보를 수집·이용합니다.\n· 목적: 맬리브레인 4기 모집·일정·이용 안내를 가족분께 전달\n· 항목: 가족분 성함, 어르신과의 관계, 휴대폰 번호\n· 보유 기간: 4기 프로그램 종료 시까지 (동의를 철회하시면 바로 파기)\n· 동의하지 않으실 수 있으며, 동의하지 않으셔도 어르신의 참여에는 영향이 없습니다."},
         {"key":"family_contact","type":"text","label":"가족 성함 · 관계 · 휴대폰 번호",
          "help":"예) 김영희 · 딸 · 010-1234-5678",
          "showIf":{"key":"family_consent","in":["동의"]}}
       ]'::jsonb)
 where id = 1 and not locked and payload::text not like '%"family_consent"%';

drop function public._schema_insert_after(jsonb, text, jsonb);
