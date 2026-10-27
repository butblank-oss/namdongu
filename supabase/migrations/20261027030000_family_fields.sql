-- 가족 연락처를 칸 세 개로 (2026-10-27): 성함 / 관계(고르기) / 휴대폰 번호(010-1234-5678 형식)
-- 한 칸('가족 성함 · 관계 · 휴대폰 번호')에 받으면 나중에 나눠 정리해야 해서.
-- 옛 칸(family_contact)은 응답이 없을 때만 지운다 (있으면 그대로 두고 새 칸을 그 뒤에 넣는다).
-- 여러 번 실행해도 결과가 같다. 설문이 잠겨 있으면 바꾸지 않는다.

do $$
declare
  p jsonb;
  sec text;
  arr jsonb;
  out jsonb;
  e jsonb;
  after_key text;
  used boolean;
  items jsonb := '[
    {"key":"family_name","type":"text","label":"가족 성함",
     "showIf":{"key":"family_consent","in":["동의"]}},
    {"key":"family_relation","type":"single","label":"어르신과의 관계",
     "options":["배우자","아들","딸","며느리","사위","손자녀","형제자매","기타"],
     "showIf":{"key":"family_consent","in":["동의"]}},
    {"key":"family_phone","type":"text","label":"가족 휴대폰 번호","format":"phone",
     "help":"숫자만 누르면 010-1234-5678 형식으로 저장돼요",
     "showIf":{"key":"family_consent","in":["동의"]}}
  ]'::jsonb;
begin
  select payload into p from public.survey_schema where id = 1 and not locked;
  if p is null or p::text like '%"family_phone"%' then return; end if;

  used := exists (select 1 from public.responses where deleted_at is null and answers ? 'family_contact');
  after_key := case when p::text like '%"family_contact"%' then 'family_contact' else 'family_consent' end;

  for sec in select jsonb_object_keys(p -> 'sections') loop
    arr := p -> 'sections' -> sec;
    if exists (select 1 from jsonb_array_elements(arr) x where x ->> 'key' = after_key) then
      out := '[]'::jsonb;
      for e in select x from jsonb_array_elements(arr) x loop
        if not (e ->> 'key' = 'family_contact' and not used) then out := out || jsonb_build_array(e); end if;
        if e ->> 'key' = after_key then out := out || items; end if;
      end loop;
      update public.survey_schema set payload = jsonb_set(p, array['sections', sec], out) where id = 1;
      return;
    end if;
  end loop;
end $$;
