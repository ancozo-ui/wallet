-- ============================================================
--  0018: QA 중 만들어진 기존 투자 거래 3건에 연결 정보 소급 적용(1회성)
--
--  0016 이전에 생긴 거래라 invest_tx_id 가 비어 있어 삭제 버튼이
--  안 붙었다. 시각(created_at)이 정확히 같은 쌍을 직접 찾아 연결한다.
-- ============================================================

update transactions set invest_tx_id = '32dd7c3c-e8f3-479f-aa6c-5ffa5703b6f7'
  where id = '880ee050-5735-4669-ac3f-005612b83c94';
update transactions set invest_tx_id = '98e06650-2f04-4320-884d-976857ff96fb'
  where id = '04a9de9d-1947-4e0f-a801-ff90dc23f35e';
update transactions set invest_tx_id = '4302b66d-fa82-47cc-9c02-9cd75888e0ba'
  where id = '173bd229-13a0-48b8-9800-a8ed22d5f4ca';
