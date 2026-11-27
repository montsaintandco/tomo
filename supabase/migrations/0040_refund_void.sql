-- 0040 환불 상태 「무효」(void): 실결제가 없어 환불이 필요 없는 행 (Ren 11/27 134ㄱ).
-- 대기열(/admin/refunds 처리 필요·내비 카운트)은 pending·failed만 보므로 자동 제외.
-- 고객 알림: notify_refund(0027)는 done 전환에만 알림 → void 전환은 알림 없음(변경 불필요).
alter type refund_status add value if not exists 'void';

-- refund_mark: done·void 행은 바꾸지 않는다 (무효 행이 재시도로 done/failed가 되지 않게). 나머지는 0025와 동일
create or replace function refund_mark(p_id uuid, p_ok boolean, p_error text, p_amount_krw int) returns refunds
  language plpgsql security definer set search_path = public as $$
declare v_f refunds;
begin
  update refunds set
    status = case when p_ok then 'done'::refund_status else 'failed'::refund_status end,
    attempts = attempts + 1,
    last_error = case when p_ok then null else left(coalesce(p_error, ''), 500) end,
    amount_krw = case when p_ok then coalesce(p_amount_krw, amount_krw) else amount_krw end,
    done_at = case when p_ok then now() else null end
    where id = p_id and status::text not in ('done', 'void')
    returning * into v_f;
  if v_f.id is null then select * into v_f from refunds where id = p_id; end if;   -- 이미 완료·무효(멱등)
  return v_f;
end $$;
revoke all on function refund_mark(uuid, boolean, text, int) from public, anon, authenticated;
