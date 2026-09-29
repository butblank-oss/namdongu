# 맬리브레인 보건소 팝업 현장 설문 도구

2026-10-30(금) 인천 남동구 치매안심센터 팝업 행사에서 **원메딕스 임직원**이 노트북으로 어르신을 응대하며 설문을 입력하는 웹 앱입니다. 어르신이 직접 쓰는 앱이 아닙니다.

- Vite + React + TypeScript + Tailwind, Supabase(Postgres/Auth/Realtime), Dexie(IndexedDB)
- 배포: GitHub Actions → GitHub Pages (`https://butblank-oss.github.io/namdongu/`, HashRouter)

## 개인정보 원칙

- 참여자 명단은 **Supabase DB에만** 있습니다. 저장소·빌드 산출물에 명단 파일을 넣지 않습니다 (`*.csv`, `roster*.json`은 `.gitignore` 처리, `tests/dist` 테스트가 빌드 산출물을 검사).
- 모든 테이블에 RLS가 걸려 있어 로그인하지 않으면 아무것도 조회되지 않습니다. anon key는 번들에 들어가지만 RLS가 막습니다.
- 명단에는 마스킹 이름, 전화 뒷 4자리, 생년만 둡니다. 실명은 직원이 응답에 입력한 경우에만 `responses.real_name`에 들어갑니다(선택 입력).
- 명단 열람(view), 본인 확인(verify), 내보내기(export), 삭제(delete)는 `access_log`에 자동으로 기록됩니다. `reason` 컬럼은 비워 두었습니다(보건소 협의 후 필수화 가능).

## 처음 설정

### 1. Supabase

1. 프로젝트 생성 후 SQL Editor에서 `supabase/migrations/20260929000000_init.sql` 실행 (또는 `supabase db push`).
2. Authentication → Providers에서 Email 사용. **Sign-ups 비활성화**를 권장합니다(직원 계정만 초대).
3. 직원 계정을 초대(Authentication → Users → Invite)한 뒤, 관리자 계정을 staff 행에 연결합니다.
   ```sql
   update staff set auth_user_id = '<auth.users.id>', role = 'admin' where name = '강하연';
   ```
   operator는 연결하지 않아도 됩니다(로그인 후 본인 이름을 고르면 이 노트북에 저장됩니다).
4. Database → Replication에서 `responses`, `survey_schema`, `staff`가 `supabase_realtime`에 포함됐는지 확인합니다(마이그레이션이 자동 추가).

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

- 2026-09-14 추출본 기대값: **총 1,523명 / A 351 · B 454 · C 718 / 26년 891 · 2기 582 · 미상 50**. 2% 넘게 다르면 경고가 뜹니다.
- 제외: 이름 없음, 테스트 계정(PRD·TEST·테스트·개발·샘플), 탈퇴(`withdrawn`). 현장에 오시면 "명단에 없는 분 추가"로 처리합니다.
- 재임포트(10/25경 재추출)는 `user_id` 기준 upsert입니다. `participants.track`만 갱신하고 **응답(responses)은 건드리지 않으므로** 이미 완료된 응답의 트랙은 그대로입니다. 새 추출본에서 빠진 사람은 `active=false`가 됩니다(응답이 있으면 검색에 계속 보임).

## 행사 당일 체크리스트

1. 아침에 어드민 → 설문지 편집 → **행사 잠금**. 잠그면 admin도 설문 구조를 바꿀 수 없습니다(해제는 두 번 확인).
2. 노트북마다 로그인 → 본인 이름 선택 → 상단이 `동기화됨 · 대기 0건`인지 확인. 명단이 이 노트북에 캐시되어야 오프라인 검색이 됩니다.
3. 와이파이가 끊겨도 계속 입력하세요. 상단에 `오프라인 · 대기 N건`이 보이고, 연결되면 자동으로 올라갑니다.
4. 5분마다 이 노트북 IndexedDB에 전체 스냅샷이 백업됩니다. 수시로 상단 **응답 내보내기**로 CSV를 받아 둘 수 있습니다.
5. 로그아웃하면 이 노트북의 명단 캐시를 지웁니다. 올라가지 않은 응답이 있으면 경고합니다.

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

- 기수 미상 50명: 명단에 포함, 화면·필터·CSV에 "미상"으로 표시
- 열람 사유: 자동 기록만, `reason`은 비워 둠
- 리워드 지급 조건: 앱은 지급 여부만 기록, 조건 문구는 어드민에서 `reward` 문항 도움말로 편집
- 실명: 선택 입력 (리워드 지급·배송을 고른 경우에만 입력칸 표시)
