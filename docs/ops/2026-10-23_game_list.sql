-- 2026-10-23 게임 목록 수정 (운영 DB 1회 실행)
-- '이상한 신호' → '바이러스 퇴치', '타일 뒤집기' 삭제. '즐겨 하시는 게임'·'기억나는 게임' 보기 모두에 적용된다.
-- 설문이 잠겨 있으면(행사 잠금) 바뀌지 않는다.
update public.survey_schema
   set payload = replace(replace(payload::text, ', "타일 뒤집기"', ''), '"이상한 신호"', '"바이러스 퇴치"')::jsonb,
       updated_by = '김소리'
 where id = 1 and not locked
returning version,
  (payload::text like '%바이러스 퇴치%') as 바이러스퇴치_있음,
  (payload::text like '%타일 뒤집기%' or payload::text like '%이상한 신호%') as 옛이름_남음;
