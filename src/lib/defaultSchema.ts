import type { SurveyPayload, Question } from './types'

export const DEFAULT_GAMES = [
  '기억의 숨바꼭질', '오늘의 장바구니', '숨은 헬씨 찾기', '꿀벌의 숫자놀이', '초성 퀴즈',
  '재밌는 숫자 퍼즐 4X4', '구슬 옮기기', '기찻길 만들기', '숨은 헬씨찾기 비밀작전', '양말정리 대작전',
  '진짜 색깔 찾기', '단어 기억하기', '알쏭달쏭 숫자 더하기', '재밌는 숫자 퍼즐 9X9', '색깔 맞추기',
  '이상한 신호', '타일 뒤집기',
]

/** 응답 테이블 컬럼과 연결되는 예약 key. 어드민에서 key 변경·삭제 불가 */
export const RESERVED_KEYS = ['consent', 'helpers', 'real_name', 'result', 'c_checklist'] as const
export const FIRST_GAME_KEY = 'c_checklist'
export const FIRST_GAME_OPTION = '첫 게임 실행'

/** 응대 결과 → status. 목록에 없으면 done */
export const RESULT_STATUS: Record<string, 'done' | 'refused' | 'revisit'> = {
  '설문 완료': 'done',
  '일부 응답': 'done',
  '응대 거부': 'refused',
  '재방문 예정': 'revisit',
}

const divider = (key: string): Question => ({ key, type: 'divider', label: '' })

export const DEFAULT_PAYLOAD: SurveyPayload = {
  guides: {
    A: '최근 30일 안에 활동하신 분입니다. 사용 경험과 만족도를 여쭤 주세요.',
    B: '예전에 꾸준히 하셨지만 한 달 넘게 쉬고 계신 분입니다. 게임 카드를 보여 드리며 기억나는 게임을 짚게 해 주세요.',
    C: '거의 사용하지 못하신 분입니다. 현장에서 설치·로그인·첫 게임까지 함께 해 주세요.',
  },
  sections: {
    intake: [
      {
        key: 'consent', type: 'single', label: '개인정보 수집·이용에 동의하셨나요?', required: true,
        help: '리워드 배송과 설문 분석 목적. 동의서를 읽어 드린 뒤 선택하세요.',
        options: ['동의', '미동의'],
      },
      { key: 'helpers', type: 'staff', label: '함께 도와준 담당자', help: '여러 명 선택 가능' },
    ],
    A: [
      {
        key: 'a_freq', type: 'single', label: '요즘 맬리브레인을 얼마나 자주 하세요?', required: true,
        options: ['거의 매일', '주 3~4회', '주 1~2회', '가끔'],
      },
      { key: 'a_fav', type: 'text', label: '가장 좋아하시는 게임은 무엇인가요?' },
      {
        key: 'a_difficulty', type: 'multi', label: '쓰시면서 불편한 점이 있으세요?', required: true,
        options: ['없음', '글씨가 작음', '소리가 작음', '게임이 어려움', '알림이 불편함', '기타'],
      },
      {
        key: 'a_difficulty_etc', type: 'text', label: '기타 불편한 점',
        showIf: { key: 'a_difficulty', in: ['기타'] },
      },
      divider('a_div1'),
      {
        key: 'a_effect', type: 'single', label: '하시고 나서 달라진 점이 있으세요?', required: true,
        options: ['기억력이 좋아진 느낌', '생활에 활력', '잘 모르겠음', '없음'],
      },
      {
        key: 'a_recommend', type: 'single', label: '주변 분께 추천하실 의향이 있으세요?', required: true,
        options: ['있음', '보통', '없음'],
      },
      { key: 'a_comment', type: 'textarea', label: '하고 싶은 말씀' },
    ],
    B: [
      {
        key: 'b_stop_reason', type: 'multi', label: '요즘 안 하시게 된 이유가 있으세요?', required: true,
        options: ['바빠서', '잊어버려서', '재미가 없어서', '어려워서', '기기 문제', '건강 문제', '기타'],
      },
      {
        key: 'b_stop_etc', type: 'text', label: '기타 이유',
        showIf: { key: 'b_stop_reason', in: ['기타'] },
      },
      divider('b_div1'),
      {
        key: 'b_games', type: 'multi', label: '기억나는 게임을 짚어 주세요', gameList: true,
        help: '게임 카드를 보여 드리고 짚으신 게임을 모두 체크하세요.',
        options: DEFAULT_GAMES,
      },
      {
        key: 'b_games_again', type: 'single', label: '다시 해보고 싶은 게임이 있으세요?',
        options: ['있음', '없음', '모르겠음'],
      },
      divider('b_div2'),
      {
        key: 'b_restart', type: 'single', label: '다시 시작해 보시겠어요?', required: true,
        options: ['오늘 바로', '4기부터', '생각해 볼게요', '안 함'],
      },
      {
        key: 'b_help', type: 'multi', label: '다시 하시려면 어떤 도움이 필요하세요?',
        options: ['알림 설정', '가족 도움', '글씨 크게', '전화 안내', '필요 없음'],
      },
    ],
    C: [
      {
        key: 'c_reason', type: 'single', label: '앱을 거의 못 쓰신 이유가 있으세요?', required: true,
        options: ['설치를 못 함', '로그인이 안 됨', '사용법을 모름', '관심이 없음', '기기 없음·고장', '기타'],
      },
      {
        key: 'c_device', type: 'single', label: '쓰시는 휴대폰은 어떤 종류인가요?', required: true,
        options: ['안드로이드', '아이폰', '폴더폰·없음', '모름'],
      },
      divider('c_div1'),
      {
        key: 'c_checklist', type: 'multi', label: '현장 조치 체크리스트',
        help: '함께 완료한 항목을 모두 체크하세요.',
        options: ['설치', '로그인', FIRST_GAME_OPTION],
      },
      {
        key: 'c_blocked', type: 'single', label: '막힌 지점', required: true,
        options: ['없음(모두 완료)', '앱스토어 계정', '비밀번호', '본인인증', '기기 용량', 'OS 버전', '기타'],
      },
      { key: 'c_blocked_memo', type: 'text', label: '막힌 지점 상세' },
      divider('c_div2'),
      {
        key: 'c_next', type: 'single', label: '앞으로 써 보실 생각이 있으세요?', required: true,
        options: ['4기부터 해볼게요', '가족과 함께 해볼게요', '어려울 것 같아요'],
      },
    ],
    closing: [
      {
        key: 'reward', type: 'single', label: '리워드 처리', required: true,
        help: '지급 조건: 행사 운영 기준에 따릅니다. (어드민에서 문구 수정)',
        options: ['현장 지급', '추후 배송', '대상 아님'],
      },
      {
        key: 'real_name', type: 'text', label: '실명 (선택 · 리워드 배송 확인용)',
        showIf: { key: 'reward', in: ['현장 지급', '추후 배송'] },
      },
      {
        key: 'preorder_4', type: 'single', label: '4기 사전신청', required: true,
        options: ['신청', '미신청', '보류'],
      },
      {
        key: 'result', type: 'single', label: '응대 결과', required: true,
        options: Object.keys(RESULT_STATUS),
      },
      { key: 'memo', type: 'textarea', label: '메모' },
    ],
  },
}
