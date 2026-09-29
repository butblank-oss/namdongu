-- 명단 실명 (2026-09-29 운영 결정: 본인 확인 화면에 실명 표시)
-- ⚠ 로그인 없이 쓰는 설정이라 주소를 아는 사람은 실명도 조회할 수 있다.
alter table public.participants add column if not exists full_name text;
