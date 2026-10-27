import type { Question, SurveyPayload } from './types'

export const DEFAULT_GAMES = [
  '기억의 숨바꼭질', '오늘의 장바구니', '숨은 헬씨 찾기', '꿀벌의 숫자놀이', '초성 퀴즈',
  '재밌는 숫자 퍼즐 4X4', '구슬 옮기기', '기찻길 만들기', '숨은 헬씨찾기 비밀작전', '양말정리 대작전',
  '진짜 색깔 찾기', '단어 기억하기', '알쏭달쏭 숫자 더하기', '재밌는 숫자 퍼즐 9X9', '색깔 맞추기',
  '바이러스 퇴치',
]

/** 응답 테이블 컬럼과 연결되는 예약 key. 어드민에서 key 변경·삭제 불가 */
export const RESERVED_KEYS = ['consent', 'real_name', 'result', 'c_checklist', 'preorder_4', 'p4_privacy', 'p4_sms', 'app_update'] as const
export const FIRST_GAME_KEY = 'c_checklist'
export const FIRST_GAME_OPTION = '첫 게임 실행'

/** 응대 결과 → status. 목록에 없으면 done */
export const RESULT_STATUS: Record<string, 'done' | 'refused' | 'revisit'> = {
  '설문 완료': 'done',
  '일부 응답': 'done',
  '응대 거부': 'refused',
  '재방문 예정': 'revisit',
}

/** 리워드: 현장 수량이 모자라면 보건소에 방문하셔서 받으신다 (2026-10-27, 예전 '추후 배송') */
export const REWARD_ONSITE = '현장 지급'
/** 재고가 모자라 일부만 드린 경우 (2026-10-27). 무엇을 드렸고 무엇을 못 드렸는지 reward_partial 에 적는다 */
export const REWARD_PARTIAL = '일부 지급 (재고 부족)'
export const REWARD_VISIT = '수량 부족 · 보건소 방문 지급'
export const REWARD_NONE = '대상 아님'

/** 보기 목록 끝에 붙이는 '기타'. 고르면 옆에 직접 입력칸이 열리고 answers[`${key}__etc`] 에 저장된다 */
export const ETC = '기타'

/**
 * 4기 사전신청 동의 (2026-10-02 운영 결정: 4기 명단은 원메딕스가 직접 사용 → 제3자 제공 아님).
 * '신청'을 고른 분에게만 보인다. 4기 등록 명단은 p4_privacy = '동의'인 분만, 문자는 p4_sms = '동의'인 분에게만.
 */
export const P4_CONSENT_QUESTIONS: Question[] = [
  {
    key: 'p4_privacy', type: 'single', label: '[필수] 4기 참여를 위한 개인정보 수집·이용에 동의하십니까?', required: true,
    options: ['동의', '미동의'],
    showIf: { key: 'preorder_4', in: ['신청'] },
    notice: [
      '원메딕스는 맬리브레인 4기 참여 등록과 안내를 위해 아래와 같이 개인정보를 수집·이용합니다.',
      '· 목적: 맬리브레인 4기 참여 등록 및 프로그램 안내',
      '· 항목: 성함, 휴대폰 번호, 맬리브레인 회원 정보',
      '· 보유 기간: 4기 프로그램 종료 시까지 (동의를 철회하시면 바로 파기)',
      '· 동의하지 않으실 수 있으며, 동의하지 않으시면 4기 사전신청이 어렵습니다.',
    ].join('\n'),
  },
  {
    key: 'p4_sms', type: 'single', label: '[선택] 4기 소식을 문자로 받는 데 동의하십니까?', required: true,
    options: ['동의', '미동의'],
    showIf: { key: 'preorder_4', in: ['신청'] },
    notice: [
      '· 목적: 4기 모집·일정·행사 안내 문자 발송',
      '· 항목: 휴대폰 번호',
      '· 보유 기간: 4기 프로그램 종료 시 또는 수신 거부 시까지',
      '· 동의하지 않으셔도 4기 신청에는 영향이 없습니다.',
    ].join('\n'),
  },
]
export const etcKey = (key: string) => `${key}__etc`

/** 휴대폰 번호 입력: 숫자만 남기고 010-1234-5678 (10자리면 011-123-4567) 로 맞춘다 */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  const mid = d.length === 10 ? 6 : 7
  return `${d.slice(0, 3)}-${d.slice(3, mid)}-${d.slice(mid)}`
}
export const phoneComplete = (v: string) => /^01\d-\d{3,4}-\d{4}$/.test(v)

/**
 * 가족 연락처 (2026-10-27). '앞으로 안내받고 싶은 방법'에서 '가족을 통해'를 고른 분만, 가족 본인이 동의했을 때만 받는다.
 * 가족 번호는 그 자리에 없는 다른 사람의 개인정보라 어르신이 대신 동의할 수 없다.
 */
export const FAMILY_CONTACT_QUESTIONS: Question[] = [
  {
    key: 'family_consent', type: 'single', label: '[선택] 가족 연락처 수집·이용에 동의하십니까? (가족분 본인 동의)',
    help: '가족분이 현장에 계시거나 전화로 직접 동의하신 경우에만 받아 주세요. 어르신이 대신 동의하실 수 없습니다.',
    options: ['동의', '미동의'],
    showIf: { key: 'contact_pref', in: ['가족을 통해'] },
    notice: [
      '원메딕스는 맬리브레인 안내를 가족분께 전하기 위해 아래와 같이 개인정보를 수집·이용합니다.',
      '· 목적: 맬리브레인 4기 모집·일정·이용 안내를 가족분께 전달',
      '· 항목: 가족분 성함, 어르신과의 관계, 휴대폰 번호',
      '· 보유 기간: 4기 프로그램 종료 시까지 (동의를 철회하시면 바로 파기)',
      '· 동의하지 않으실 수 있으며, 동의하지 않으셔도 어르신의 참여에는 영향이 없습니다.',
    ].join('\n'),
  },
  {
    key: 'family_name', type: 'text', label: '가족 성함',
    showIf: { key: 'family_consent', in: ['동의'] },
  },
  {
    key: 'family_relation', type: 'single', label: '어르신과의 관계',
    options: ['배우자', '아들', '딸', '며느리', '사위', '손자녀', '형제자매', ETC],
    showIf: { key: 'family_consent', in: ['동의'] },
  },
  {
    key: 'family_phone', type: 'text', label: '가족 휴대폰 번호', format: 'phone',
    help: '숫자만 누르면 010-1234-5678 형식으로 저장돼요',
    showIf: { key: 'family_consent', in: ['동의'] },
  },
]

/**
 * 앱 업데이트 안내 (2026-10-27). 전 회원 대상, 설문 마무리에서 현장 직원이 업데이트를 돕는다.
 * 명단의 앱 버전(participants.app_version)이 최신보다 낮으면 설문 화면에 크게 표시한다. 인쇄 용지에는 넣지 않는다.
 */
export const LATEST_APP_VERSION = '4.1.1'
export const APP_UPDATE_KEY = 'app_update'
export const APP_UPDATE_DONE = '현장에서 업데이트 완료'
export const APP_UPDATE_QUESTIONS: Question[] = [
  {
    key: APP_UPDATE_KEY, type: 'single', label: `앱 업데이트 (최신 ${LATEST_APP_VERSION})`, required: true,
    help: '휴대폰에서 Play 스토어(아이폰은 App Store) → 맬리브레인 → 업데이트',
    options: ['이미 최신', APP_UPDATE_DONE, '업데이트 못함'],
  },
  {
    key: 'app_update_fail', type: 'single', label: '업데이트 못한 이유', required: true,
    options: ['저장 공간 부족', '스토어 로그인 모름', '시간이 부족함', '원하지 않으심', ETC],
    showIf: { key: APP_UPDATE_KEY, in: ['업데이트 못함'] },
  },
]
/** 앱 화면에만 있고 인쇄 용지에는 없는 문항.
 *  가족 연락처는 가족 본인 동의를 직원이 확인해야 해서 앱에서만 받는다 (용지는 4쪽 유지) */
export const APP_ONLY_KEYS = [...APP_UPDATE_QUESTIONS.map((q) => q.key), ...FAMILY_CONTACT_QUESTIONS.map((q) => q.key)]

/** '4.0.9' < '4.1.1' 같은 버전 비교. 읽을 수 없으면 null */
export function compareVersion(a: string | null | undefined, b: string): number | null {
  const pa = (a ?? '').trim().split('.').map(Number)
  const pb = b.split('.').map(Number)
  if (!a || pa.some((x) => !Number.isInteger(x))) return null
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return Math.sign(d)
  }
  return 0
}

const LIKES = ['게임이 재미있음', '기억력·집중력에 도움', '매일 할 거리가 생김', '운동 영상', '마음 챙김(명상)', '랭킹·트로피', '보건소와 연결된 느낌', ETC]

export const DEFAULT_PAYLOAD: SurveyPayload = {
  guides: {
    A: '최근 30일 안에 활동하신 분입니다. 좋은 점·불편한 점을 여러 개 골라 주세요. 4기로 이어지게 하는 게 목표입니다.',
    B: '예전에 꾸준히 하셨지만 한 달 넘게 쉬고 계신 분입니다. 게임 카드를 보여 드리며 기억나는 게임을 짚게 하고, 다시 시작하려면 무엇이 필요한지 여쭤 주세요.',
    C: '거의 사용하지 못하신 분입니다. 못 쓰신 이유를 여쭌 뒤, 현장에서 설치·로그인·첫 게임까지 함께 해 주세요.',
  },
  sections: {
    intake: [
      {
        key: 'consent', type: 'single', label: '개인정보 수집·이용에 동의하셨나요?', required: true,
        help: '리워드 배송과 설문 분석 목적. 동의서를 읽어 드린 뒤 선택하세요. 미동의면 설문 문항 없이 응대 결과만 남깁니다.',
        options: ['동의', '미동의'],
      },
      {
        key: 'visit_path', type: 'multi', label: '오늘 행사는 어떻게 알고 오셨어요?',
        options: ['보건소 문자·전화', '교실 선생님 안내', '앱 알림', '가족·지인 권유', '지나가다가', ETC],
      },
    ],
    A: [
      {
        key: 'a_freq', type: 'single', label: '요즘 맬리브레인을 얼마나 자주 하세요?', required: true,
        options: ['거의 매일', '주 3~4회', '주 1~2회', '가끔'],
      },
      { key: 'a_like', type: 'multi', label: '좋은 점을 모두 골라 주세요', required: true, options: LIKES },
      {
        key: 'a_fav_games', type: 'multi', label: '즐겨 하시는 게임', gameList: true,
        help: '게임 카드를 보여 드리고 짚으신 게임을 모두 체크하세요.', options: DEFAULT_GAMES,
      },
      {
        key: 'a_pain', type: 'multi', label: '불편한 점을 모두 골라 주세요', required: true,
        options: ['없음', '글씨·버튼이 작음', '소리가 작음', '게임이 어려움', '게임이 쉬워 지루함', '알림이 너무 많음', '로그인이 자꾸 풀림', '휴대폰이 느려짐', ETC],
      },
      {
        key: 'a_wish', type: 'multi', label: '4기에 더 있었으면 하는 것',
        options: ['새 게임', '더 쉬운 단계', '가족과 함께 하기', '친구와 겨루기', '오프라인 모임', '건강 정보', ETC],
      },
      {
        key: 'a_effect', type: 'multi', label: '하시고 나서 달라진 점',
        options: ['기억력이 좋아진 느낌', '집중력', '생활에 활력', '대화거리가 생김', '잘 모르겠음', ETC],
      },
      {
        key: 'a_recommend', type: 'single', label: '주변 분께 추천하실 의향이 있으세요?', required: true,
        options: ['꼭 추천', '추천', '보통', '추천 안 함'],
      },
    ],
    B: [
      {
        key: 'b_stop_reason', type: 'multi', label: '요즘 안 하시게 된 이유를 모두 골라 주세요', required: true,
        options: ['바빠서', '잊어버려서', '재미가 줄어서', '어려워서', '휴대폰 고장·교체', '로그인이 안 됨', '건강 문제', '교실이 끝나서', ETC],
      },
      {
        key: 'b_games', type: 'multi', label: '기억나는 게임을 짚어 주세요', gameList: true,
        help: '게임 카드를 보여 드리고 짚으신 게임을 모두 체크하세요.', options: DEFAULT_GAMES,
      },
      { key: 'b_like', type: 'multi', label: '하실 때 좋았던 점', options: LIKES },
      {
        key: 'b_need', type: 'multi', label: '다시 하시려면 어떤 도움이 필요하세요?', required: true,
        options: ['알림 설정', '가족 도움', '전화 안내', '오프라인 모임', '글씨 크게', '필요 없음', ETC],
      },
      {
        key: 'b_restart', type: 'single', label: '다시 시작해 보시겠어요?', required: true,
        options: ['오늘 바로', '4기부터', '생각해 볼게요', '안 함'],
      },
    ],
    C: [
      {
        key: 'c_reason', type: 'multi', label: '앱을 거의 못 쓰신 이유를 모두 골라 주세요', required: true,
        options: ['설치를 못 함', '로그인이 안 됨', '사용법을 모름', '시간이 없음', '관심이 없음', '휴대폰 없음·고장', '눈이 불편함', ETC],
      },
      {
        key: 'c_device', type: 'single', label: '쓰시는 휴대폰', required: true,
        options: ['안드로이드', '아이폰', '폴더폰·없음', '모름'],
      },
      {
        key: 'c_helper', type: 'multi', label: '평소 휴대폰을 도와주는 분',
        options: ['자녀', '배우자', '손주', '복지관·보건소', '없음', ETC],
      },
      {
        key: 'c_checklist', type: 'multi', label: '현장 조치 체크리스트',
        help: '함께 완료한 항목을 모두 체크하세요.', options: ['설치', '로그인', FIRST_GAME_OPTION],
      },
      {
        key: 'c_blocked', type: 'multi', label: '막힌 지점', required: true,
        options: ['없음(모두 완료)', '앱스토어 계정', '비밀번호', '본인인증', '기기 용량', 'OS 버전', ETC],
      },
      {
        key: 'c_next', type: 'single', label: '앞으로 써 보실 생각이 있으세요?', required: true,
        options: ['4기부터 해볼게요', '가족과 함께 해볼게요', '어려울 것 같아요'],
      },
    ],
    closing: [
      {
        key: 'preorder_4', type: 'single', label: '4기 사전신청', required: true,
        options: ['신청', '미신청', '보류'],
      },
      ...P4_CONSENT_QUESTIONS,
      {
        key: 'contact_pref', type: 'multi', label: '앞으로 안내받고 싶은 방법',
        options: ['문자', '전화', '카카오톡', '보건소 방문', '가족을 통해'],
      },
      ...FAMILY_CONTACT_QUESTIONS,
      {
        key: 'reward', type: 'single', label: '리워드 처리', required: true,
        help: '지급 조건: 행사 운영 기준에 따릅니다. (관리자가 설문지 편집에서 문구 수정)',
        options: [REWARD_ONSITE, REWARD_PARTIAL, REWARD_VISIT, REWARD_NONE],
      },
      {
        key: 'reward_partial', type: 'text', label: '드린 것 / 못 드린 것',
        help: '예) 칼마디 현장 지급 / 콘드로이친 재고 부족으로 미지급',
        showIf: { key: 'reward', in: [REWARD_PARTIAL] },
      },
      {
        key: 'reward_reason', type: 'text', label: '대상 아님 사유',
        showIf: { key: 'reward', in: [REWARD_NONE] },
      },
      {
        key: 'real_name', type: 'text', label: '실명 (선택 · 리워드 배송 확인용)',
        showIf: { key: 'reward', in: [REWARD_ONSITE, REWARD_PARTIAL, REWARD_VISIT] },
      },
      ...APP_UPDATE_QUESTIONS,
      {
        key: 'result', type: 'single', label: '응대 결과', required: true,
        options: Object.keys(RESULT_STATUS),
      },
      { key: 'memo', type: 'textarea', label: '메모' },
    ],
  },
}

/** 개인정보 미동의일 때도 남기는 문항 */
export const KEYS_WITHOUT_CONSENT = ['consent', 'result', 'memo', ...APP_UPDATE_QUESTIONS.map((q) => q.key)]
