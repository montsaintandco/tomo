-- 0049: 낙찰 결제창 만료 알림 바로잡기 (docs/aaa/14-auction.md U6 남은 것, docs/aaa/15 선행 수정)
-- 문제: 낙찰자가 연 결제 거래(45분 예약)가 만료로 cancelled 되면 notify_transaction 이 양쪽에 「거래가 취소됐어요」(tx_cancelled)를 보낸다.
--       경매는 아직 결제 대기(awaiting_payment, 48시간 기한)라 판매자·낙찰자가 낙찰 취소로 오해한다.
-- 바꾼 것: 그 경우에만 낙찰자에게 auction_pay_expired(「결제창이 만료됐어요. 기한 안에 다시 결제해 주세요」) 한 건. 판매자에게는 보내지 않는다.
-- 방법: notify_transaction(0042 최신 정의)을 통째로 다시 쓰지 않는다. 지금 정의를 읽어 cancelled 줄 두 개만 조건문으로 감싼다.
--       바꿀 글이 정확히 한 번 있지 않으면(누가 먼저 바꿨으면) 예외로 멈춘다.
-- 판정: 거래가 pending_payment → cancelled, 같은 상품에 이 구매자가 낙찰자인 awaiting_payment 경매가 있다(0047 auction_on_tx_paid 와 같은 기준).

do $mig$
declare
  v_def text := pg_get_functiondef('public.notify_transaction'::regproc);
  v_old text := $o$    when 'cancelled' then
      perform notify(new.buyer_id, 'tx_cancelled', 'tx', new.id::text, v_d);
      perform notify(new.seller_id, 'tx_cancelled', 'tx', new.id::text, v_d);$o$;
  v_new text := $n$    when 'cancelled' then
      if old.status = 'pending_payment' and exists (select 1 from auctions a where a.listing_id = new.listing_id
           and a.status = 'awaiting_payment' and a.winner_id = new.buyer_id) then
        perform notify(new.buyer_id, 'auction_pay_expired', 'tx', new.id::text, v_d); -- 0049: 낙찰 결제창 만료, 경매는 결제 대기
      else
        perform notify(new.buyer_id, 'tx_cancelled', 'tx', new.id::text, v_d);
        perform notify(new.seller_id, 'tx_cancelled', 'tx', new.id::text, v_d);
      end if;$n$;
  v_n int;
begin
  -- 윈도 체크아웃(CRLF)으로 보낸 파일과 CI(LF) 둘 다 맞게 CR 을 뺀다(공백만 바뀐다)
  v_def := replace(v_def, chr(13), ''); v_old := replace(v_old, chr(13), ''); v_new := replace(v_new, chr(13), '');
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception '0049: notify_transaction 의 cancelled 줄이 예상과 다름(%건)', v_n; end if;
  execute replace(v_def, v_old, v_new);
end $mig$;

-- 되돌리기(이 순서로):
-- do $r$ declare v_def text := pg_get_functiondef('public.notify_transaction'::regproc);
--   v_s int := position('      if old.status = ''pending_payment'' and exists' in v_def);
--   v_e int := position('      end if;' in substr(v_def, v_s)) + v_s - 1 + length('      end if;');
-- begin
--   if v_s = 0 then raise exception '0049 조건문 없음'; end if;
--   execute substr(v_def, 1, v_s - 1)
--     || '      perform notify(new.buyer_id, ''tx_cancelled'', ''tx'', new.id::text, v_d);' || chr(10)
--     || '      perform notify(new.seller_id, ''tx_cancelled'', ''tx'', new.id::text, v_d);'
--     || substr(v_def, v_e);
-- end $r$;
