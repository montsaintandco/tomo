-- 0057 리허설(tomo 운영 DB, 한 번에 실행 → 끝에서 예외로 전부 롤백). 앞에 0057 본문을 붙여 보낸다.
-- 성공 = "TESTRESULT PASS …", 실패 = "TESTRESULT FAIL …". 시험 상품 제목은 [r57] 로 시작.
-- 계정 id 는 2026-11-27 운영 값: alice(KR, 판매자/구매자), bob(JP), 토모센터(운영자).
DO $t$
declare
  adm uuid := '60c7f220-53e5-4876-8917-0397dc717143';
  kr uuid := 'b8804421-2ee1-4044-aa6d-a5340e3217f8';
  jp uuid := '27d41d4e-ad07-4055-8551-a690822f1227';
  c_adm text; c_kr text; c_jp text; c_svc text := '{"role":"service_role"}';
  r text := ''; bad text := ''; n int; n2 int; v jsonb; v_min int; v_rate numeric;
  l1 uuid; l2 uuid; l3 uuid; l4 uuid; l5 uuid; l6 uuid; a1 uuid;
  t1 transactions; t2 transactions; t3 transactions; t4 transactions; t5 transactions; t6 transactions; s tx_center_steps;
  open_before int; q_tx record; q_au record;
begin
  -- 번호 시퀀스는 롤백되지 않는다 → 끝에서 되돌린다(setval 은 롤백과 무관하게 남는다)
  select last_value, is_called into q_tx from tx_code_seq;
  select last_value, is_called into q_au from auction_code_seq;
  c_adm := json_build_object('role', 'authenticated', 'sub', adm)::text;
  c_kr := json_build_object('role', 'authenticated', 'sub', kr)::text;
  c_jp := json_build_object('role', 'authenticated', 'sub', jp)::text;
  select count(*) into open_before from transactions where is_cross_border and status::text not in ('cancelled', 'completed');
  if open_before = 0 then r := r || 'R0 '; else bad := bad || 'R0(' || open_before || ') '; end if;

  -- R1 구간표 = 원가 × 1.1 의 10원 올림(정수 계산으로 따로 구함)
  select count(*) into n from intl_ship_rates r1
    where intl_ship_fee_krw(r1.max_kg) <> ((r1.cost_krw * 11 + 99) / 100) * 10;
  select count(*) into n2 from intl_ship_bands();
  if n = 0 and n2 = 37 and intl_ship_fee_krw(0.1) = 6080 and intl_ship_fee_krw(0.5) = 7860 and intl_ship_fee_krw(1) = 9260
     and intl_ship_fee_krw(17) = 47260 and intl_ship_fee_krw(0.3) = 7860 and intl_ship_fee_krw(17.01) is null and intl_ship_fee_krw(0) is null
     and intl_ship_fee_krw(null) is null
  then r := r || 'R1 '; else bad := bad || 'R1(' || n || '/' || n2 || ') '; end if;
  -- R1b 가산율·원가는 고객이 못 읽는다
  perform set_config('request.jwt.claims', c_jp, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from intl_ship_rates;
  select count(*) into n2 from intl_ship_settings;
  perform set_config('role', 'postgres', true);
  if n = 0 and n2 = 0 then r := r || 'R1b '; else bad := bad || 'R1b(' || n || '/' || n2 || ') '; end if;

  -- R2 무게 필수(한국 국제 택배)
  begin
    insert into listings (seller_id, title, description, source_language, price, currency, category, country, region, trade_method, cross_border_enabled)
      values (kr, '[r57] 무게없음', 'x', 'ko', 30000, 'KRW', 'etc', 'KR', '서울', 'both', true);
    bad := bad || 'R2 ';
  exception when others then if sqlerrm like 'ship weight required%' then r := r || 'R2 '; else bad := bad || 'R2(' || sqlerrm || ') '; end if; end;
  insert into listings (seller_id, title, description, source_language, price, currency, category, country, region, trade_method, cross_border_enabled)
    values (jp, '[r57] JP 무게없음', 'x', 'ja', 3000, 'JPY', 'etc', 'JP', '東京', 'both', true) returning id into l4;
  insert into listings (seller_id, title, description, source_language, price, currency, category, country, region, trade_method, cross_border_enabled, ship_weight_kg)
    values (kr, '[r57] 2kg', 'x', 'ko', 50000, 'KRW', 'etc', 'KR', '서울', 'both', true, 2) returning id into l1;
  begin update listings set ship_weight_kg = null where id = l1; bad := bad || 'R2b ';
  exception when others then if sqlerrm like 'ship weight required%' then r := r || 'R2b '; else bad := bad || 'R2b(' || sqlerrm || ') '; end if; end;
  -- 옛 상품(무게 없음)을 흉내: 트리거를 건너뛰고 넣는다
  set local session_replication_role = replica;
  insert into listings (seller_id, title, description, source_language, price, currency, category, country, region, trade_method, cross_border_enabled)
    values (kr, '[r57] 옛 상품', 'x', 'ko', 40000, 'KRW', 'etc', 'KR', '서울', 'both', true) returning id into l2;
  set local session_replication_role = origin;
  update listings set title = '[r57] 옛 상품 제목만' , price = 41000 where id = l2;   -- 다른 칸 수정은 막지 않는다
  r := r || 'R2c ';

  -- R3 일반 결제: 한국 2kg 상품, 일본 구매자
  perform set_config('request.jwt.claims', c_jp, true);
  t1 := start_transaction(l1, 0, false);
  if t1.intl_shipping_fee = 11650 and t1.customs_deposit = 0 and t1.ship_weight_kg = 2 and t1.center = 'SEOUL' and t1.platform_fee = 5000
     and tx_charge_base(t1) = 61650
  then r := r || 'R3 '; else bad := bad || 'R3(' || t1.intl_shipping_fee || '/' || t1.customs_deposit || ') '; end if;
  -- R4 무게 없는 옛 상품은 국제 결제가 막히고 상품은 그대로 판매중
  begin perform start_transaction(l2, 0, false); bad := bad || 'R4 ';
  exception when others then if sqlerrm like 'ship weight required%' then r := r || 'R4 '; else bad := bad || 'R4(' || sqlerrm || ') '; end if; end;
  if (select status from listings where id = l2) = 'active' then r := r || 'R4b '; else bad := bad || 'R4b '; end if;
  -- R4c 같은 나라(한국 구매자)는 무게 없이도 국내 거래
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', '53515a6d-7f2c-4640-8b84-175d3b824fac')::text, true);
  t6 := start_transaction(l2, 0, false);
  if not t6.is_cross_border and t6.intl_shipping_fee = 0 and t6.customs_deposit = 0 then r := r || 'R4c '; else bad := bad || 'R4c '; end if;

  -- R5 통관 예치금 경계(¥16,666)
  select rate into v_rate from exchange_rates where pair = 'KRW_JPY';
  v_min := customs_min_krw();
  if v_min * v_rate >= 16666 and (v_min - 1) * v_rate < 16666
     and direct_customs_deposit('KR', 'KRW', v_min) = ceil(v_min * 0.10 / 10) * 10
     and direct_customs_deposit('KR', 'KRW', v_min - 1) = 0
     and direct_customs_deposit('JP', 'JPY', 999999) = 0
  then r := r || 'R5 '; else bad := bad || 'R5(' || v_min || ') '; end if;
  insert into listings (seller_id, title, description, source_language, price, currency, category, country, region, trade_method, cross_border_enabled, ship_weight_kg)
    values (kr, '[r57] 경계', 'x', 'ko', v_min, 'KRW', 'etc', 'KR', '서울', 'shipping', true, 0.5) returning id into l3;
  perform set_config('request.jwt.claims', c_jp, true);
  t3 := start_transaction(l3, 0, false);
  if t3.customs_deposit = ceil(v_min * 0.10 / 10) * 10 and t3.customs_deposit > 0 and t3.intl_shipping_fee = 7860
     and t3.platform_fee = floor(v_min * 0.10) and tx_charge_base(t3) = v_min + 7860 + t3.customs_deposit
  then r := r || 'R5b '; else bad := bad || 'R5b(' || t3.customs_deposit || ') '; end if;

  -- R6 일본 상품 → 한국 구매자: 정액 900엔, 예치금 없음, 일본 센터
  perform set_config('request.jwt.claims', c_kr, true);
  t4 := start_transaction(l4, 0, false);
  if t4.intl_shipping_fee = 900 and t4.customs_deposit = 0 and t4.center = 'NARITA' and t4.ship_weight_kg is null
  then r := r || 'R6 '; else bad := bad || 'R6 '; end if;

  -- R7 경매 낙찰 결제(한국 상품 ₩200,000, 5.2kg)
  perform set_config('tomo.auction', '1', true);
  insert into listings (seller_id, title, description, source_language, price, currency, category, country, region, trade_method, cross_border_enabled, ship_weight_kg, sale_type, status)
    values (kr, '[r57] 경매', 'x', 'ko', 10000, 'KRW', 'etc', 'KR', '서울', 'shipping', true, 5.2, 'auction', 'reserved') returning id into l5;
  insert into auctions (listing_id, seller_id, currency, start_price, current_price, duration_days, ends_at, original_ends_at, status, winner_id, final_price, pay_due_at, closed_at)
    values (l5, kr, 'KRW', 10000, 200000, 3, now() - interval '1 minute', now() - interval '1 minute', 'awaiting_payment', jp, 200000, now() + interval '1 day', now() - interval '1 minute')
    returning id into a1;
  perform set_config('tomo.auction', '', true);
  perform set_config('request.jwt.claims', c_jp, true);
  t2 := start_auction_transaction(a1);
  -- 5.2kg → 5.5 구간 16,470 × 1.1 = 18,117 → 18,120. 200,000 ≥ 기준 → 예치금 20,000
  if t2.intl_shipping_fee = 18120 and t2.customs_deposit = 20000 and t2.platform_fee = 20000 and tx_charge_base(t2) = 238120
  then r := r || 'R7 '; else bad := bad || 'R7(' || t2.intl_shipping_fee || '/' || t2.customs_deposit || ') '; end if;
  -- R7b 표시 견적 = 결제 값
  v := listing_quote(l1);
  if (v->>'intl_fee')::int = 11650 and (v->>'customs_min')::int = v_min and listing_quote(l2)->>'intl_fee' is null
     and (listing_quote(l4)->>'intl_fee')::int = 900 and listing_quote(l4)->>'customs_min' is null
  then r := r || 'R7b '; else bad := bad || 'R7b(' || v::text || ') '; end if;

  -- R8 결제 확정 → 센터 단계 + 운영 이벤트
  perform set_config('request.jwt.claims', c_svc, true);
  perform mark_tx_paid(t1.id, 'pi_test_r57_1');
  perform mark_tx_paid(t2.id, 'pi_test_r57_2');
  perform mark_tx_paid(t3.id, 'pi_test_r57_3');
  perform mark_tx_paid(t4.id, 'pi_test_r57_4');
  perform mark_tx_paid(t6.id, 'pi_test_r57_6');
  select count(*) into n from tx_center_steps where tx_id in (t1.id, t2.id, t3.id, t4.id) and done_at is null;
  select count(*) into n2 from ops_outbox where type = 'center.step_due' and target_id in (t1.id::text, t2.id::text, t3.id::text, t4.id::text);
  if n = 4 and n2 = 4 and not exists (select 1 from tx_center_steps where tx_id = t6.id)
     and (select center from tx_center_steps where tx_id = t4.id) = 'NARITA'
  then r := r || 'R8 '; else bad := bad || 'R8(' || n || '/' || n2 || ') '; end if;

  -- R9 CarryToJ 신청번호 입력
  perform set_config('request.jwt.claims', c_kr, true);
  begin perform admin_set_center_step(t1.id, 'CJ123', ''); bad := bad || 'R9 ';
  exception when others then if sqlerrm like 'admin only%' then r := r || 'R9 '; else bad := bad || 'R9(' || sqlerrm || ') '; end if; end;
  perform set_config('request.jwt.claims', c_adm, true);
  begin perform admin_set_center_step(t1.id, '공백 번호', ''); bad := bad || 'R9b ';
  exception when others then if sqlerrm like 'invalid ref%' then r := r || 'R9b '; else bad := bad || 'R9b(' || sqlerrm || ') '; end if; end;
  s := admin_set_center_step(t1.id, 'CTJ-20261127-01', '해상 ACE');
  if s.ref = 'CTJ-20261127-01' and s.done_at is not null and s.memo = '해상 ACE' and s.done_by = adm then r := r || 'R9c '; else bad := bad || 'R9c '; end if;
  -- 고객(판매자)은 단계 표와 메모를 못 읽는다, 한국 센터 번호는 판매자 주소에 안 붙는다
  perform set_config('request.jwt.claims', c_kr, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from tx_center_steps;
  perform set_config('role', 'postgres', true);
  if n = 0 and tx_center_ref(t1.id) is null then r := r || 'R9d '; else bad := bad || 'R9d(' || n || ') '; end if;

  -- R10 재팬비즈 입고 예정 번호 → 판매자 주소·알림
  perform set_config('request.jwt.claims', c_jp, true);
  if tx_center_ref(t4.id) is null then r := r || 'R10 '; else bad := bad || 'R10 '; end if;
  perform set_config('request.jwt.claims', c_adm, true);
  perform admin_set_center_step(t4.id, '58213', '');
  perform set_config('request.jwt.claims', c_jp, true);
  n := (select count(*) from notifications where user_id = jp and kind = 'tx_center_addr_ready' and ref_id = t4.id::text);
  if tx_center_ref(t4.id) = '58213' and n = 1 then r := r || 'R10b '; else bad := bad || 'R10b(' || n || ') '; end if;
  perform set_config('request.jwt.claims', c_kr, true);   -- 구매자는 못 본다
  if tx_center_ref(t4.id) is null then r := r || 'R10c '; else bad := bad || 'R10c '; end if;

  -- R11 재알림(6시간)
  update tx_center_steps set due_at = now() - interval '7 hours' where tx_id in (t2.id, t3.id);
  update tx_center_steps set due_at = now() - interval '7 hours' where tx_id = t1.id;   -- 이미 끝난 줄은 안 나간다
  n := cron_center_steps();
  n2 := cron_center_steps();
  if n = 2 and n2 = 0 and (select count(*) from ops_outbox where type = 'center.step_overdue' and target_id in (t2.id::text, t3.id::text)) = 2
  then r := r || 'R11 '; else bad := bad || 'R11(' || n || '/' || n2 || ') '; end if;

  -- R12 실측 초과 → 판매자 정산에서 차감
  perform set_config('request.jwt.claims', c_adm, true);
  begin perform admin_set_measured_weight(t1.id, 3.2); bad := bad || 'R12 ';
  exception when others then if sqlerrm like 'measure needs center stage%' then r := r || 'R12 '; else bad := bad || 'R12(' || sqlerrm || ') '; end if; end;
  perform set_config('request.jwt.claims', c_kr, true);
  perform advance_transaction(t1.id, 'shipped_to_center', 'CJ0001');
  perform set_config('request.jwt.claims', c_adm, true);
  begin perform admin_set_measured_weight(t1.id, 18); bad := bad || 'R12b ';
  exception when others then if sqlerrm like 'weight out of range%' then r := r || 'R12b '; else bad := bad || 'R12b(' || sqlerrm || ') '; end if; end;
  v := admin_set_measured_weight(t1.id, 3.2);   -- 3.5 구간 12,440 × 1.1 = 13,684 → 13,690, 차액 2,040
  if (v->>'overage')::int = 2040 and (select ship_overage from transactions where id = t1.id) = 2040
     and exists (select 1 from notifications where user_id = kr and kind = 'tx_ship_overage' and ref_id = t1.id::text)
  then r := r || 'R12c '; else bad := bad || 'R12c(' || v::text || ') '; end if;
  v := admin_set_measured_weight(t1.id, 1.5);   -- 가벼우면 0(돌려주지 않고 차감만 없앤다)
  v := admin_set_measured_weight(t1.id, 3.2);
  perform advance_transaction(t1.id, 'center_received', null);
  perform advance_transaction(t1.id, 'shipped_international', 'EMS1');
  perform set_config('request.jwt.claims', c_jp, true);
  perform advance_transaction(t1.id, 'delivered', null);
  perform advance_transaction(t1.id, 'completed', null);
  if (select amount from seller_ledger where transaction_id = t1.id and kind = 'sale') = 50000 - 5000 - 2040
  then r := r || 'R12d '; else bad := bad || 'R12d(' || coalesce((select amount from seller_ledger where transaction_id = t1.id and kind = 'sale'), -1) || ') '; end if;
  -- R12e 일본 센터 거래에는 실측 입력 없음
  perform set_config('request.jwt.claims', c_adm, true);
  begin perform admin_set_measured_weight(t4.id, 1); bad := bad || 'R12e ';
  exception when others then if sqlerrm like 'not a KR center%' then r := r || 'R12e '; else bad := bad || 'R12e(' || sqlerrm || ') '; end if; end;

  -- R13 통관 예치금 정산(남음 → 부분 환불), 판매자 정산에 예치금 없음
  begin perform admin_settle_customs(t2.id, 15000, ''); bad := bad || 'R13 ';
  exception when others then if sqlerrm like 'customs settle needs%' then r := r || 'R13 '; else bad := bad || 'R13(' || sqlerrm || ') '; end if; end;
  perform set_config('request.jwt.claims', c_kr, true);
  perform advance_transaction(t2.id, 'shipped_to_center', 'CJ0002');
  perform set_config('request.jwt.claims', c_adm, true);
  perform advance_transaction(t2.id, 'center_received', null);
  perform advance_transaction(t2.id, 'shipped_international', 'EMS2');
  v := admin_settle_customs(t2.id, 15000, '세관 고지서');
  if (v->>'refund_amount')::int = 5000 and (v->>'shortfall')::int = 0
     and exists (select 1 from refunds where id = (v->>'refund')::uuid and amount = 5000 and not is_full and kind = 'tx' and status = 'pending' and payment_key = 'pi_test_r57_2')
     and (select customs_actual from transactions where id = t2.id) = 15000
  then r := r || 'R13b '; else bad := bad || 'R13b(' || v::text || ') '; end if;
  begin perform admin_settle_customs(t2.id, 1000, ''); bad := bad || 'R13c ';
  exception when others then if sqlerrm like 'customs already settled%' then r := r || 'R13c '; else bad := bad || 'R13c(' || sqlerrm || ') '; end if; end;
  if tx_refundable(t2) = 238120 - 5000 then r := r || 'R13d '; else bad := bad || 'R13d(' || tx_refundable(t2) || ') '; end if;
  perform set_config('request.jwt.claims', c_jp, true);
  perform advance_transaction(t2.id, 'delivered', null);
  perform advance_transaction(t2.id, 'completed', null);
  if (select amount from seller_ledger where transaction_id = t2.id and kind = 'sale') = 180000 then r := r || 'R13e '; else bad := bad || 'R13e '; end if;
  -- 예치금 없는 거래는 정산 불가
  perform set_config('request.jwt.claims', c_adm, true);
  begin perform admin_settle_customs(t1.id, 0, ''); bad := bad || 'R13f ';
  exception when others then if sqlerrm like 'no customs deposit%' then r := r || 'R13f '; else bad := bad || 'R13f(' || sqlerrm || ') '; end if; end;

  -- R14 부족분 = 운영 부담 기록(추가 청구 없음), 뒤의 분쟁 전액 환불은 예치금 포함
  perform set_config('request.jwt.claims', c_kr, true);
  perform advance_transaction(t3.id, 'shipped_to_center', 'CJ0003');
  perform set_config('request.jwt.claims', c_adm, true);
  perform advance_transaction(t3.id, 'center_received', null);
  perform advance_transaction(t3.id, 'shipped_international', 'EMS3');
  v := admin_settle_customs(t3.id, t3.customs_deposit + 3000, '');
  if v->>'refund' is null and (v->>'shortfall')::int = 3000 and (select customs_shortfall from transactions where id = t3.id) = 3000
     and not exists (select 1 from refunds where transaction_id = t3.id)
  then r := r || 'R14 '; else bad := bad || 'R14(' || v::text || ') '; end if;
  update transactions set status = 'disputed', disputed_from = 'shipped_international' where id = t3.id;
  perform resolve_dispute(t3.id, 'cancelled', '시험 분쟁');
  if (select amount from refunds where transaction_id = t3.id and is_full) = tx_charge_base(t3) then r := r || 'R14b '; else bad := bad || 'R14b '; end if;

  -- R15 운영자 취소 = 예치금 포함 전액
  perform set_config('tomo.auction', '1', true);
  insert into listings (seller_id, title, description, source_language, price, currency, category, country, region, trade_method, cross_border_enabled, ship_weight_kg)
    values (kr, '[r57] 취소', 'x', 'ko', 300000, 'KRW', 'etc', 'KR', '서울', 'shipping', true, 1) returning id into l6;
  perform set_config('request.jwt.claims', c_jp, true);
  t5 := start_transaction(l6, 0, false);
  perform set_config('request.jwt.claims', c_svc, true);
  perform mark_tx_paid(t5.id, 'pi_test_r57_5');
  perform set_config('request.jwt.claims', c_adm, true);
  v := admin_cancel_transaction(t5.id, '시험 취소');
  if (v->>'amount')::int = 300000 + 9260 + 30000 and t5.customs_deposit = 30000 then r := r || 'R15 '; else bad := bad || 'R15(' || v::text || ') '; end if;
  -- 단계 입력은 취소된 거래에 막힌다
  begin perform admin_set_center_step(t5.id, 'X1', ''); bad := bad || 'R15b ';
  exception when others then if sqlerrm like 'tx not active%' then r := r || 'R15b '; else bad := bad || 'R15b(' || sqlerrm || ') '; end if; end;

  -- R16 운영자 요율 수정(가산율·원가), 고객은 못 바꿈
  perform admin_set_ship_markup(1.2);
  if intl_ship_fee_krw(1) = ((8410 * 12 + 99) / 100) * 10 then r := r || 'R16 '; else bad := bad || 'R16(' || intl_ship_fee_krw(1) || ') '; end if;
  perform admin_set_ship_rate(1.00, 9000);
  if intl_ship_fee_krw(1) = 10800 then r := r || 'R16b '; else bad := bad || 'R16b '; end if;
  perform set_config('request.jwt.claims', c_jp, true);
  begin perform admin_set_ship_markup(1.0); bad := bad || 'R16c ';
  exception when others then if sqlerrm like 'admin only%' then r := r || 'R16c '; else bad := bad || 'R16c(' || sqlerrm || ') '; end if; end;
  -- 이미 만든 거래 금액은 요율을 바꿔도 그대로
  if (select intl_shipping_fee from transactions where id = t1.id) = 11650 then r := r || 'R16d '; else bad := bad || 'R16d '; end if;

  perform setval('tx_code_seq', q_tx.last_value, q_tx.is_called);
  perform setval('auction_code_seq', q_au.last_value, q_au.is_called);
  if bad = '' then raise exception 'TESTRESULT PASS %', r;
  else raise exception 'TESTRESULT FAIL bad=% ok=%', bad, r; end if;
end $t$;
