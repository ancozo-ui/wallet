-- ============================================================
--  0004: 요청 중복 생성 방지
--  화면에서 요청 하나를 만들 때 고유 표식(client_token)을 붙인다.
--  네트워크가 끊겨 사용자가 다시 눌러도 같은 표식이라 두 번 저장되지 않는다.
--  (기존 행은 null - 부분 유니크 인덱스라 null 은 서로 충돌하지 않음)
-- ============================================================

alter table requests add column if not exists client_token uuid;

create unique index if not exists requests_client_token_key
  on requests (client_token) where client_token is not null;
