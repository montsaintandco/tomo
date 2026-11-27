# 14. 경매 설계 (자체 상품 경매 + 해외 마켓 경매 대행)

- 작성: 2026-11-27. 설계만 했다. 코드와 DB는 바꾸지 않았다.
- 요청(Ren): 「메루카리 경매건도 진행 가능하게 돼 있어? 그리고 직접 올리는 상품에 경매 기능도 추가해줘.」
- 추천 기준: 운영 사고·돈 누락·고객 혼란이 가장 적은 쪽. 작업량은 근거로 쓰지 않았다.
- 기준 코드: `1d55ba9` (마이그레이션 0044 까지). 새 마이그레이션은 0046 부터 쓴다(0045 는 다른 작업 몫으로 비워 둔다).

## 0. 현황 판정 (코드로 확인)

| 대상 | 판정 | 끊기는 지점 | 근거 |
|---|---|---|---|
| 메루카리 경매 상품 | 안 된다. 게다가 경매인지 모른다 | `lib/market/mercari.ts` 가 `auction_info` 를 읽지 않는다. 경매 상품이 정액 상품처럼 보이고 현재가로 장바구니에 담긴다 | `toSearchItem`·상세 변환에 `auction` 칸이 없다. 에어쉽은 `items/get` 에 `include_auction=true` 를 붙여야 `auction_info` 가 온다고 실측했다(`src/lib/mercari-api.server.ts` 351행) |
| 야후옥션 | 안 된다 | `LIVE_SOURCES` 에 없어 검색·상세 새 조회가 막힌다(`lib/market/types.ts` 63~64행, 2026-09-07 중단) | 파서는 남아 있고 입찰형을 `unbuyable: "auction"`(구경만)으로 표시한다 |
| 경매용 대행 경로 | 안 된다 | `request_proxy → quote_proxy → approved → 운영자 「결제 확인」`(0012)에 결제 수단이 없다 | `app/global/[source]/[id]/page.tsx` 에 `ProxyRequestButton auction`(최대 입찰가 입력)이 남아 있으나 `blocked` 판정으로 구매 영역이 닫힌다 |

**지금 있는 사고 위험(B0 로 먼저 막는다):** 메루카리 경매 상품은 차단이 없다. 고객이 현재가로 주문·결제까지 갈 수 있는 것으로 보인다(코드에 막는 곳이 없음, 실결제 시험은 하지 않음). 실제로는 그 값에 살 수 없으므로 결제 뒤 환불이 생긴다.

자체 상품 쪽 현황: `listings.status` 는 `active/reserved/sold/held`, `offers`(0015), `start_transaction`(0035), 예약 45분·결제창 30분(0031, `lib/stripe.ts`), 5분 크론 정리(0042), 가격 잠금 트리거(0039), 실시간은 채팅 `messages` 만(0006), 운영 API capability 목록에 경매가 없다(`lib/ops-bridge.ts`).

---

## A. 자체 상품 경매 (주 범위)

### A-0. 추천 요약

| 항목 | 추천 | 이유(사고 기준) |
|---|---|---|
| 입찰 방식 | 상한가 입찰 한 가지(금액을 넣으면 그 금액이 상한, 시스템이 단위만큼만 올림) | 방식이 둘이면 「왜 내 값보다 싸게 낙찰됐나」 문의가 생긴다. 경로가 하나면 판정도 하나다 |
| 마감 직전 연장 | 마감 5분 안에 현재가가 오르면 마감을 「그 시각 + 5분」으로 | 막판 가로채기 불만을 없앤다. 야후옥션과 같은 규칙이라 설명이 쉽다 |
| 최저 낙찰가 | 넣지 않는다 | 숨은 최저가는 「1등인데 유찰」 혼란을 만든다. 판매자는 시작가를 받고 싶은 최저가로 넣는다 |
| 즉시구매가 | 1차에서 넣지 않는다 | 입찰과 즉시구매가 동시에 들어오는 경합 경로가 하나 더 생긴다. 정액으로 팔 사람은 일반 판매를 쓴다 |
| 결제 기한 | 낙찰 뒤 48시간 | 한·일 생활 시간과 주말을 덮는다. 24시간은 실수 미결제가 늘어난다 |
| 보증금·카드 선승인 | 쓰지 않는다. 경고 누적 + 입찰 자격 제한으로 막는다 | 입찰 단계에서 돈이 전혀 움직이지 않으면 환불·이중 청구 사고가 0건이다(A-3 비교표) |
| 미결제 뒤 | 판매자에게 알리고 「다시 경매」「일반 판매로 전환」 중 고르게 한다. 차순위 자동 제안은 하지 않는다 | 차순위 제안은 자전 입찰(판매자가 값만 올리고 차순위에게 넘김)의 이득 통로다 |
| 데이터 | `auctions` 표를 따로 두고 `listings.sale_type` 한 칸만 추가 | 기존 거래·결제 함수가 읽는 칸을 건드리지 않는다. 상한가는 별도 비공개 표에 둔다 |
| 낙찰 결제 연결 | 낙찰 시 거래를 만들지 않는다. 낙찰자가 「결제하기」를 누를 때 기존 45분 거래를 연다 | `transactions`·Stripe·웹훅 규칙을 그대로 쓴다. 긴 기한은 `auctions.pay_due_at` 한 곳에만 있다 |
| 화면 갱신 | 폴링(5초, 마감 5분 전부터 2초) | 실시간 연결은 모바일에서 조용히 끊긴다. 끊기면 고객은 자기가 1등인 줄 안다 |
| 직거래(만남) | 경매는 택배 거래만 | 만남 거래는 결제가 사이트 밖이라 미결제 판정을 할 수 없다 |
| 수수료 | 낙찰가의 10%(기존과 같음) | 방식별로 다르면 정산 문의가 늘어난다 |

### A-1. 판매자 등록

| 칸 | 규칙 |
|---|---|
| 판매 방식 | 「바로 판매」(기본) / 「경매」. 등록 뒤에는 바꿀 수 없다(입찰 0건일 때 취소 후 다시 등록) |
| 시작가 | 상품 통화. KRW 1,000원 이상·100원 단위, JPY 100엔 이상·10엔 단위. 나눔(0원)은 경매 불가 |
| 기간 | 1·3·5·7일 중 선택 |
| 마감 시각 | 등록 시각 + 기간. 분은 10분 단위로 올림한다. 한국과 일본은 같은 시간대라 한 시각으로 표시한다 |
| 거래 방법 | 택배만(`trade_method = 'shipping'`). 국제 거래 허용 여부는 기존 칸 그대로 |
| 가격 제안 | 자동으로 끈다(`allow_offers = false`) |
| 동시 경매 수 | 판매자당 진행 중 10건(운영 설정값) |

| 상황 | 수정 | 취소 |
|---|---|---|
| 입찰 0건 | 사진·설명·시작가·기간 수정 가능 | 가능(상품은 숨김 상태가 되고 판매자가 다시 등록한다) |
| 입찰 1건 이상 | 불가. 「추가 설명」 덧붙이기만 가능(원문은 그대로, 시각 표시) | 불가. 문의로 요청하면 운영자가 강제 종료한다(입찰자 전원 알림) |
| 마감 뒤 | 불가 | 불가. 낙찰자 결제 또는 미결제 처리로만 끝난다 |

### A-2. 입찰

**방식 비교**

| 안 | 내용 | 사고·혼란 | 판정 |
|---|---|---|---|
| ① 상한가 입찰 한 가지 | 넣은 금액이 상한. 현재가는 「2등 상한 + 입찰 단위」와 「1등 상한」 중 작은 값 | 계산 규칙이 하나. 밤새 지켜볼 필요가 없다 | 추천 |
| ② 단순 입찰만 | 넣은 금액이 곧 현재가 | 막판 경쟁이 심하고 시차 없는 한·일이라도 잠든 사람이 진다. 높게 잘못 넣으면 그대로 낙찰가가 된다 | 비추천 |
| ③ 둘 다 | 입찰 창에서 방식 선택 | 같은 금액을 넣어도 결과가 달라 문의가 생긴다. 판정 경로 2개 | 비추천 |

**입찰 단위표(운영 설정표로 둔다)**

| 현재가(JPY) | 단위 | 현재가(KRW) | 단위 |
|---|---|---|---|
| 1,000엔 미만 | 10엔 | 10,000원 미만 | 100원 |
| 1,000 ~ 4,999엔 | 100엔 | 10,000 ~ 49,999원 | 1,000원 |
| 5,000 ~ 9,999엔 | 250엔 | 50,000 ~ 99,999원 | 2,000원 |
| 10,000 ~ 49,999엔 | 500엔 | 100,000 ~ 499,999원 | 5,000원 |
| 50,000엔 이상 | 1,000엔 | 500,000원 이상 | 10,000원 |

**규칙**

| 규칙 | 내용 |
|---|---|
| 통화 | 입찰은 상품 통화로만 넣는다. 내 통화 금액은 옆에 예상값으로 보인다(「결제 시점 환율로 확정」까지만 쓴다) |
| 예상 총액 | 입찰 창에 「입찰가 + 국제배송비(국경 간일 때 8,000원/900엔) = 예상 결제액」을 보인다. 계산은 기존 거래 합계 함수(`lib/fees.ts`)를 그대로 쓴다 |
| 최소 입찰 | 입찰 0건이면 시작가 이상. 그 뒤는 현재가 + 단위 이상 |
| 같은 금액 | 먼저 넣은 사람이 1등이다 |
| 내가 1등일 때 | 상한을 올리기만 할 수 있다. 현재가는 바뀌지 않고 연장도 없다 |
| 자동 연장 | 마감 5분 안에 현재가가 오르면 마감 = 그 시각 + 5분. 횟수 제한 없음(입찰 단위 때문에 반드시 끝난다) |
| 입찰 취소 | 불가. 확인 창에 「입찰은 취소할 수 없어요」를 넣는다. 현재가의 10배가 넘는 금액은 한 번 더 확인한다 |
| 본인 상품 | 입찰 불가 |
| 차단 | 어느 한쪽이 차단했으면 입찰 불가(0033 차단 표) |
| 정지 회원 | 입찰 불가(`is_suspended()`), 입찰 제한 중인 회원도 불가 |
| 나라 | 구매 자격과 같다. 상품이 국제 거래를 끈 경우 다른 나라 회원은 입찰 불가 |
| 신규 회원 한도 | 완료 거래 0건이면 진행 중 입찰 3건까지(운영 설정값) |
| 입찰자 표시 | 다른 사람에게는 「입찰자 1·2·3」으로만 보인다. 판매자에게도 같다(사이트 밖 직접 연락 방지) |
| 중복 제출 | 화면이 만든 요청 번호로 같은 입찰이 두 번 들어가지 않게 한다 |

### A-3. 낙찰 뒤

**기존 기한과 맞물림**

| 단계 | 기한 | 구현 |
|---|---|---|
| 마감 | 크론 1분 | `auctions.status = awaiting_payment`, `pay_due_at = 마감 + 48시간`, 상품 `reserved`. 거래는 아직 만들지 않는다 |
| 낙찰자 「결제하기」 | `pay_due_at` 전까지 여러 번 가능 | `start_auction_transaction` 이 낙찰가로 거래를 연다. 이 거래는 기존 규칙 그대로다(예약 45분, 결제창 30분) |
| 결제창 만료 | 45분 | 거래만 취소된다. 상품은 낙찰자 앞으로 `reserved` 를 유지한다(`release_stale_reservations` 에 경매 예외 추가) |
| 기한 만료 | `pay_due_at + 45분` | 열려 있던 마지막 결제창이 끝난 뒤에 미결제로 확정한다. `pay_due_at` 뒤에는 새 결제창을 열 수 없다 |
| 결제 완료 | 기존 웹훅 | 거래가 `paid` 가 되면 경매를 `paid` 로 닫는다. 이후는 기존 거래 흐름(주문 번호 TX) |

이 순서면 「기한 직전에 연 결제창으로 늦게 결제 → 예약이 풀린 뒤라 자동 환불」이 생기지 않는다. 기존 30분·45분 관계와 같은 원리다.

**미결제 처리**

| 항목 | 규칙 |
|---|---|
| 알림 | 낙찰 즉시, 기한 24시간 전, 6시간 전, 만료 시 |
| 판매자 선택 | 「다시 경매」(같은 설정으로 한 번에) / 「일반 판매로 전환」 / 「내리기」. 고르기 전까지 상품은 숨김 |
| 차순위 | 자동으로 넘기지 않는다(1차에서 뺌) |
| 제재 | 1회 경고. 90일 안 2회면 30일 입찰 제한. 3회면 입찰 정지(운영자가 풀 수 있음) |
| 이의 | 문의로 받는다. 운영자가 경고를 지울 수 있다(기록 남김) |

**보증금·카드 선승인 비교**

| 안 | 돈이 움직이는 때 | 생길 수 있는 사고 | 판정 |
|---|---|---|---|
| ① 없음 + 경고 누적·입찰 자격 제한 | 낙찰자가 결제할 때만 | 미결제(판매자 시간 손실). 돈 사고는 없다 | 추천 |
| ② 카드 저장 후 낙찰 시 자동 결제 | 낙찰 순간 | 본인 인증 요구로 자동 결제 실패, 「모르는 결제」 이의 제기, 카카오페이·네이버페이 사용자는 저장 불가, 통화·환율 시점 문의 | 비추천 |
| ③ 입찰 때 카드 승인 잡기 | 입찰 순간 | 승인 유효 기간이 경매 기간보다 짧다. 밀린 사람 승인 해제 누락 | 비추천 |
| ④ 보증금 충전 | 입찰 전 | TOMO 에 구매자 잔액이 없어 새 돈 장부가 생긴다. 환불 누락 위험 | 비추천 |

미결제율이 실제로 높게 나오면(예: 낙찰의 10% 초과) 그때 ②를 다시 본다.

### A-4. 데이터 모델

**표**

| 표·칸 | 내용 | 읽기 권한 |
|---|---|---|
| `listings.sale_type` | `'fixed'`(기본) / `'auction'` | 기존과 같음 |
| `auctions` | `id`, `code`(AU+6자리), `listing_id`(유일), `seller_id`, `currency`, `start_price`, `current_price`, `bid_count`, `bidder_count`, `leader_id`, `ends_at`, `original_ends_at`, `extended_count`, `status`, `winner_id`, `final_price`, `pay_due_at`, `closed_at`, `tx_id`, `relist_of`, `created_at` | 누구나(단 `leader_id`·`winner_id` 는 뷰에서 「나인지」만 돌려준다) |
| `auction_bids` | 입찰 기록: `auction_id`, `bidder_id`, `amount`(그 입찰 뒤 현재가), `kind`(직접/자동), `voided_at`, `created_at` | 공개 뷰는 `bidder_id` 대신 순번 표시. 원본은 운영자만 |
| `auction_max_bids` | 상한가: `(auction_id, bidder_id)` 기본 키, `max_amount`, `request_id`, `updated_at` | 본인만. 판매자·다른 입찰자는 못 읽는다 |
| `auction_strikes` | 미결제 경고: `user_id`, `auction_id`, `created_at`, `lifted_at`, `lifted_by` | 본인·운영자 |
| `profiles.bid_banned_until` | 입찰 제한 종료 시각 | 본인·운영자 |
| `auction_settings`(한 행) | 연장 분, 결제 기한, 단위표, 동시 경매 수, 신규 회원 한도 | 누구나 읽기, 운영자만 쓰기 |

`auctions.status`: `live → awaiting_payment → paid`, `live → unsold`(입찰 0건), `awaiting_payment → unpaid`, `live → cancelled`(판매자 무입찰 취소·운영 강제 종료).

현재가의 정본은 `auctions.current_price` 다. 입찰 함수가 같은 값을 `listings.price` 에 함께 쓴다. 그래야 카드·검색 정렬·낙찰 거래 금액이 기존 코드 그대로 맞는다.

**쓰기 경로(전부 함수 경유, 표에 직접 쓰기 권한 없음)**

| 함수 | 하는 일 | 핵심 검사 |
|---|---|---|
| `create_auction` | 상품을 경매로 등록 | 본인 상품, `active`, 택배 거래, 시작가 범위, 진행 중 거래·제안 없음 |
| `place_bid(auction, amount, request_id)` | 입찰 | 아래 동시성 절 |
| `cancel_auction` | 판매자 취소 | 입찰 0건일 때만 |
| `close_due_auctions` | 마감·미결제 만료·알림 | 크론 전용 |
| `start_auction_transaction` | 낙찰 거래 열기 | 호출자 = 낙찰자, `pay_due_at` 전, 진행 중 거래 없음 |
| `relist_auction` / `convert_to_fixed` | 유찰·미결제 뒤 판매자 선택 | 본인, 상태 `unsold/unpaid` |
| `admin_end_auction` / `admin_void_bid` / `admin_lift_strike` | 운영 | 운영자, 사유 필수, 활동 기록 |

**입찰 동시성**

| 항목 | 방법 |
|---|---|
| 직렬화 | `select … from auctions where id = $1 for update`. 한 경매의 입찰은 한 줄로 선다 |
| 마감 판정 | 잠금을 얻은 뒤 `clock_timestamp()` 로 `ends_at` 을 다시 본다. 크론이 아직 안 돌았어도 마감이 지났으면 거절한다 |
| 같은 금액 | 기존 1등 유지(먼저 넣은 사람) |
| 멱등 | `(auction_id, bidder_id, request_id)` 가 이미 있으면 처음 결과를 그대로 돌려준다 |
| 가격 계산 | 새 상한과 기존 1등 상한을 비교해 현재가·1등을 정하고, 기록 표에 직접 입찰 줄과 자동 대응 줄을 남긴다 |
| 연장 | 현재가가 올랐고 남은 시간이 5분 이하면 `ends_at = clock_timestamp() + 5분` |

**마감 처리(pg_cron 1분, DB 함수만, 외부 호출 없음)**

| 단계 | 내용 |
|---|---|
| 대상 | `status = 'live' and ends_at <= now()` 를 `for update skip locked` 로 한 건씩 |
| 낙찰 | 입찰이 있으면 `awaiting_payment`, 상품 `reserved`, 알림(낙찰자·판매자·밀린 입찰자). 없으면 `unsold`, 상품 숨김, 판매자 알림 |
| 미결제 | `awaiting_payment and pay_due_at + 45분 <= now()` 이고 결제된 거래가 없으면 `unpaid`, 경고 기록, 상품 숨김, 양쪽 알림 |
| 알림 예약 | 마감 1시간 전, 결제 기한 24시간·6시간 전. 보낸 표시 칸으로 한 번만 |
| 멱등 | 모든 전이는 `where status = 이전 상태` 조건. 두 번 돌아도 결과가 같다 |
| 기록 | `cron_runs` 에 처리 건수 |

**기존 함수에 넣는 가드**

| 대상 | 바꾸는 것 |
|---|---|
| `start_transaction` | `sale_type = 'auction'` 이면 거절(`auction listing`). 경매 상품은 `start_auction_transaction` 으로만 거래가 열린다 |
| `release_stale_reservations` | 경매가 `awaiting_payment` 인 상품은 예약을 풀지 않는다(거래 취소는 그대로) |
| 가격 잠금 트리거(0039) | 경매 상품의 `price`·`sale_type`·`currency`·`trade_method`·`status` 는 경매 함수만 바꾼다(함수 안 지역 설정값으로 구분). 판매자 직접 수정은 거절 |
| 제안 함수(0015) | 경매 상품은 제안 거절 |
| 끌어올리기 | 경매 상품은 불가 |
| 보류(0041) | 진행 중 경매에는 보류를 걸지 않는다. 운영자는 「강제 종료」를 쓴다(시간이 흐르는 경매를 멈췄다 풀면 공정하지 않다) |

**돈 경계:** 입찰·마감·경고는 돈을 움직이지 않는다. 돈은 낙찰자가 결제창에서 낼 때만 움직이고, 그 뒤 환불·정산은 기존 거래 경로다.

**마이그레이션**

| 번호 | 내용 |
|---|---|
| 0046_auctions.sql | 표·권한·뷰, 등록·입찰·취소·마감 함수, 기존 함수 가드, 크론 1분, 알림 종류 |
| 0047_auction_settle.sql | 낙찰 거래 열기, 미결제 만료·경고·입찰 제한, 재등록·전환, 결제 완료 시 경매 닫기 |
| 0048_auction_ops.sql | 운영 함수(강제 종료·입찰 무효·경고 해제), 의심 표시 뷰, 운영 API 용 조회 |

### A-5. 화면

| 화면 | 내용 |
|---|---|
| 등록 폼(`/sell`) | 판매 방식 선택. 경매를 고르면 가격 칸이 「시작가」로 바뀌고 기간 선택·마감 시각 미리보기가 나온다. 직거래·가격 제안 칸은 숨긴다 |
| 상품 카드 | 「경매」 배지, 현재가(라벨 「현재가」), 입찰 수, 남은 시간. 1시간 이하면 강조색 |
| 상세 | 현재가·입찰 수·카운트다운·마감 시각, 입찰 패널(최소 입찰 금액 미리 채움, 예상 총액, 확인 창), 내 상태(1등/밀림/내 상한), 입찰 기록(순번·금액·시각), 연장 안내 문구 |
| 갱신 | `GET /api/auctions/[id]/state` 폴링. 5초, 마감 5분 전부터 2초, 탭이 가려지면 멈춤. 응답에 서버 시각을 넣어 카운트다운을 서버 기준으로 맞춘다. 입찰 성공 응답으로 즉시 다시 그린다 |
| 마이페이지 | 「입찰 중」(1등/밀림), 「낙찰」(결제하기·남은 기한), 「판매 중 경매」(입찰 수·마감), 「끝난 경매」(유찰·미결제 → 다시 경매/전환) |
| 검색 | 「경매만」 필터, 「마감 임박순」 정렬. 끝난 경매는 목록에서 뺀다 |
| 찜 | 그대로 쓴다. 경매는 값내림 표시를 끄고, 찜한 사람에게 마감 1시간 전 알림을 보낸다 |
| 언어 | 모든 문구 ko/ja. 금액은 상품 통화가 주, 내 통화가 보조 |

**알림 종류**

| 종류 | 받는 사람 | 때 |
|---|---|---|
| `auction_first_bid` | 판매자 | 첫 입찰 |
| `auction_outbid` | 밀린 입찰자 | 1등을 뺏겼을 때(경매당 읽지 않은 알림 1개로 합침) |
| `auction_ending` | 입찰자·찜한 사람 | 마감 1시간 전 |
| `auction_won` | 낙찰자 | 마감(결제 기한 표시) |
| `auction_lost` | 밀린 입찰자 | 마감 |
| `auction_sold` / `auction_unsold` | 판매자 | 마감 |
| `auction_pay_reminder` | 낙찰자 | 기한 24시간·6시간 전 |
| `auction_unpaid` | 낙찰자(경고 안내)·판매자(다음 선택 안내) | 기한 만료 |
| `auction_cancelled` | 입찰자 전원·판매자 | 운영 강제 종료 |
| `auction_bid_voided` | 해당 입찰자 | 입찰 무효 |

### A-6. 운영

| 항목 | 내용 |
|---|---|
| 어드민 `/admin/auctions` | 목록(진행·결제 대기·미결제·유찰·취소), 상세(입찰 기록 원본·상한가는 마감 뒤에만 표시), 강제 종료, 입찰 무효(현재가 다시 계산), 미결제 수동 확정·경고 해제 |
| 운영 API | `OPS_CAPABILITIES` 에 `"auction"` 추가. `GET /api/ops/auctions`, `POST /api/ops/auctions/:id/end`, `POST /api/ops/auctions/:id/void-bid`, `POST /api/ops/auctions/strikes/:id/lift` |
| 할 일 목록 | `auction.pay_due`(낙찰 결제 기한 12시간 이하), `auction.unpaid`(미결제 뒤 판매자 미선택), `auction.flagged`(의심) |
| 이벤트 | `auction.ended`, `auction.unpaid`, `auction.flagged` 를 에어쉽 훅으로 보낸다(기존 `OPS_EVENT_TYPES` 에 추가) |
| 에어쉽 연결 사이트 화면 | capability 가 오면 「경매」 탭이 보인다(에어쉽 쪽 표시만, 별도 트랙) |
| 활동 기록 | 운영 조치는 전부 기존 활동 기록에 사유와 함께 남긴다 |

**자전 입찰 최소 장치(표시만, 자동 제재 없음)**

| 신호 | 판정 |
|---|---|
| 판매자와 입찰자의 연락처·배송지·출금 계좌가 같다 | 의심 표시 |
| 같은 판매자의 경매 3건 이상에 입찰하고 낙찰·결제가 0건 | 의심 표시 |
| 미결제 뒤 같은 판매자가 다시 경매를 올렸고 같은 입찰자가 또 값을 올림 | 의심 표시 |
| 가입 7일 미만 계정이 2등으로 값을 올린 비중이 높다 | 의심 표시 |

차순위 자동 제안을 넣지 않은 것이 가장 큰 방어다. 값만 올려 놓고 빠지는 이득이 없다.

### A-7. 기존 기능과의 충돌

| 기능 | 처리 |
|---|---|
| 가격 제안(offers) | 경매 상품은 끈다. 등록 시 진행 중 제안이 있으면 경매 등록을 거절한다 |
| 찜 | 유지. 값내림 표시만 끈다 |
| 가격 잠금(0039) | 경매 함수만 값을 바꾸게 가드를 넓힌다 |
| 보류(0041·0044) | 진행 중 경매는 보류 대신 강제 종료. 결제 뒤 거래 보류는 기존 그대로 |
| 직거래(만남) | 경매 불가 |
| 국제(센터 경유) 거래 | 낙찰 거래를 열 때 기존과 같은 판정·같은 배송비 표(8,000원/900엔)를 쓴다 |
| 수수료 | `floor(낙찰가 × 0.10)` 그대로 |
| 여행·교차 등록(0021) | 경매 상품은 대상에서 뺀다 |
| 회원 정지 | 정지되면 진행 중 경매는 운영 강제 종료, 넣어 둔 입찰은 무효 처리(운영자 확인 뒤) |
| 분쟁·환불·출금 | 결제 뒤는 일반 거래와 같다 |

---

## B. 해외 마켓 경매 대행 (메루카리 경매·야후옥션)

### B-1. 되게 하려면 필요한 것

| 조각 | 지금 | 필요한 것 |
|---|---|---|
| 상품 인식 | 메루카리 없음, 야후는 「구경만」 | 메루카리 `include_auction=true` 로 `auction_info` 읽기, 마감 시각·현재가·입찰 수 표시 |
| 입찰 상한 신청 | 화면 조각만 남음 | 상한가·마감 시각을 담는 신청 표, 중복 신청 방지 |
| 선결제·보증금 | 없음(TOMO 에 구매자 잔액 없음) | 상한 기준 선결제 또는 보증금, 유찰·밀림 시 전액 환불 경로 |
| 실제 입찰 | 없음 | 에어쉽 워커(Windows PC, 로그인된 브라우저)가 TOMO 큐를 읽거나, 운영자가 손으로 입찰 |
| 낙찰 뒤 | 없음 | 낙찰가로 대행 주문 전환, 차액 정산, 판매자 결제·입고 |
| 마감 감시 | 없음 | 밀림·낙찰·취소 판정, 고객 알림 |

### B-2. 대안 비교

| 안 | 내용 | 사고 위험 | 판정 |
|---|---|---|---|
| ① TOMO 에서 직접 구현 | 위 6조각을 TOMO 에 만든다 | 입찰 전에 돈을 받고 밀리면 돌려줘야 한다. 환불 누락·이중 청구·낙찰가 차액 문의가 모두 새로 생긴다. 워커 한 대가 두 사이트 일을 하면 한쪽 장애가 다른 쪽 입찰을 놓친다 | 비추천 |
| ② 에어쉽 입찰 대행으로 안내·연결 | 경매 상품 상세에서 에어쉽 해당 상품으로 보내는 링크 | 돈 사고는 없다. 다만 계정·결제·수수료가 다른 사이트라 고객이 헷갈린다. 에어쉽 메루카리 입찰기의 운영 검증 상태는 이번에 확인하지 못했다 | 조건부(에어쉽 쪽 검증 뒤) |
| ③ 「경매 상품은 지원 안 함」 명확 표시 | 메루카리 경매를 인식해 야후와 같은 「구경만」으로 막는다 | 지금 열려 있는 「현재가로 결제 → 환불」 구멍을 닫는다. 새 돈 경로가 없다 | 추천 |

### B-3. 추천

**③을 먼저 한다(트랙 B0).** 지금은 메루카리 경매 상품이 일반 상품처럼 결제까지 갈 수 있어 보이므로, 지원 여부를 떠나 이 차단이 가장 급하다. ②는 Ren 이 원하면 그다음에 붙인다(에어쉽 메루카리 입찰기가 운영에서 검증된 뒤, 한국 구매자에게만). ①은 하지 않는다. 야후옥션은 `LIVE_SOURCES` 중단 상태를 그대로 둔다.

---

## C. 구현 트랙

순서: B0 → U1 → U2 → U3 → U4 → U5 → U6. 각 트랙은 standard 에이전트 한 세션 크기다. 경매 화면은 환경 변수 `NEXT_PUBLIC_AUCTION=1` 일 때만 보인다. U6 리허설이 끝나기 전에는 운영에서 끈 채로 둔다.

| 트랙 | 내용 | 소유 파일 | DB | 완료 기준 | 되돌리기 |
|---|---|---|---|---|---|
| B0 메루카리 경매 차단 | `auction_info` 인식 → `auction: true` + `unbuyable: "auction"`. 결제 직전 재확인에서도 거절 | `lib/market/mercari.ts`, `lib/price-check.ts`, `lib/i18n*.ts` | 없음 | 실제 메루카리 경매 상품 1건이 「입찰중·구경만」으로 보이고 장바구니·주문 API 가 거절한다. 일반 상품 3건은 그대로 담긴다 | 커밋 revert |
| U1 경매 DB 핵심 | 표·권한·등록·입찰·취소·마감·가드·크론·알림 종류 | `supabase/migrations/0046_auctions.sql` | 0046 | 롤백 블록 안에서 시나리오 통과: 동률 선착, 상한 비공개(다른 계정 조회 0행), 연장, 마감 멱등(두 번 실행 결과 같음), `start_transaction` 거절 | 파일 끝 되돌리기 SQL(크론 해제 → 함수·표 삭제 → 가드 원복) |
| U2 낙찰 결제·미결제 | 낙찰 거래 열기, 기한 만료, 경고·입찰 제한, 재등록·전환, 결제 완료 시 경매 닫기 | `supabase/migrations/0047_auction_settle.sql`, `app/api/checkout/route.ts`(경매 거래 기한 검사), `app/api/auctions/[id]/pay/route.ts` | 0047 | 낙찰 → 결제창 45분 만료 뒤에도 상품이 낙찰자 앞으로 유지된다. `pay_due_at` 뒤 새 결제창 거절. 만료 시 경고 1건. 결제 시 TX 번호 발급 | 0047 되돌리기 SQL, 코드 revert |
| U3 등록·상세·카드 | 등록 폼, 카드 배지, 상세 입찰 패널·기록·카운트다운, 상태 API 폴링 | `app/sell/*`, `app/listings/[id]/*`, `components/auction/*`, `components/ListingCard*`, `app/api/auctions/*`, `lib/auction.ts`, `lib/i18n-port/auction.ts` | 없음 | 두 브라우저에서 입찰하면 5초 안에 서로 반영된다. ko/ja 문구 누락 0. 플래그 끄면 흔적 없음 | 플래그 끄기 → revert |
| U4 마이페이지·검색·알림 | 입찰 중·낙찰·판매 중 경매 탭, 경매만 필터·마감 임박순, 알림 문구 ko/ja | `app/mypage/*`, `app/listings/page*`(검색), `lib/notifications*` | 없음 | 알림 10종이 각각 한 번씩만 온다. 끝난 경매가 검색에 안 나온다 | 플래그 끄기 → revert |
| U5 운영 | `/admin/auctions`, 운영 함수, 운영 API capability·할 일·이벤트, 의심 표시 | `app/admin/auctions/*`, `lib/ops-api.ts`, `lib/ops-bridge.ts`, `supabase/migrations/0048_auction_ops.sql`, `docs/aaa/12-*.md` 9장 추가 | 0048 | 강제 종료·입찰 무효·경고 해제가 활동 기록에 남는다. `/api/ops` 능력 목록에 `auction` 이 나온다. 에어쉽 화면 표시는 에어쉽 저장소 별도 작업 | 0048 되돌리기 SQL, revert |
| U6 리허설·켜기 | 아래 시험을 운영에서 시험 계정으로 완주, 결과 기록, 플래그 켜기 | `docs/aaa/14-auction.md` 부록 | 없음 | 아래 시험표 전부 통과, 시험 데이터 정리 확인 | 플래그 끄기 |

**시험 방법(시험 계정 alice = 한국 판매자, bob = 일본 구매자, 세 번째 입찰자로 운영 시험 계정 1개)**

| 번호 | 절차 | 기대 결과 |
|---|---|---|
| 1 | alice 가 시작가 10,000원·1일 경매를 등록한다 | 카드에 「경매」, 제안 버튼 없음, 바로구매 불가 |
| 2 | alice 가 자기 경매에 입찰한다 | 거절 |
| 3 | bob 이 상한 30,000원으로 입찰한다 | 현재가 10,000원, bob 1등, 엔 예상 총액(국제배송비 포함) 표시 |
| 4 | 세 번째 계정이 20,000원으로 입찰한다 | 현재가 21,000원, bob 1등 유지, 세 번째 계정에 밀림 알림 |
| 5 | 세 번째 계정이 30,000원으로 입찰한다 | 현재가 30,000원, bob 1등(먼저 넣음) |
| 6 | 다른 계정으로 bob 의 상한가를 조회한다 | 0행 |
| 7 | 운영 SQL 로 `ends_at` 을 3분 뒤로 당긴 뒤 세 번째 계정이 31,000원을 넣는다 | 마감이 입찰 시각 + 5분으로 연장 |
| 8 | 마감을 기다린다 | 1분 안에 `awaiting_payment`, 낙찰·판매 알림, 상품 `reserved` |
| 9 | 낙찰자가 결제창을 열고 닫은 뒤 45분을 넘긴다(시험은 운영 SQL 로 시각 조정) | 거래만 취소, 상품은 낙찰자 앞으로 유지, 다시 결제하기 가능 |
| 10 | 낙찰자가 결제한다 | 기존 결제 시험 절차(`docs/aaa/pay-checklist.md`)대로. TX 번호 발급, 경매 `paid` |
| 11 | 다른 경매로 8번까지 반복하고 결제하지 않는다(`pay_due_at` 을 SQL 로 당김) | `unpaid`, 낙찰자 경고 1건, 판매자에게 다시 경매/전환 선택 |
| 12 | alice 가 「다시 경매」를 누른다 | 같은 설정의 새 경매, `relist_of` 연결 |
| 13 | 입찰 0건 경매를 마감시킨다 | `unsold`, 판매자 알림 |
| 14 | 운영자가 진행 중 경매를 강제 종료하고 입찰 1건을 무효 처리한다 | 입찰자 알림, 활동 기록 |

실제 카드 결제가 필요한 10번은 Ren 승인 뒤에 한다. 시각을 당기는 것은 시험 경매 행에만 운영 SQL 로 하고, 시험 전용 코드는 넣지 않는다.

---

## D. Ren 이 정할 것 (기본값 = 추천)

| 번호 | 정할 것 | 기본값 | 다른 선택지 |
|---|---|---|---|
| 1 | 입찰 방식 | 상한가 입찰 한 가지 | 단순 입찰만 / 둘 다 |
| 2 | 마감 직전 연장 | 5분 안 입찰 시 5분 연장 | 3분 / 10분 / 연장 없음 |
| 3 | 낙찰 뒤 결제 기한 | 48시간 | 24시간 / 72시간 |
| 4 | 미결제 제재 | 1회 경고, 90일 안 2회 → 30일 입찰 제한, 3회 → 입찰 정지 | 1회부터 제한 / 제재 없음 |
| 5 | 최저 낙찰가 | 없음(시작가가 최저가) | 숨은 최저 낙찰가 추가 |
| 6 | 즉시구매가 | 1차에서 없음 | 첫 입찰 전까지만 즉시구매 가능 |
| 7 | 경매 수수료 | 낙찰가의 10%(지금과 같음) | 경매만 다른 요율 |
| 8 | 보증금·카드 선승인 | 쓰지 않음 | 카드 저장 후 낙찰 시 자동 결제 |
| 9 | 미결제 뒤 처리 | 판매자가 다시 경매/일반 판매 전환 선택 | 차순위에게 자동 제안 |
| 10 | 해외 마켓 경매(메루카리·야후) | 「지원 안 함」 표시로 막기(B0) | 에어쉽 입찰 대행으로 연결 / TOMO 에서 직접 구현 |

---

## 부록. B0 구현 기록 (2026-11-27)

- 실측: 검색 v2 는 `withAuction: true` 를 넣어야 `auction` 칸이 온다(없으면 경매도 null). 상세 items/get 은 `include_auction=true` 를 붙여야 `auction_info` 가 온다. 입찰 0건 경매도 검색 `auction.id`·`bidDeadline`, 상세 `state: STATE_NO_BID` 로 잡힌다.
- 표시: 경매 = `auction: true` + `unbuyable: "auction"`. 야후옥션과 같은 문구 「경매 상품은 지금 지원하지 않아요 (구경만)」, 카드 배지 「경매 · 구경만」.
- 서버: 담기·대행 신청 409(`pay.err.auction`), 결제 직전 재확인 `auction` 으로 거부. DB 변경 없음(external_items 칸 추가 안 함).
---

## 부록. U1·U2 구현 기록 (2026-11-27)

- 마이그레이션: `0046_auctions.sql`(U1)·`0047_auction_settle.sql`(U2). 운영 DB 에 적용했다(적용 전 두 번호 객체가 없음을 카탈로그로 확인, 0045 는 비워 둠). 크론 `tomo_auctions` 1분 → `cron_auctions()`, 결과는 `cron_runs(job='auctions')`.
- 기능 플래그 `NEXT_PUBLIC_AUCTION=1` 일 때만 경매 API 가 열린다. 없으면 `/api/auctions/**` 와 `/api/checkout {auctionId}` 는 404 `auction.err.off`. **운영 env 에는 아직 넣지 않았다.** DB 함수는 플래그와 상관없이 있다(RPC 직접 호출은 RLS·함수 검사로 막힌다).
- 설계에서 바꾸거나 정한 것:
  - 「3회 입찰 정지」는 해제 안 된 경고 **통산** 3회로 판정한다(90일 2회 → 30일 제한은 설계대로). 정지는 `profiles.bid_banned_until = 'infinity'`, 운영자가 지운다(U5 `admin_lift_strike`).
  - 첫 입찰도 마감 5분 안이면 연장한다(입찰 0건 → 1건도 「현재가가 생김」으로 본다).
  - `auctions.listing_id` 는 유일이 아니라 「열린 경매(live·awaiting_payment) 하나」 부분 유일 색인이다. 다시 경매는 같은 상품에 새 행(`relist_of`)이다.
  - 판매자 취소·유찰·미결제 뒤 상품은 `hidden = true`. 상품의 `sale_type` 은 `auction` 그대로이고, 다시 경매(`relist_auction`)·새 설정 경매(`create_auction` 을 같은 상품에 다시)·일반 전환(`convert_to_fixed`) 중 하나로 연다.
  - 결제 뒤 운영 환불로 상품이 판매중으로 돌아온 경매(`paid` + 상품 `active`)도 다시 경매·전환 대상이다.
  - 낙찰자·판매자가 결제 대기 거래를 취소해도(`advance_transaction → cancelled`) 상품은 낙찰자 앞으로 `reserved` 로 남는다(잠금 트리거가 되돌림).

### 서버 경로(화면 작업자용)

| 메서드·경로 | 요청 | 응답(성공) | 비고 |
|---|---|---|---|
| `POST /api/auctions` | `{ listingId, startPrice, days }` | 201 `{ auction }`(auctions 행) | 상품을 먼저 일반 insert(`hidden: true` 권장) → 이 API 가 경매로 바꾸고 공개한다. `trade_method=shipping`, `allow_offers=false`, `price=시작가` 로 바뀐다 |
| `GET /api/auctions/[id]/state` | id = 경매 id 또는 상품 id | `{ state: AuctionState }` | 로그인 없이도 공개 정보. `cache-control: no-store`. 간격은 `pollMs(state)`(5초, 마감 5분 전 2초, 끝나면 null). 카운트다운은 `state.server_now` 기준 |
| `POST /api/auctions/[id]/bid` | `{ amount, requestId }` | `{ result: BidResult, state }` | amount = 내 상한가(상품 통화). requestId 는 입찰 창마다 새로(같은 번호 재전송 = 처음 결과, `result.replayed`) |
| `POST /api/auctions/[id]/cancel` | 없음 | `{ auction }` | 판매자, 입찰 0건만 |
| `POST /api/auctions/[id]/pay` | 없음 | `{ url, transactionId }` | 낙찰자 「결제하기」. `/api/checkout` 에 `auctionId` 로 넘긴다(결제창 재사용·10분 규칙·금액 대조 그대로). 결과 거래는 일반 거래와 같다(`/transactions/[id]`, TX 번호) |
| `POST /api/auctions/[id]/relist` | 없음 | 201 `{ auction }` | 판매자, 같은 시작가·기간 |
| `POST /api/auctions/[id]/convert` | `{ price }` | `{ listing }` | 판매자, 일반 판매로 |
| `GET /api/auctions/mine` | 없음 | `{ items: [...] }` | 마이페이지 「입찰 중·낙찰」(`my_auction_bids`: my_max·leading·won·title·image 포함) |

오류는 모두 `{ error, code }`(code = i18n 키 `auction.err.*`, `lib/auction.ts auctionErrorKey`). 401 로그인, 404 없음·플래그 꺼짐, 409 마감·금액 미달·이미 열림·입찰 있음·기한 지남, 429 요청 과다(입찰 30회/분).

`AuctionState`(`lib/auction.ts` 타입): `id, code, listing_id, status(live|awaiting_payment|paid|unsold|unpaid|cancelled), currency, start_price, current_price, bid_count, bidder_count, ends_at, original_ends_at, extended_count, closed_at, pay_due_at, final_price, duration_days, relist_of, min_bid, server_now, extend_minutes, viewer{ signed_in, is_seller, bidder_no, my_max, leading, won, can_pay, tx_id, bid_banned_until }, bids[{ no, amount, kind(direct|auto), at, me }](최근 20)`.

### 화면 작업자(U3·U4)가 알아야 할 것

1. 경매 상품 판정은 `listings.sale_type = 'auction'`. 목록·카드 조회에 이 칸을 넣는다. 현재가는 `listings.price` 에도 같이 들어간다(정본은 `auctions.current_price`).
2. 공개 칸만 읽힌다: `auctions` 의 `leader_id·winner_id·tx_id` 는 열 권한이 없다. `select *` 를 쓰면 권한 오류가 난다. 1등·낙찰 여부는 `state.viewer` 로만 본다.
3. 다른 사람의 상한가는 어떤 경로로도 안 보인다(`auction_max_bids` 는 본인 행만). 입찰자는 순번(`no`)으로만 표시한다.
4. 경매 상품에서 막히는 것: 바로구매(`start_transaction` → `auction listing`, 체크아웃은 `auction.err.useAuction` 409), 가격 제안 insert(RLS), 끌어올리기, 판매자의 가격·통화·거래 방법·제안 허용 수정(`auction listing locked` → `auction.err.locked`), 진행 중 상태 변경·숨기기·삭제. 기존 상품 수정 폼(`PATCH /api/listings/[id]`)은 경매 상품이면 이 칸들을 보내지 않거나 잠가야 한다.
5. 입찰 창: 최소 금액 `state.min_bid`(1등이면 `my_max` 보다 큰 값), 단위 `AUCTION_RULES.unit`, 예상 결제액 `estimatedTotal(cur, amount, 국경 간)`, 현재가의 10배 초과 재확인은 화면 몫. 미리보기 계산이 필요하면 `proxyBid()`(DB 와 같은 규칙).
6. 결제 기한: 낙찰 = 마감 + 48시간(`pay_due_at`). `viewer.can_pay` 가 참일 때만 「결제하기」. 기한 직전에 연 결제창은 45분까지 유효하고, 미결제 확정은 `pay_due_at + 45분` 뒤 크론이 한다.
7. 알림 kind 10종(`notif.auction_*`, `lib/i18n-port/auction.ts`): first_bid·outbid·ending·won·lost·sold·unsold·pay_reminder·unpaid·unpaid_seller. 링크는 `data.listing_id` 상품 상세. 밀림 알림은 경매당 읽지 않은 것 하나로 합친다. 운영 강제 종료·입찰 무효 알림(`auction_cancelled`·`auction_bid_voided`)은 U5 몫이라 아직 없다.
8. 등록 제한: 시작가 KRW 1,000원 이상·100원 단위 / JPY 100엔 이상·10엔 단위, 기간 1·3·5·7일, 마감은 10분 단위 올림(`endsAt()`), 판매자당 진행 중 10건, 답하지 않은 가격 제안이 있으면 거절. 입찰 0건 경매의 시작가·기간 수정 함수는 없다(취소 → 다시 `create_auction`).
9. 입찰 제한: 첫 거래 완료 전 회원은 진행 중 경매 3건까지, 미결제 경고 누적 시 `viewer.bid_banned_until`.
10. 남은 트랙: U5(운영 함수·`/admin/auctions`·ops capability·outbox 이벤트·진행 중 경매 보류 차단), U6(운영 리허설 14항목·플래그 켜기).

### 검증 기록

| 항목 | 결과 |
|---|---|
| 롤백 리허설(운영 DB, `begin` + 0046 + 0047 + 시험 블록 + 끝에서 예외) | 49개 단언 전부 통과(등록·본인 입찰 거절·대리 입찰 상회·같은 금액 선착·상한 비공개·열 권한·경매 제안 거절·5분 연장·재역전·요청 번호 멱등·최소 단위·마감 뒤 입찰 거절·낙찰·마감 멱등·알림 6건·다른 사람 start_transaction 거절·결제 시작 거래(32,000원+국제배송비 8,000원·수수료 3,200원·TX 번호)·45분 만료 뒤 예약 유지·재결제·mark_tx_paid 로 경매 paid·기한 뒤 결제 거절·미결제 48시간 판정·경고·재경매·2회 → 30일 제한·일반 전환·취소 규칙·기존 경로 가드 5종·상태 조회·크론 기록) |
| 결함 주입 3종(같은 금액 `>`→`>=`, start_transaction 경매 검사 제거, 예약 유지 가드 제거) | 각각 5·11a·13 번 단언이 실패함을 확인 |
| 잔여 | 리허설 뒤 경매 표·함수·칸·크론 0, 시험 상품·알림 0 |
| 동시 입찰(운영, 적용 뒤) | ① 관리 API 연결 2개: A 가 입찰 뒤 3초 잠금 유지, B 는 `Lock/transactionid` 대기(pg_stat_activity 실측) → A 끝난 직후 처리, 결과 일관(현재가 20,000·기록 3줄·먼저 온 bob 1등). ② `tests/auction.db.test.ts`(PostgREST 연결 2개, 같은 금액 동시 3회 + 10건 동시) 통과. 시험 데이터는 지웠다(잔여 0) |
## 부록. U3·U4 구현 기록 (2026-11-27)

- 플래그: 화면은 빌드 때 `NEXT_PUBLIC_AUCTION=1` 일 때만. 꺼져 있으면 목록 조회에 경매 칸도 붙이지 않는다(`auctionSelect()` 빈 글자 — U1 되돌리기 뒤에도 목록이 깨지지 않게). 운영 Actions Variables 에는 아직 넣지 않았다.
- 등록 순서: `POST /api/listings` 에 `saleType: "auction"` → 숨긴 일반 상품(택배·제안 끔, IndexNow 안 보냄) → `POST /api/auctions` 가 경매로 바꾸고 공개. 2단계가 실패하면 화면이 숨긴 상품을 지운다. 시작가는 화면에서 `amountOk(cur, n, true)` 로 먼저 검사.
- 수정 잠금: 경매 상품(`sale_type=auction`) 수정 폼은 가격·거래 방법·제안·국제 거래 칸을 잠그고, `PATCH /api/listings/[id]` 도 그 칸들을 보낸 값 대신 무시한다(제목·설명·사진·상태·카테고리·배송 부담·발송일만 바뀜). 시작가·기간 변경은 취소 뒤 다시 등록.
- 카드: `listings` 조회에 `sale_type, auctions(status, bid_count, ends_at, created_at)` 를 붙이고 `pickAuction`(열린 경매 우선, 없으면 최신)으로 고른다. 남은 시간은 서버 렌더 시각 기준 정적 표시.
- 상세 패널: 폴링은 상품 id 로 `/state` 를 부른다(다시 경매 뒤 새 경매를 따라감). 마운트 직후 한 번 새로 받아 시계 차이를 맞춘다. 화면 읽기 프로그램 알림(aria-live polite)은 현재가가 바뀌거나 끝났을 때만. 카운트다운은 `role=timer`·`aria-live=off`. 시각 표시는 `Asia/Seoul` 고정(서버·브라우저 렌더 일치).
- 입찰 창: 1등이면 최소값 = 내 상한 + 단위(100원/10엔), 아니면 `min_bid`. 예상 최대 결제액 = `directDetailTotal(상한, 통화, 국경 간)`. 다른 통화는 「약」 + 결제 시점 환율 확정 문구(가산 수치 없음). 요청 번호는 확인 단계에 들어갈 때 새로 만들고, 같은 확인 단계의 재시도는 같은 번호.
- 마이페이지: `/mypage/auctions` 입찰 중(live)·낙찰(won, 결제 필요 강조)·내 경매(같은 상품은 최신 경매 한 줄). 배지·할 일 = `payNeededCount` + `sellerChoiceCount`(유찰·미결제 뒤 아직 고르지 않은 것).
- 알림 10종 문구·링크는 U1·U2 에서 이미 있었다(`notif.auction_*`, 링크 = 상품 상세). U4 에서 바꾸지 않았다.
- 검증: tsc·eslint(오류 0)·vitest unit 44파일 319건(표시 계산 11건 추가)·next build(플래그 켬/끔 둘 다). 로컬(build+start, 플래그 켬, 운영 DB): alice 등록 → bob API 입찰 → alice 화면 3초 안 갱신 → bob 화면 상한 올리기(확인 단계) → center 20,000원 입찰 → bob 화면 다음 폴링 차례(5초 안)에 21,000원·자동 줄 표시 → 경매만 목록 → bob 마이페이지. 시험 행은 service role 로 지움(잔여 0).
- 못 본 것: 낙찰 뒤 결제하기·판매자 다시 경매/전환·수정 폼 잠금은 브라우저로 돌려 보지 않았다(U6 리허설 8~12번에서 본다).

## 부록. U5 구현 기록 (2026-11-27)

- 마이그레이션 `0048_auction_ops.sql` 운영 적용(적용 전 카탈로그로 0048 객체 없음 확인 → 롤백 리허설 10묶음 통과·결함 주입 4종이 해당 단언에서 실패 확인 → 적용 → 함수 13개·표 2개·트리거 3개·제약 확인). 0046·0047 함수(place_bid·마감·미결제)는 바꾸지 않았다.
- 운영 함수(운영자 세션, `is_admin_user()` = 정지 운영자 거절, 메모 필수, `admin_actions` 기록):
  - `admin_close_auction(경매, 메모)` — 진행 중(live)만. `cancelled` + 상품 숨김(판매자가 다시 경매·일반 전환 가능, `auction_relistable` 의 cancelled), 입찰자 전원·판매자 알림 `auction_cancelled`, 이벤트 `auction.cancelled`. 결제 대기(awaiting_payment) 경매는 이 함수로 못 끝낸다(열린 결제창과 엇갈림 방지). 그 경우는 기한 만료(미결제)로 끝난다.
  - `admin_void_bid(경매, 입찰자, 메모)` — 진행 중만. 그 입찰자의 기록 줄 전부 `voided_at`, 상한 행 삭제(값은 `auction_bid_voids` 에 남김), 요청 번호 기록 삭제, `auction_recalc` 로 1등·현재가(min(1등 상한, 2등 상한 + 단위), 1명 이하면 시작가)·`bid_count`·`bidder_count`·`listings.price` 다시 계산. 새 현재가보다 높은 남은 기록(빠진 사람이 밀어 올린 자동 대응)도 무효로 돌리고 마지막 줄이 새 상태와 다르면 자동 줄 하나를 더한다. 같은 상한이면 그 금액을 먼저 넣은 사람(`updated_at`)이 1등. 무효된 사람은 그 경매에 다시 입찰할 수 없다(`bid voided` → `auction.err.voided`). 알림 `auction_bid_voided`. 마감 시각은 그대로.
  - `admin_clear_strike(경고, 메모)` — 해제 뒤 남은 경고로 제한을 다시 정한다: 통산 3회 이상이면 그대로, 90일 안 2회면 min(지금 제한, 마지막 경고 + 30일), 그 밖은 풀림.
- 조회 함수(운영자 또는 service_role): `admin_auctions(tab, q, limit, offset)`(tab = live·awaiting·unpaid·ended·flagged·all, q = AU 번호·제목), `admin_auction_detail(id)`(입찰 기록 원본·입찰자 닉네임은 보임, **상한은 live 가 아닐 때만** `max_visible`), `auction_ops_counts()`(live·awaiting·pay_due_soon(12시간)·pay_overdue(기한 + 50분)·live_overdue(마감 + 5분)·seller_choice(미결제 뒤 판매자 미선택)·seller_choice_old(기한 + 3일)·flagged).
- 의심 표시(표시만): 상한을 넣거나 올릴 때 `auction_flags` 에 신호를 쌓는다. `same_contact`(배송지 전화 숫자 8자리 이상 같음·우편번호+주소 같음·출금 계좌 같음) / `repeat_no_win`(같은 판매자 경매 3건 이상 입찰, 낙찰 결제 0) / `relist_rebid`(미결제 뒤 다시 올린 경매에 앞 경매 입찰자) / `new_account_pusher`(가입 7일 미만이 1등 아닌 채 상한을 넣음). IP·기기는 DB 에 없어 안 쓴다. 처음 표시될 때만 이벤트 `auction.flagged`(dedupe 경매+입찰자). 계산 오류는 입찰을 막지 않는다(경고만).
- 이벤트(ops_outbox 제약 13종): `auction.ended`(live → awaiting_payment, 낙찰가), `auction.unpaid`(awaiting_payment → unpaid), `auction.cancelled`, `auction.flagged`. 유찰은 이벤트 없음.
- 진행 중 경매 보호: `admin_set_listing_hidden(숨김)` → `auction live: use force close`, `admin_set_user(정지)` → 진행 중 경매가 있는 판매자면 `seller has live auctions`(이미 정지된 사람의 운영자 토글은 통과). 어드민 화면은 한국어 안내(`lib/auction-admin.ts adminAuctionError`).
- 화면: `/admin/auctions`(탭·검색·지연 표시·의심 수, `?open=` 상세 시트: 강제 종료·입찰자별 입찰 무효·경고 해제, 입찰 기록 원본, 운영 기록). 메뉴 「경매」 배지 = 의심 + 크론 지연. 대시보드 「처리 대기」 줄에 경매 4종. `NEXT_PUBLIC_AUCTION` 과 상관없이 열린다.
- 운영 API: capability `auction`, 경로 5개(`GET auctions`·`auctions/:id`, `POST auctions/:id/close`·`void_bid`·`clear_strike`, 전부 ops), counts 3줄 추가(`auction.pay_due`·`auction.unpaid`·`auction.flagged`). 설계 A-6 의 경로 이름(`end`·`void-bid`·`strikes/:id/lift`)은 U5 지시대로 바꿨다. 규격은 docs/aaa/12 9.4.

### 검증 기록

| 항목 | 결과 |
|---|---|
| 롤백 리허설(운영 DB, `begin` + 0048 + 시험 블록 + 끝에서 예외) | 10묶음 전부 통과: 제약 13종 / 4명 입찰 준비(현재가 26,000) / 의심 신호 2종·이벤트 1건·오래된 계정 표시 없음 / 비운영자·메모 없음·정지 운영자 거절(무효·종료·조회) / 1등 무효 → 차순위 1등·현재가 21,000·상품 가격·높은 기록 정리·마지막 자동 줄·bid_count·알림·활동 기록·재입찰 거절(새 요청 번호·옛 요청 번호) / 진행 중 상품 숨김·판매자 정지 거절 / 진행 중 상한 숨김·목록·번호 검색·건수·service_role / 강제 종료(알림 3건·숨김·기록·이벤트·두 번째 거절·끝난 경매 무효 거절·마감 뒤 상한 공개) / 낙찰 마감·미결제 이벤트·판매자 선택 대기 / 경고 해제(거절 3종·제한 풀림·입찰 됨·두 번째 거절·3회→2회 30일) |
| 결함 주입 4종 | 2등 단위 빼기 → 4번, 진행 중 상한 노출 → 6a, 재입찰 가드 제거 → 4k, 정지 운영자 통과 → 9d 실패 확인 |
| 잔여 | 리허설 뒤 0048 객체 0, 시험 계정(u5.rehearsal) 0, 경매 0 |

### U6(리허설·켜기)가 알아야 할 것

1. 시험표 14번(강제 종료·입찰 무효)은 `/admin/auctions?open=<경매 id>` 상세 시트 버튼 또는 운영 API(`POST /api/ops/auctions/:id/close|void_bid`, 본문 `request_id`·`expected_status: "live"`·`note`, void 는 `bidder_id`)로 한다. 활동 기록 `auction_close`·`auction_void_bid`, 알림 `auction_cancelled`(입찰자 전원·판매자)·`auction_bid_voided`.
2. 시험 계정이 `tomo.test.center`(운영자)뿐이라 「세 번째 입찰자」도 center 를 쓰면 의심 표시는 안 생긴다(가입 7일 넘음). 의심 표시를 운영에서 보려면 같은 전화번호 배송지를 시험 계정끼리 넣어야 한다(시험 뒤 지울 것).
3. 시험 경매를 정리할 때 `auction_flags`·`auction_bid_voids`·`ops_outbox`(type `auction.%`, 에어쉽 훅으로 이미 나갔을 수 있음 → 에어쉽 `connected_site_events` 도)·`admin_actions`(target_type `auction`) 를 같이 지운다.
4. 강제 종료된 상품은 숨김 상태다. 시험 뒤 판매자 화면에서 다시 경매/전환이 되는지(cancelled 도 대상)도 보면 좋다.
5. 진행 중 경매 상품은 어드민 상품 숨김·판매자 정지가 거절된다. 시험 순서에서 alice 정지를 쓰면 먼저 강제 종료해야 한다.
