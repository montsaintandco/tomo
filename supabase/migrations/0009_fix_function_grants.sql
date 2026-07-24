-- 0008 보안 수정: Postgres는 함수 EXECUTE를 기본적으로 PUBLIC에 부여한다.
-- authenticated/anon만 revoke하면 PUBLIC 경유로 실행이 새어나간다.
-- mark_paid(임의 PI로 결제없이 paid 위조)·release_stale_reservations는 PUBLIC에서 회수.
revoke execute on function mark_paid(text) from public;
revoke execute on function release_stale_reservations() from public;

-- 사용자 호출 함수는 authenticated에만 두고 PUBLIC(=anon 포함) 실행은 차단
revoke execute on function start_transaction(uuid, int) from public;
revoke execute on function attach_payment_intent(uuid, text) from public;
revoke execute on function advance_transaction(uuid, tx_status, text) from public;
revoke execute on function submit_review(uuid, int, text) from public;
grant execute on function start_transaction(uuid, int) to authenticated;
grant execute on function attach_payment_intent(uuid, text) to authenticated;
grant execute on function advance_transaction(uuid, tx_status, text) to authenticated;
grant execute on function submit_review(uuid, int, text) to authenticated;
