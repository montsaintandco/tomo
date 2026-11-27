-- T2 리허설(tomo 운영 DB, 한 번에 실행 → 끝에서 예외로 전부 롤백). 앞에 0056 본문(begin/commit 뺀 것)을 붙여 보낸다.
-- 성공 = "TESTRESULT PASS …", 실패 = "TESTRESULT FAIL …". 시험 행 코드는 MBT9 로 시작. 다리 함수(에어쉽 쪽)는 단위 검사의 가짜 응답으로 본다.
-- 관리자 id·상품 id 는 2026-11-27 운영 값(다시 쓸 때 바꾼다).
DO $t$
declare
  adm uuid := '60c7f220-53e5-4876-8917-0397dc717143';
  items uuid[] := array['9d07d053-a612-4ddb-bee6-50fcb365e414','c544cf88-b240-4ccb-b5e7-8466a1dac509','37f001df-bdc1-441d-a717-251ff8b44872',
    'd11789db-ea8a-43e6-8378-589d9a1561cb','206e52f1-93e6-4a74-b8f1-b42d5da1d9b8','a3879a52-e557-4985-9b6b-13f6c6caa178',
    'cb9a5544-4198-40ad-936c-767af63400f7','34fd11db-58b9-4215-b6f2-78aa4f299d1d']::uuid[];
  ids uuid[] := '{}'; v_id uuid; v_a uuid; i int; r text := ''; bad text := ''; v jsonb; v_b market_bids; n int; n2 int;
  claims_adm text; claims_svc text := '{"role":"service_role"}';
begin
  claims_adm := json_build_object('role', 'authenticated', 'sub', adm)::text;
  -- 시험 행 8개: 워커 건 authorized, 승인 행 authorized
  for i in 1..8 loop
    insert into market_bids (code, user_id, request_id, external_item_id, source, source_id, status, cap_jpy, seen_price_jpy, ends_at, rate,
        auth_breakdown, auth_krw, authorized_at, auth_expires_at, executor, ship_name, ship_phone, ship_postal, ship_address)
      values ('MBT90' || i, adm, gen_random_uuid(), items[i], 'mercari', 'm9999999990' || i, 'authorized', 3000, 1000, now() + interval '5 hours', 8.8,
        '{"fee":0,"total":40000,"customs":2000,"subtotal":30000,"intl_shipping":8000}', 40000, now(), now() + interval '6 days', 'airship',
        '시험', '010', '00000', '시험 주소')
      returning id into v_id;
    insert into market_bid_auths (bid_id, stripe_session_id, payment_intent_id, amount_krw, status, authorized_at)
      values (v_id, 'cs_test_t2_' || i || '_' || v_id, 'pi_test_t2_' || i || '_' || v_id, 40000, 'authorized', now()) returning id into v_a;
    update market_bids set auth_id = v_a where id = v_id;
    ids := ids || v_id;
  end loop;

  -- ── A 수동 전환 ──
  perform set_config('request.jwt.claims', claims_adm, true);
  v := market_bid_set_executor(ids[1], 'manual', '로그인 풀림 30분', 'authorized');
  select * into v_b from market_bids where id = ids[1];
  if v->>'executor' = 'manual' and v_b.executor = 'manual' and exists (select 1 from market_bid_events where bid_id = ids[1] and kind = 'executor')
  then r := r || 'A1 '; else bad := bad || 'A1 '; end if;
  v := market_bid_set_executor(ids[1], 'manual', 'x');
  if (v->>'again')::boolean then r := r || 'A2 '; else bad := bad || 'A2 '; end if;
  update market_bids set armed_at = now(), executor_ref = 'row-2' where id = ids[2];
  begin perform market_bid_set_executor(ids[2], 'manual', 'x', null, false); bad := bad || 'A3 ';
  exception when others then if sqlerrm like 'mb: worker armed%' then r := r || 'A3 '; else bad := bad || 'A3(' || sqlerrm || ') '; end if; end;
  v := market_bid_set_executor(ids[2], 'manual', '에어쉽 행 닫음', null, true);
  if v->>'executor' = 'manual' then r := r || 'A4 '; else bad := bad || 'A4 '; end if;
  begin perform market_bid_set_executor(ids[3], 'manual', ''); bad := bad || 'A5 ';
  exception when others then if sqlerrm like 'mb: note required%' then r := r || 'A5 '; else bad := bad || 'A5(' || sqlerrm || ') '; end if; end;
  begin perform market_bid_set_executor(ids[3], 'airship', 'x'); bad := bad || 'A6 ';
  exception when others then if sqlerrm like 'mb: bad executor%' then r := r || 'A6 '; else bad := bad || 'A6(' || sqlerrm || ') '; end if; end;
  update market_bids set status = 'hold', hold_reason = 'worker_won', placed_at = now(), last_bid_jpy = 1100, worker_final_jpy = 1100 where id = ids[4];
  begin perform market_bid_set_executor(ids[4], 'manual', 'x', null, true); bad := bad || 'A7 ';
  exception when others then if sqlerrm like 'mb: already placed%' then r := r || 'A7 '; else bad := bad || 'A7(' || sqlerrm || ') '; end if; end;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform market_bid_set_executor(ids[3], 'manual', 'x'); bad := bad || 'A8 ';
  exception when others then if sqlerrm like 'mb: admin only%' then r := r || 'A8 '; else bad := bad || 'A8(' || sqlerrm || ') '; end if; end;

  -- ── B 접수된 워커 건 닫기 막기 ──
  update market_bids set armed_at = now(), executor_ref = 'row-5' where id = ids[5];
  perform set_config('request.jwt.claims', claims_adm, true);
  begin perform market_bid_release(ids[5], 'cancelled', '운영 취소', null, 'authorized'); bad := bad || 'B1 ';
  exception when others then if sqlerrm like 'mb: worker armed%' then r := r || 'B1 '; else bad := bad || 'B1(' || sqlerrm || ') '; end if; end;
  begin perform market_bid_release(ids[5], 'missed', '못 넣음', null, 'authorized'); bad := bad || 'B2 ';
  exception when others then if sqlerrm like 'mb: worker armed%' then r := r || 'B2 '; else bad := bad || 'B2(' || sqlerrm || ') '; end if; end;
  update profiles set is_admin = false where id = adm;   -- 고객 자격으로(시험 행의 고객 = 이 계정)
  begin perform cancel_market_bid(ids[5]); bad := bad || 'B3 ';
  exception when others then if sqlerrm like 'mb: cancel closed%' then r := r || 'B3 '; else bad := bad || 'B3(' || sqlerrm || ') '; end if; end;
  v := cancel_market_bid(ids[3]);
  if v->>'status' = 'cancelled' and (select status from market_bid_auths where bid_id = ids[3]) = 'releasing' then r := r || 'B4 '; else bad := bad || 'B4 '; end if;
  update profiles set is_admin = true where id = adm;
  perform set_config('request.jwt.claims', claims_svc, true);
  perform market_bid_release(ids[5], 'missed', 'worker: reauth', null, 'authorized');   -- 다리 작업(서버 권한) 결과 전달은 그대로
  if (select status from market_bids where id = ids[5]) = 'missed' then r := r || 'B5 '; else bad := bad || 'B5 '; end if;
  perform set_config('request.jwt.claims', claims_adm, true);
  v := market_bid_set_executor(ids[6], 'manual', 'x');
  perform market_bid_release(ids[6], 'cancelled', '운영 취소', null, 'authorized');
  if (select status from market_bids where id = ids[6]) = 'cancelled' then r := r || 'B6 '; else bad := bad || 'B6 '; end if;

  -- ── C 전체 흐름(tomo 쪽, 에어쉽 다리 호출 순서대로) ──
  perform set_config('request.jwt.claims', claims_svc, true);
  v := market_bid_set_armed(ids[7], 'row-7', 'authorized');
  perform market_bid_set_placed(ids[7], 1100, 'worker: fire 1', 'authorized', null);
  v := market_bid_worker_won(ids[7], 1100, 'placed');
  select * into v_b from market_bids where id = ids[7];
  if v_b.status = 'hold' and v_b.hold_reason = 'worker_won' and v_b.capture_krw is null
     and (select status from market_bid_auths where id = v_b.auth_id) = 'authorized' then r := r || 'C1 '; else bad := bad || 'C1(' || v_b.status || ') '; end if;
  perform set_config('request.jwt.claims', claims_adm, true);
  perform market_bid_set_won(ids[7], 1100, 0, '메루카리 낙찰자 표기 확인', 'hold');
  select * into v_b from market_bids where id = ids[7];
  if v_b.status = 'won' and v_b.capture_krw > 0 and v_b.capture_krw <= v_b.auth_krw then r := r || 'C2 '; else bad := bad || 'C2(' || v_b.status || '/' || coalesce(v_b.hold_reason, '-') || ') '; end if;
  -- 매입 기록(앱 settleWon 이 Stripe capture 뒤에 남기는 기록을 흉내). 대행 주문(T 번호)은 시퀀스를 쓰므로 만들지 않는다(T1 에서 확인)
  update market_bid_auths set status = 'captured', captured_krw = v_b.capture_krw, captured_at = now() where id = v_b.auth_id;
  update market_bids set captured_krw = v_b.capture_krw where id = ids[7];
  if (select captured_krw from market_bids where id = ids[7]) = v_b.capture_krw then r := r || 'C3 '; else bad := bad || 'C3 '; end if;

  -- ── D 구매 기한 재알림(bid.to_buy_due) ──
  perform set_config('request.jwt.claims', claims_svc, true);
  update market_bids set ends_at = now() - interval '3 hours' where id in (ids[4], ids[7]);
  perform cron_market_bids(); perform cron_market_bids();
  select count(*) into n from ops_outbox where type = 'bid.to_buy_due' and target_id in (ids[4]::text, ids[7]::text);
  if n = 2 then r := r || 'D1 '; else bad := bad || 'D1(' || n || ') '; end if;
  update market_bids set ends_at = now() - interval '13 hours' where id = ids[4];
  perform cron_market_bids();
  select count(*) into n from ops_outbox where type = 'bid.to_buy_due' and target_id = ids[4]::text;
  if n = 2 and exists (select 1 from ops_outbox where dedupe_key = 'bid.to_buy_due:' || ids[4] || ':12') then r := r || 'D2 '; else bad := bad || 'D2(' || n || ') '; end if;
  update market_bids set ends_at = now() - interval '25 hours' where id = ids[4];
  perform cron_market_bids();
  select count(*) into n from ops_outbox where type = 'bid.to_buy_due' and target_id = ids[4]::text;
  if n = 2 then r := r || 'D3 '; else bad := bad || 'D3(' || n || ') '; end if;
  update market_bids set ends_at = now() - interval '21 hours', status = 'hold', hold_reason = 'result overdue' where id = ids[8];
  perform cron_market_bids();
  if not exists (select 1 from ops_outbox where type = 'bid.to_buy_due' and target_id = ids[8]::text) then r := r || 'D4 '; else bad := bad || 'D4 '; end if;
  -- 크론이 멈췄다 돌아와도 한꺼번에 여러 단계가 울리지 않는다: 처음 본 건이 마감 21시간 뒤 → :20 하나만
  update market_bids set hold_reason = 'worker_won', worker_final_jpy = 1000 where id = ids[8];
  perform cron_market_bids();
  select count(*) into n from ops_outbox where type = 'bid.to_buy_due' and target_id = ids[8]::text;
  if n = 1 and exists (select 1 from ops_outbox where dedupe_key = 'bid.to_buy_due:' || ids[8] || ':20') then r := r || 'D5 '; else bad := bad || 'D5(' || n || ') '; end if;

  -- ── E 실행자 airship 기본값 + 접수(에어쉽 스위치 꺼짐 = 건강 신호 비정상) ──
  perform set_config('request.jwt.claims', claims_adm, true);
  perform admin_market_bid_settings('{"executor":"airship"}');
  if (select executor from market_bid_settings where id) = 'airship' and not (select accepting from market_bid_settings where id) then r := r || 'E1 '; else bad := bad || 'E1 '; end if;
  begin perform admin_market_bid_settings('{"accepting":true}'); bad := bad || 'E2 ';
  exception when others then if sqlerrm like 'mb: worker down%' then r := r || 'E2 '; else bad := bad || 'E2(' || sqlerrm || ') '; end if; end;

  -- ── F 건강 신호 끊김(R②): 에어쉽 크론은 그대로 두고 tomo 쪽 신호 시각을 당긴다 ──
  update market_bid_worker_health set received_at = now(), worker_at = now(), ok = true, reason = null, bid_enabled = true where id;
  perform admin_market_bid_settings('{"accepting":true}');
  select count(*) into n2 from ops_outbox where type = 'bid.worker_down';
  update market_bid_worker_health set received_at = now() - interval '6 minutes' where id;
  perform set_config('request.jwt.claims', claims_svc, true);
  perform cron_market_bids(); perform cron_market_bids();
  select count(*) into n from ops_outbox where type = 'bid.worker_down';
  if not (select accepting from market_bid_settings where id) and (select pause_reason from market_bid_settings where id) = 'auto: worker signal lost'
     and n = n2 + 1 then r := r || 'F1 '; else bad := bad || 'F1(' || n || '/' || n2 || ') '; end if;

  if bad = '' then raise exception 'TESTRESULT PASS %', r; else raise exception 'TESTRESULT FAIL bad=% ok=%', bad, r; end if;
end $t$;
