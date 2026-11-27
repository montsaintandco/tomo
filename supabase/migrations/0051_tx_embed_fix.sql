-- 0051: 2026-11-27 운영 실결제 시험(TX000073) 뒤 고친 것 (docs/aaa/index.md 사고 기록)
-- A) listings.held_tx_id → transactions FK 제거.
--    0041 이 이 FK 를 더해 transactions↔listings 관계가 2개(transactions.listing_id, listings.held_tx_id)가 됐다.
--    그래서 PostgREST 의 listings(...)/transactions(...) 임베드가 PGRST201(모호)로 실패해 거래 상세·결제 복귀가 404,
--    /admin/transactions·마이페이지 구매/판매 내역이 빈 화면이었다(11:44~16:5x KST).
--    운영 DB 는 메인 세션이 11/27 16:5x 에 이 제약을 이미 지우고 notify pgrst 했다. 이 파일은 기록이자 CI 재생용(멱등).
--    칸(held_tx_id)은 남긴다. 무결성 대체 검사는 넣지 않는다: 값을 쓰는 곳은 listing_after_tx_cancel(security definer,
--    방금 바꾼 거래의 id)뿐이고 admin_release_listing_hold 는 지우기만 한다. 거래 행은 지우지 않는다.
--    판매자가 콘솔로 바꿔도 보류 해제 활동 기록의 tx 메모만 틀어진다(상태 전이는 guard_listing_hold 가 막는다).
--    재발 방지: 코드 임베드에 관계 이름(listings!transactions_listing_id_fkey) 명시, tests/postgrest-embeds.db.test.ts,
--    /api/health embeds + 스모크.
-- B) 결제된 경매 거래를 운영자가 취소(admin_cancel_transaction paid)·분쟁 환불하면 상품이 공개 판매중으로 돌아가던 것:
--    경매로 팔린 상품(auctions.tx_id = 그 거래)이면 숨긴다. 판매자는 다시 경매/일반 전환을 고른다
--    (0047 auction_relistable 이 paid + 상품 active 를 이미 허용 — 강제 종료 뒤와 같은 처리).
-- E) 직거래 결제 완료 때 구매자 알림 tx_buyer_paid(「결제가 완료됐어요」). notify_transaction 은 통째로 다시 쓰지 않고
--    지금 정의의 paid 줄 하나만 바꾼다(0049 방식). 바꿀 글이 정확히 한 번 있지 않으면 멈춘다.

-- ── A ──
do $a$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.listings'::regclass and contype = 'f' and confrelid = 'public.transactions'::regclass loop
    execute format('alter table public.listings drop constraint %I', r.conname);
  end loop;
end $a$;

-- ── B ── (0041 정의 + hidden 한 줄)
create or replace function listing_after_tx_cancel(p_listing uuid, p_tx uuid, p_from tx_status) returns text
  language plpgsql security definer set search_path = public as $$
begin
  if p_from in ('pending_payment','paid') then
    update listings set status = 'active', reserved_at = null, held_at = null, held_tx_id = null,
      hidden = hidden or exists (select 1 from auctions a where a.listing_id = p_listing and a.tx_id = p_tx) -- 0051: 경매로 팔린 상품은 숨김
      where id = p_listing;
    return 'active';
  end if;
  update listings set status = 'held', reserved_at = null, held_at = now(), held_tx_id = p_tx where id = p_listing;
  return 'held';
end $$;
revoke all on function listing_after_tx_cancel(uuid, uuid, tx_status) from public, anon, authenticated;

-- ── E ──
do $e$
declare
  v_def text := pg_get_functiondef('public.notify_transaction'::regproc);
  v_old text := $o$    when 'paid' then perform notify(new.seller_id, 'tx_paid', 'tx', new.id::text, v_d);$o$;
  v_new text := $n$    when 'paid' then
      perform notify(new.seller_id, 'tx_paid', 'tx', new.id::text, v_d);
      if old.status = 'pending_payment' then perform notify(new.buyer_id, 'tx_buyer_paid', 'tx', new.id::text, v_d); end if; -- 0051: 구매자 결제 완료$n$;
  v_n int;
begin
  v_def := replace(v_def, chr(13), ''); v_old := replace(v_old, chr(13), ''); v_new := replace(v_new, chr(13), '');
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception '0051: notify_transaction 의 paid 줄이 예상과 다름(%건)', v_n; end if;
  execute replace(v_def, v_old, v_new);
end $e$;

notify pgrst, 'reload schema';

-- 되돌리기(이 순서로):
-- E) do $r$ declare v_def text := replace(pg_get_functiondef('public.notify_transaction'::regproc), chr(13), '');
--      v_s int := position('    when ''paid'' then' || chr(10) || '      perform notify(new.seller_id' in v_def);
--      v_e int := position('-- 0051: 구매자 결제 완료' in v_def) + length('-- 0051: 구매자 결제 완료');
--    begin
--      if v_s = 0 or v_e <= v_s then raise exception '0051 paid 줄 없음'; end if;
--      execute substr(v_def, 1, v_s - 1) || '    when ''paid'' then perform notify(new.seller_id, ''tx_paid'', ''tx'', new.id::text, v_d);'
--        || substr(v_def, v_e);
--    end $r$;
-- B) 0041 의 listing_after_tx_cancel 정의를 다시 실행한다.
-- A) FK 는 되살리지 않는다(되살리면 임베드가 다시 모호해진다). 꼭 필요하면 코드 임베드가 전부 관계 이름을 쓰는지
--    tests/postgrest-embeds.db.test.ts 로 확인한 뒤: alter table listings add constraint listings_held_tx_id_fkey foreign key (held_tx_id) references transactions(id);
