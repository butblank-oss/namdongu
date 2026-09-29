-- 맬리브레인 보건소 팝업 현장 설문 — 초기 스키마
-- 원칙: 모든 테이블 RLS, authenticated만 접근. 명단(participants)은 service role로만 쓴다.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────
-- staff (담당자)
-- ─────────────────────────────────────────────
create table public.staff (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  active        boolean not null default true,
  role          text not null default 'operator' check (role in ('admin', 'operator')),
  auth_user_id  uuid unique,
  created_at    timestamptz not null default now()
);

insert into public.staff (name) values
  ('강하연'), ('김다희'), ('김도영'), ('김성정'), ('김소리'), ('김철순'), ('노준성'),
  ('박유라'), ('안성호'), ('윤종훈'), ('이승민'), ('이용혁'), ('홍지혜');

-- 현재 로그인 사용자가 admin인지. RLS 정책 안에서 staff를 다시 읽으므로 security definer.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff
    where auth_user_id = auth.uid() and role = 'admin' and active
  );
$$;

-- ─────────────────────────────────────────────
-- participants (명단, 클라이언트 읽기 전용)
-- ─────────────────────────────────────────────
create table public.participants (
  id                         uuid primary key,
  name_masked                text not null,
  phone_last4                text check (phone_last4 is null or phone_last4 ~ '^[0-9]{4}$'),
  birth_year                 text check (birth_year is null or birth_year ~ '^[0-9]{4}$'),
  age_group                  text not null default '?' check (age_group in ('60', '70', '80', '90', '?')),
  sex                        text not null default '?' check (sex in ('F', 'M', '?')),
  days_since_last_activity   int,
  total_activity_cnt         int not null default 0,
  cohort                     text not null default '?' check (cohort in ('3', '2', '1', '?')),  -- 3기=2026, 2기=2025, 1기=2024. 명단은 3기만 임포트
  track                      text not null check (track in ('A', 'B', 'C')),
  snapshot_date              date not null,
  active                     boolean not null default true,  -- 재임포트 시 빠진 사람(탈퇴 등)은 false
  updated_at                 timestamptz not null default now()
);
create index participants_phone_last4_idx on public.participants (phone_last4);

-- ─────────────────────────────────────────────
-- responses (응답)
-- ─────────────────────────────────────────────
create table public.responses (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid references public.participants (id),
  manual_info     jsonb,
  track           text not null check (track in ('A', 'B', 'C')),
  verified        text not null default 'skipped' check (verified in ('ok', 'failed', 'skipped')),
  verified_by     text,
  verified_at     timestamptz,
  real_name       text,
  consent         text check (consent is null or consent in ('동의', '미동의')),
  helpers         text[] not null default '{}',
  answers         jsonb not null default '{}'::jsonb,
  status          text not null default 'in_progress' check (status in ('in_progress', 'done', 'refused', 'revisit')),
  result          text,
  entered_by      text,
  device_id       text,
  schema_version  int,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  updated_at      timestamptz not null default now(),
  client_rev      int not null default 0,
  deleted_at      timestamptz,
  check (participant_id is not null or manual_info is not null)
);
-- 명단 인원 1명당 응답 1건 (명단 외 추가는 participant_id가 null이므로 예외)
create unique index responses_participant_unique
  on public.responses (participant_id)
  where participant_id is not null and deleted_at is null;
create index responses_updated_at_idx on public.responses (updated_at);

-- 서버 시각으로 updated_at 갱신 + 오래된 client_rev로 덮어쓰기 방지
create or replace function public.responses_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.client_rev < old.client_rev then
    -- 다른 기기의 더 최신 편집을 과거 버전이 덮어쓰지 않게 한다
    raise exception 'stale write: client_rev % < %', new.client_rev, old.client_rev
      using errcode = 'P0001', hint = 'STALE_REV';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger responses_before_write
  before insert or update on public.responses
  for each row execute function public.responses_before_write();

-- ─────────────────────────────────────────────
-- survey_schema (설문 정의)
-- ─────────────────────────────────────────────
create table public.survey_schema (
  id          int primary key default 1 check (id = 1),  -- 행사 하나, 행 하나
  version     int not null default 1,
  payload     jsonb not null,
  locked      boolean not null default false,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

-- 잠금 규칙:
--  * locked=true 인 행은 어떤 변경도 거부한다. 단 잠금 해제(locked true→false)만 단독으로 허용.
--  * 저장할 때마다 version을 올린다.
--  * 이미 응답이 존재하는 질문 key는 삭제/변경할 수 없다.
create or replace function public.survey_schema_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  used_key text;
  new_keys text[];
begin
  if old.locked then
    if new.locked = false and new.payload = old.payload then
      new.version := old.version;
      new.updated_at := now();
      return new;
    end if;
    raise exception 'survey_schema is locked' using errcode = 'P0001', hint = 'LOCKED';
  end if;

  if new.payload is distinct from old.payload then
    select coalesce(array_agg(q ->> 'key'), '{}') into new_keys
    from jsonb_each(new.payload -> 'sections') s,
         jsonb_array_elements(s.value) q
    where q ->> 'type' <> 'divider';

    select k into used_key
    from (
      select distinct jsonb_object_keys(r.answers) as k
      from public.responses r
      where r.deleted_at is null
    ) used
    where not (k = any (new_keys))
    limit 1;

    if used_key is not null then
      raise exception 'question key "%" already has responses', used_key
        using errcode = 'P0001', hint = 'KEY_IN_USE';
    end if;
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger survey_schema_before_update
  before update on public.survey_schema
  for each row execute function public.survey_schema_before_update();

-- ─────────────────────────────────────────────
-- access_log (열람 기록, append-only)
-- ─────────────────────────────────────────────
create table public.access_log (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid,
  response_id     uuid,
  staff_name      text not null,
  action          text not null check (action in ('view', 'verify', 'export', 'delete')),
  reason          text,  -- 보건소 협의 후 필수화 가능. 현재는 비워 둔다
  auth_user_id    uuid default auth.uid(),
  at              timestamptz not null default now()
);
create index access_log_participant_idx on public.access_log (participant_id);

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
alter table public.staff         enable row level security;
alter table public.participants  enable row level security;
alter table public.responses     enable row level security;
alter table public.survey_schema enable row level security;
alter table public.access_log    enable row level security;

-- anon에게는 아무 권한도 주지 않는다 (RLS 이전에 GRANT 단계에서 거부 → 401/403)
revoke all on public.staff, public.participants, public.responses, public.survey_schema, public.access_log from anon;
revoke all on public.staff, public.participants, public.responses, public.survey_schema, public.access_log from authenticated;

-- staff: 누구나(로그인) 조회, 본인 계정 연결과 명단 편집은 admin만
grant select on public.staff to authenticated;
grant insert, update on public.staff to authenticated;
create policy staff_select on public.staff for select to authenticated using (true);
create policy staff_admin_insert on public.staff for insert to authenticated with check (public.is_admin());
create policy staff_admin_update on public.staff for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- participants: select만. insert/update/delete 권한 자체가 없다 (service role은 RLS 우회)
grant select on public.participants to authenticated;
create policy participants_select on public.participants for select to authenticated using (true);

-- responses: select/insert/update. delete 권한 없음 → 소프트 삭제(deleted_at)만 가능
grant select, insert, update on public.responses to authenticated;
create policy responses_select on public.responses for select to authenticated using (true);
create policy responses_insert on public.responses for insert to authenticated with check (true);
create policy responses_update on public.responses for update to authenticated using (true) with check (true);

-- survey_schema: 조회는 전원, 수정은 admin만 (잠금은 트리거가 막는다)
grant select, insert, update on public.survey_schema to authenticated;
create policy survey_schema_select on public.survey_schema for select to authenticated using (true);
-- 최초 1회: 앱에 내장된 기본 설문을 admin이 올린다
create policy survey_schema_admin_insert on public.survey_schema for insert to authenticated
  with check (public.is_admin());
create policy survey_schema_admin_update on public.survey_schema for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- access_log: insert만. 조회는 admin만, update/delete 불가
grant select, insert on public.access_log to authenticated;
create policy access_log_insert on public.access_log for insert to authenticated with check (true);
create policy access_log_admin_select on public.access_log for select to authenticated using (public.is_admin());

-- ─────────────────────────────────────────────
-- Realtime
-- ─────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.responses, public.survey_schema, public.staff;
  end if;
end $$;
