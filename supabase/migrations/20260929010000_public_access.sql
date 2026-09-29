-- 로그인 없이 쓰기 (2026-09-29 운영 결정)
-- 페이지를 열면 담당자가 자기 이름을 골라 바로 쓴다. 개인 계정·비밀번호 없음.
-- ⚠ 결과: 페이지 주소와 anon key(번들에 포함)를 아는 사람은 누구나 명단을 조회하고 응답을 쓸 수 있다.
--   남아 있는 보호: 명단 쓰기 불가, 응답 하드 삭제 불가, 열람 기록 수정·삭제·조회 불가, 행사 잠금, 응답 있는 key 보호.

-- admin 판정은 이제 화면에서만 한다(고른 이름의 staff.role). DB 쪽 admin 제한은 푼다.
drop policy if exists staff_select on public.staff;
drop policy if exists staff_admin_insert on public.staff;
drop policy if exists staff_admin_update on public.staff;
drop policy if exists participants_select on public.participants;
drop policy if exists responses_select on public.responses;
drop policy if exists responses_insert on public.responses;
drop policy if exists responses_update on public.responses;
drop policy if exists survey_schema_select on public.survey_schema;
drop policy if exists survey_schema_admin_insert on public.survey_schema;
drop policy if exists survey_schema_admin_update on public.survey_schema;
drop policy if exists access_log_insert on public.access_log;
drop policy if exists access_log_admin_select on public.access_log;

grant select, insert, update on public.staff to anon, authenticated;
grant select on public.participants to anon, authenticated;
grant select, insert, update on public.responses to anon, authenticated;
grant select, insert, update on public.survey_schema to anon, authenticated;
grant insert on public.access_log to anon, authenticated;
revoke select on public.access_log from anon, authenticated;  -- 열람 기록은 Supabase 대시보드에서만 본다

create policy staff_all_select on public.staff for select to anon, authenticated using (true);
create policy staff_all_insert on public.staff for insert to anon, authenticated with check (true);
create policy staff_all_update on public.staff for update to anon, authenticated using (true) with check (true);

create policy participants_all_select on public.participants for select to anon, authenticated using (true);

create policy responses_all_select on public.responses for select to anon, authenticated using (true);
create policy responses_all_insert on public.responses for insert to anon, authenticated with check (true);
create policy responses_all_update on public.responses for update to anon, authenticated using (true) with check (true);

create policy survey_schema_all_select on public.survey_schema for select to anon, authenticated using (true);
create policy survey_schema_all_insert on public.survey_schema for insert to anon, authenticated with check (true);
create policy survey_schema_all_update on public.survey_schema for update to anon, authenticated using (true) with check (true);

create policy access_log_all_insert on public.access_log for insert to anon, authenticated with check (true);
