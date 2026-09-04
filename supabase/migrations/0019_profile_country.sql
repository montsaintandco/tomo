-- 거주 국가 변경 허용 — 이사·유학 등. 기존 등록 상품(listings.country)은 등록 당시 값 유지, 이후 등록·주문 통화만 바뀐다
grant update (country) on profiles to authenticated;
