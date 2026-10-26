-- 현장 대기번호 (2026-10-26)
-- 입구에서 번호표(1~160)를 드리고, 자리가 빈 직원이 앱에서 '다음 분 호출'을 누르면 번호가 1씩 올라간다.
-- 대기석 큰 화면(#/queue)과 직원 앱이 실시간으로 같은 번호를 본다. 부른 번호는 그 직원의 다음 설문에 자동으로 들어간다.

-- 응답에 대기번호
alter table public.responses add column if not exists queue_no int
  check (queue_no is null or queue_no between 1 and 999);

-- 지금까지 부른 마지막 번호 (한 줄만)
create table if not exists public.queue_state (
  id          int primary key default 1 check (id = 1),
  last_called int not null default 0 check (last_called >= 0),
  max_number  int not null default 160 check (max_number between 1 and 999),
  updated_at  timestamptz not null default now()
);
insert into public.queue_state (id) values (1) on conflict (id) do nothing;

-- 부른 번호 기록 (큰 화면의 '방금 부른 번호', 다시 부르기)
create table if not exists public.queue_calls (
  number    int primary key check (number between 1 and 999),
  called_by text,
  called_at timestamptz not null default now()
);

alter table public.queue_state enable row level security;
alter table public.queue_calls enable row level security;
revoke all on public.queue_state, public.queue_calls from anon, authenticated;
-- 읽기만 직접 허용. 쓰기는 아래 함수로만 (동시에 눌러도 번호가 겹치지 않게)
grant select on public.queue_state, public.queue_calls to authenticated;
create policy queue_state_select on public.queue_state for select to authenticated using (public.is_staff());
create policy queue_calls_select on public.queue_calls for select to authenticated using (public.is_staff());

-- 다음 번호 부르기. 행 잠금으로 순서대로 처리되어 두 직원이 같은 번호를 받지 않는다. 반환: 부른 번호
create or replace function public.queue_call_next() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_staff() then raise exception 'not staff' using errcode = '42501'; end if;
  update public.queue_state set last_called = last_called + 1, updated_at = now()
   where id = 1 and last_called < max_number
  returning last_called into n;
  if n is null then raise exception 'no more numbers' using errcode = 'P0001', hint = 'QUEUE_END'; end if;
  insert into public.queue_calls (number, called_by, called_at)
    values (n, (select name from public.staff where auth_user_id = auth.uid()), now())
    on conflict (number) do update set called_by = excluded.called_by, called_at = excluded.called_at;
  return n;
end $$;

-- 안 오신 번호를 한 번 더 부르기 (큰 화면에 다시 뜬다)
create or replace function public.queue_recall(p_number int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'not staff' using errcode = '42501'; end if;
  update public.queue_calls set called_at = now(),
         called_by = coalesce((select name from public.staff where auth_user_id = auth.uid()), called_by)
   where number = p_number;
  if not found then raise exception 'not called yet' using errcode = 'P0001', hint = 'QUEUE_NOT_CALLED'; end if;
  update public.queue_state set updated_at = now() where id = 1;
end $$;

-- 관리자: 마지막 번호·끝 번호 바꾸기 (0 으로 두면 처음부터). 그보다 큰 번호의 호출 기록은 지운다
create or replace function public.queue_set(p_last int, p_max int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_last < 0 or p_max < 1 or p_max > 999 or p_last > p_max then
    raise exception 'bad range' using errcode = 'P0001', hint = 'QUEUE_RANGE';
  end if;
  update public.queue_state set last_called = p_last, max_number = p_max, updated_at = now() where id = 1;
  delete from public.queue_calls where number > p_last;
end $$;

revoke all on function public.queue_call_next(), public.queue_recall(int), public.queue_set(int, int) from public, anon;
grant execute on function public.queue_call_next(), public.queue_recall(int), public.queue_set(int, int) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.queue_state, public.queue_calls;
  end if;
end $$;
