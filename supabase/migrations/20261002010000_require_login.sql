-- 로그인 필수로 되돌린다 (2026-10-02, 개발팀 검토 반영)
-- 20260929010000_public_access.sql 로 열어 둔 익명(anon) 권한을 모두 회수하고,
-- 담당자 계정(Supabase Auth)으로 로그인한 사람만 읽고 쓴다.
--
-- 계정: 담당자마다 회사 이메일로 Auth 사용자를 만들고 staff.auth_user_id 에 연결한다 (scripts/create-staff-accounts.mts).
--       첫 비밀번호 = 본인 휴대폰 번호(숫자만). 첫 로그인 직후 새 비밀번호로 바꾸기 전까지는 앱을 쓸 수 없다.
-- ⚠ 이 파일을 실행하는 순간 로그인 없는 옛 앱은 더 이상 데이터를 읽지 못한다.

-- ─────────────────────────────────────────────
-- 1. 공개 정책 제거 + 익명 권한 회수
-- ─────────────────────────────────────────────
drop policy if exists staff_all_select on public.staff;
drop policy if exists staff_all_insert on public.staff;
drop policy if exists staff_all_update on public.staff;
drop policy if exists participants_all_select on public.participants;
drop policy if exists responses_all_select on public.responses;
drop policy if exists responses_all_insert on public.responses;
drop policy if exists responses_all_update on public.responses;
drop policy if exists survey_schema_all_select on public.survey_schema;
drop policy if exists survey_schema_all_insert on public.survey_schema;
drop policy if exists survey_schema_all_update on public.survey_schema;
drop policy if exists access_log_all_insert on public.access_log;

revoke all on public.staff, public.participants, public.responses, public.survey_schema, public.access_log
  from anon, authenticated;
revoke all on public.participant_contacts from anon, authenticated;
revoke all on public.preorder4_applicants from anon, authenticated;

-- ─────────────────────────────────────────────
-- 2. 담당자 계정 정보
-- ─────────────────────────────────────────────
alter table public.staff add column if not exists email text unique;
alter table public.staff add column if not exists must_change_password boolean not null default true;

-- 첫 비밀번호의 해시 사본. 새 비밀번호로 바꿨는지 확인할 때만 쓴다. 아무 역할에도 권한을 주지 않는다.
create table if not exists public.staff_initial_password (
  auth_user_id  uuid primary key,
  password_hash text,
  captured_at   timestamptz not null default now()
);
alter table public.staff_initial_password enable row level security;
revoke all on public.staff_initial_password from anon, authenticated;

-- 로그인한 사람이 활성 담당자인지 (RLS 안에서 staff 를 다시 읽으므로 security definer)
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where auth_user_id = auth.uid() and active);
$$;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- 계정을 연결하거나 비밀번호를 초기화하면(must_change_password → true) 그 시점의 비밀번호 해시를 남긴다
create or replace function public.staff_capture_initial_password() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare capture boolean;
begin
  if tg_op = 'INSERT' then
    -- upsert 가 기존 행과 부딪히는 경우는 UPDATE 트리거가 처리한다 (여기서 첫 비밀번호를 다시 찍지 않게)
    if exists (select 1 from public.staff where id = new.id) then return new; end if;
    capture := new.auth_user_id is not null;
  else
    capture := new.auth_user_id is not null and (
      new.auth_user_id is distinct from old.auth_user_id
      or (new.must_change_password and not old.must_change_password));
  end if;
  if capture then
    new.must_change_password := true;
    insert into public.staff_initial_password (auth_user_id, password_hash, captured_at)
      values (new.auth_user_id, (select encrypted_password from auth.users where id = new.auth_user_id), now())
      on conflict (auth_user_id) do update set password_hash = excluded.password_hash, captured_at = excluded.captured_at;
  end if;
  return new;
end $$;
drop trigger if exists staff_capture_initial_password on public.staff;
create trigger staff_capture_initial_password before insert or update on public.staff
  for each row execute function public.staff_capture_initial_password();

-- 새 비밀번호로 바꾼 뒤 앱이 부른다. 해시가 첫 비밀번호와 달라졌을 때만 '변경 완료'로 표시한다.
-- 반환: 아직 바꿔야 하면 true
create or replace function public.password_changed() returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  update public.staff s set must_change_password = false
   where s.auth_user_id = uid and s.must_change_password
     and (select encrypted_password from auth.users where id = uid)
         is distinct from (select password_hash from public.staff_initial_password where auth_user_id = uid);
  return coalesce((select must_change_password from public.staff where auth_user_id = uid), true);
end $$;
revoke all on function public.password_changed() from public, anon;
grant execute on function public.password_changed() to authenticated;

-- ─────────────────────────────────────────────
-- 3. 로그인한 담당자만 (DB 쪽에서 admin 제한 복구)
-- ─────────────────────────────────────────────
grant select, insert, update on public.staff to authenticated;
create policy staff_select on public.staff for select to authenticated using (public.is_staff());
create policy staff_admin_insert on public.staff for insert to authenticated with check (public.is_admin());
create policy staff_admin_update on public.staff for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.participants to authenticated;
create policy participants_select on public.participants for select to authenticated using (public.is_staff());

grant select, insert, update on public.responses to authenticated;
create policy responses_select on public.responses for select to authenticated using (public.is_staff());
create policy responses_insert on public.responses for insert to authenticated with check (public.is_staff());
create policy responses_update on public.responses for update to authenticated using (public.is_staff()) with check (public.is_staff());

grant select, insert, update on public.survey_schema to authenticated;
create policy survey_schema_select on public.survey_schema for select to authenticated using (public.is_staff());
create policy survey_schema_admin_insert on public.survey_schema for insert to authenticated with check (public.is_admin());
create policy survey_schema_admin_update on public.survey_schema for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 열람 기록: 쓰기만 (조회는 대시보드에서)
grant insert on public.access_log to authenticated;
create policy access_log_insert on public.access_log for insert to authenticated with check (public.is_staff());

-- ─────────────────────────────────────────────
-- 4. 열람 기록의 담당자는 로그인 계정 기준 (화면에서 보낸 이름은 무시)
-- ─────────────────────────────────────────────
create or replace function public.access_log_stamp_staff() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.auth_user_id := auth.uid();
    new.staff_name := coalesce((select name from public.staff where auth_user_id = auth.uid()), new.staff_name);
  end if;
  return new;
end $$;
drop trigger if exists access_log_stamp_staff on public.access_log;
create trigger access_log_stamp_staff before insert on public.access_log
  for each row execute function public.access_log_stamp_staff();
