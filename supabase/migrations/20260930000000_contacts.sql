-- 4기 사전신청자 연락처 (2026-09-30 운영 결정)
-- 전체 휴대폰 번호는 신청폼 명단(xlsx)에서 자동으로 연결해 넣는다(scripts/import-contacts.mts). 현장 직원이 따로 입력하지 않는다.
-- ⚠ 앱은 로그인 없이 공개라서 번호는 앱(anon)에서 절대 읽을 수 없게 둔다.
--    번호가 붙은 신청자 명단은 Supabase 대시보드(Table Editor → preorder4_applicants)에서만 본다.

create table if not exists public.participant_contacts (
  participant_id  uuid primary key references public.participants (id),
  mobile          text not null check (mobile ~ '^01[0-9]-[0-9]{3,4}-[0-9]{4}$'),
  source          text not null default 'applicants_xlsx',
  updated_at      timestamptz not null default now()
);
alter table public.participant_contacts enable row level security;
revoke all on public.participant_contacts from anon, authenticated;

-- 용도: 4기 프로그램에 신청자를 넣고(참여자_id = 앱 user_id), 문자로 안내할 때 내려받아 쓴다.
-- 4기 사전신청 = 설문 마무리의 preorder_4 가 '신청'인 응답 (삭제 표시된 응답 제외)
create or replace view public.preorder4_applicants as
select
  coalesce(p.full_name, p.name_masked, r.manual_info ->> 'name')           as 이름,
  c.mobile                                                                  as 휴대폰,
  coalesce(p.phone_last4, r.manual_info ->> 'phone_last4')                 as 뒷4자리,
  case r.track when 'A' then '활동 중' when 'B' then '쉬는 중' else '거의 미사용' end as 대상,
  case when jsonb_typeof(r.answers -> 'contact_pref') = 'array'
       then (select string_agg(x, ', ') from jsonb_array_elements_text(r.answers -> 'contact_pref') x)
       else r.answers ->> 'contact_pref' end                                as 안내_방법,
  case when r.participant_id is null then '명단 외' else '명단' end          as 구분,
  r.consent                                                                 as 개인정보_동의,
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
