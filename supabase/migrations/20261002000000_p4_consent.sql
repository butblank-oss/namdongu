-- 4기 사전신청 동의 칸 추가 (2026-10-02)
-- 설문 마무리의 p4_privacy(4기 참여 개인정보 수집·이용, 필수)와 p4_sms(문자 수신, 선택)를 신청자 표에 붙인다.
-- 4기에 넣을 명단은 "4기_등록_가능 = true"인 분만, 문자는 "문자_수신_동의 = 동의"인 분에게만.
-- 열 순서가 바뀌므로 뷰를 지우고 다시 만든다 (데이터는 responses 에 있으므로 잃는 것 없음).

drop view if exists public.preorder4_applicants;
create view public.preorder4_applicants as
select
  coalesce(p.full_name, p.name_masked, r.manual_info ->> 'name')           as 이름,
  c.mobile                                                                  as 휴대폰,
  (coalesce(r.answers ->> 'p4_privacy', '') = '동의')                       as "4기_등록_가능",
  r.answers ->> 'p4_privacy'                                                as "4기_개인정보_동의",
  r.answers ->> 'p4_sms'                                                    as 문자_수신_동의,
  coalesce(p.phone_last4, r.manual_info ->> 'phone_last4')                 as 뒷4자리,
  case r.track when 'A' then '활동 중' when 'B' then '쉬는 중' else '거의 미사용' end as 대상,
  case when jsonb_typeof(r.answers -> 'contact_pref') = 'array'
       then (select string_agg(x, ', ') from jsonb_array_elements_text(r.answers -> 'contact_pref') x)
       else r.answers ->> 'contact_pref' end                                as 안내_방법,
  case when r.participant_id is null then '명단 외' else '명단' end          as 구분,
  r.consent                                                                 as 설문_개인정보_동의,
  r.entered_by                                                              as 입력자,
  coalesce(r.completed_at, r.updated_at)                                    as 응답_시각,
  r.id                                                                      as 응답_id,
  r.participant_id                                                          as 참여자_id
from public.responses r
left join public.participants p on p.id = r.participant_id
left join public.participant_contacts c on c.participant_id = r.participant_id
where r.deleted_at is null
  and r.answers ->> 'preorder_4' = '신청'
order by coalesce(r.completed_at, r.updated_at);

revoke all on public.preorder4_applicants from anon, authenticated;
