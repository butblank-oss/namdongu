# 맬리브레인 보건소 팝업 현장 설문 도구

2026-10-30(금) 인천 남동구 치매안심센터 팝업 행사에서 **원메딕스 임직원**이 노트북으로 어르신을 응대하며 설문을 입력하는 웹 앱입니다. 어르신이 직접 쓰는 앱이 아닙니다.

- Vite + React + TypeScript + Tailwind, Supabase(Postgres/Realtime), Dexie(IndexedDB)
- 배포: GitHub Actions → GitHub Pages (`https://butblank-oss.github.io/namdongu/`, HashRouter)

## 개인정보 원칙

- 참여자 명단은 **Supabase DB에만** 있습니다. 저장소·빌드 산출물에 명단 파일을 넣지 않습니다 (`*.csv`, `roster*.json`은 `.gitignore` 처리, `tests/dist` 테스트가 빌드 산출물을 검사).
- **로그인 없음 (2026-09-29 운영 결정).** 페이지를 열면 담당자가 자기 이름을 눌러 바로 씁니다.
  - ⚠ 그래서 페이지 주소를 아는 사람은 누구나 명단(마스킹 이름·전화 뒷 4자리·생년)을 조회하고 응답을 쓸 수 있습니다. 주소를 외부에 공유하지 마세요. 검색엔진 노출은 `noindex`로 막아 두었습니다.
  - 그래도 남아 있는 보호: 명단 수정·삭제 불가, 응답 완전 삭제 불가(삭제 표시만), 열람 기록은 쓰기만 가능(조회·수정·삭제는 Supabase 대시보드에서만), 행사 잠금, 응답 있는 문항 key 보호.
  - admin 여부는 고른 이름의 `staff.role`로 화면에서만 판단합니다.
- 명단에는 마스킹 이름, 전화 뒷 4자리, 생년만 둡니다. 실명은 직원이 응답에 입력한 경우에만 `responses.real_name`에 들어갑니다(선택 입력).
- 명단 열람(view), 본인 확인(verify), 내보내기(export), 삭제(delete)는 `access_log`에 자동으로 기록됩니다. `reason` 컬럼은 비워 두었습니다(보건소 협의 후 필수화 가능).

## 처음 설정

### 1. Supabase

1. 프로젝트 생성 후 SQL Editor에서 `supabase/migrations/20260929000000_init.sql` 실행 (또는 `supabase db push`).
   이어서 `supabase/migrations/20260929010000_public_access.sql`도 실행합니다(로그인 없이 쓰기).
2. 설문지 편집 권한을 줄 담당자를 admin으로 지정합니다.
   ```sql
   update staff set role = 'admin' where name = '강하연';
   ```
3. Database → Replication에서 `responses`, `survey_schema`, `staff`가 `supabase_realtime`에 포함됐는지 확인합니다(마이그레이션이 자동 추가).

### 2. GitHub

- Settings → Pages → Source: **GitHub Actions**
- Settings → Secrets and variables → Actions → **Variables**에 추가
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- `main`에 머지하면 테스트 → 빌드 → 배포가 돌아갑니다.

### 3. 명단 임포트

service role 키로 로컬에서만 실행합니다. 키와 CSV는 절대 커밋하지 않습니다.

```bash
cp .env.example .env    # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 입력
npm run import:participants -- ~/Downloads/S3_user_info.csv --snapshot 2026-09-14 --dry-run   # 건수만 확인
npm run import:participants -- ~/Downloads/S3_user_info.csv --snapshot 2026-09-14
```

- **명단은 3기(두뇌운동 치매예방교실-26년, 2026-03-02 ~ 10-31)만** 넣습니다. 2기·1기만 참여한 분은 빠지고, 현장에 오시면 "명단에 없는 분 추가 → 이전 기수"로 처리합니다.
- **실명**: 추출본에 `full_name`·`name`·`이름`·`성명`·`실명` 중 하나의 열이 있으면 실명도 넣고, 본인 확인 화면에 실명이 보입니다(목록은 마스킹). 먼저 `supabase/migrations/20260929020000_full_name.sql`을 실행하세요. 실명 열이 없는 추출본으로 다시 임포트해도 기존 실명은 지워지지 않습니다.
  - 신청폼 신청자 명단(xlsx)으로 실명 채우기: `npx tsx scripts/import-full-names.mts <applicants.xlsx> <S3_user_info.csv> <S4_presignup_list.csv> [--dry-run]` (S4의 registration_id → user_id 로 연결, 마스킹 이름과 모양이 맞을 때만). 보건소 일괄 등록(org_linked)으로 신청폼을 거치지 않은 분은 이 파일에 없어 마스킹 이름으로 남습니다.
- **4기 신청자 연락처**: 먼저 `supabase/migrations/20260930000000_contacts.sql`을 실행하고, `npx tsx scripts/import-contacts.mts <applicants.xlsx> <S3_user_info.csv> <S4_presignup_list.csv> [--dry-run]`로 신청폼의 전체 휴대폰 번호를 `participant_contacts`에 넣습니다(번호 끝 4자리가 명단과 같을 때만). 이 표와 `preorder4_applicants`(4기 사전신청자 + 번호)는 앱에서 읽을 수 없고 Supabase 대시보드에서만 봅니다. 4기 프로그램 등록·문자 안내에 쓸 명단은 Table Editor → `preorder4_applicants` → Export to CSV로 받습니다. 앱 상단 **4기 신청자** 화면은 번호 없이 신청 현황만 보여 줍니다.
- 2026-09-14 추출본 기대값: **3기 891명 / A 301 · B 158 · C 432** (기수 제한 전 1,523명 = 3기 891 + 2기 582 + 1기 50). 2% 넘게 다르면 경고가 뜹니다.
- 제외: 이름 없음, 테스트 계정(PRD·TEST·테스트·개발·샘플), 탈퇴(`withdrawn`), 3기 아님. 현장에 오시면 "명단에 없는 분 추가"로 처리합니다.
- 재임포트(10/25경 재추출)는 `user_id` 기준 upsert입니다. `participants.track`만 갱신하고 **응답(responses)은 건드리지 않으므로** 이미 완료된 응답의 트랙은 그대로입니다. 새 추출본에서 빠진 사람은 `active=false`가 됩니다(응답이 있으면 검색에 계속 보임).

## 행사 당일 체크리스트

1. 아침에 어드민 → 설문지 편집 → **행사 잠금**. 잠그면 admin도 설문 구조를 바꿀 수 없습니다(해제는 두 번 확인).
2. 노트북마다 페이지 열기 → 본인 이름 선택 → 상단이 `동기화됨 · 대기 0건`인지 확인. 명단이 이 노트북에 캐시되어야 오프라인 검색이 됩니다.
3. 와이파이가 끊겨도 계속 입력하세요. 상단에 `오프라인 · 대기 N건`이 보이고, 연결되면 자동으로 올라갑니다.
4. 5분마다 이 노트북 IndexedDB에 전체 스냅샷이 백업됩니다. 수시로 상단 **응답 내보내기**로 CSV를 받아 둘 수 있습니다.
5. 무료 요금제는 일주일간 접속이 없으면 멈춥니다. 행사 2~3일 전과 당일 아침에 Supabase 대시보드에 한 번 들어가 두세요.

## 사용 흐름

찾기(전화 뒷 4자리 또는 이름) → 본인 확인(“전화번호 뒷 네 자리가 어떻게 되세요?”) → 단계형 설문(접수 → 트랙별 → 마무리) → **응대 완료** → 다음 분 찾기

- 검색: 숫자면 전화 뒷 4자리, 글자면 마스킹 이름(간경자 → 간\*자). Enter로 첫 결과 선택, Esc로 지우기.
- 설문: Ctrl+Enter 다음/완료, Alt+← 이전. 필수 문항이 비면 다음으로 넘어가지 않고 붉게 표시됩니다.
- 응대 결과가 `응대 거부`면 status=`refused`, `재방문 예정`이면 `revisit`, 그 외는 `done`.
- 다른 직원이 같은 어르신을 열었거나 진행 중이면 경고 후 이어받기/취소를 고릅니다.

## 개발

```bash
npm install
npm run dev        # .env.local 이 없으면 가짜 데이터 데모 모드(개발 서버에서만)
npm test           # 수용 기준 테스트 (DB/RLS는 PGlite로 실제 마이그레이션 실행)
npm run typecheck
npm run build
```

| 경로 | 내용 |
|---|---|
| `supabase/migrations/` | 스키마, RLS, 잠금·key 보호·stale write 트리거 |
| `scripts/import-participants.ts` | 명단 임포트 (service role) |
| `src/lib/engine.ts` | 로컬 우선 저장 + 동기화 + Realtime + 백업 |
| `src/lib/search.ts` | 마스킹 이름 매칭 규칙 |
| `src/lib/defaultSchema.ts` | 기본 설문(어드민에서 편집), 게임 17종 |
| `src/screens/` | 찾기, 본인 확인, 설문, 완료, 명단 외 추가, 어드민, 게임 카드 |
| `src/test/acceptance/`, `tests/` | 수용 기준 1~25 테스트 |

## 정해진 운영 정책

- 기수: 3기만 명단에 포함 (지시서의 기수 미상 50명은 모두 1기로 확인되어 제외)
- 열람 사유: 자동 기록만, `reason`은 비워 둠
- 리워드 지급 조건: 앱은 지급 여부만 기록, 조건 문구는 어드민에서 `reward` 문항 도움말로 편집
- 실명: 선택 입력 (리워드 지급·배송을 고른 경우에만 입력칸 표시)
