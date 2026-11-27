# 15. 해외 마켓 경매 입찰 대행 (메루카리 경매·야후옥션)

- 작성: 2026-11-27. 설계만 했다. 코드와 DB는 바꾸지 않았다.
- Ren 결정(2026-11-27): 설계 14번 B절의 ①안 「tomo 에서 직접 입찰 대행」으로 한다. 이 문서는 ①을 가장 안전하게 만드는 설계다.
- 추천 기준: 운영 사고·돈 누락·고객 혼란이 가장 적은 쪽. 작업량은 근거로 쓰지 않았다.
- 기준 코드: tomo `1d55ba9`(마이그레이션 0044 까지), 에어쉽 `origin/migrate-vercel`(`20261127180000_bid_limit` 까지).
- 마이그레이션 번호: 자체 경매(14번 A절)가 0046~0048 을 쓴다. 이 문서는 0049 부터 쓴다.
- 이름: 이 문서에서 「입찰 신청」은 고객이 tomo 에 낸 한 건(표 `market_bids`)이다. 「입찰」은 우리 계정이 마켓에 실제로 넣은 것이다. 「승인」은 카드 사전 승인(돈이 아직 안 빠진 상태)이다. 「매입」은 승인 금액을 실제로 청구하는 것(Stripe capture)이다.

## 0. 추천 구조 요약

| 항목 | 추천 | 이유(사고 기준) |
|---|---|---|
| 돈 받는 방식 | 카드 사전 승인. 승인액 = 상한가 기준 예상 총액. 낙찰되면 실제 금액만 매입, 그 밖은 승인 취소 | 유찰·밀림 때 돈이 움직이지 않는다. 환불 누락·환불 대기 문의가 없다. 낙찰 때는 돈이 이미 잡혀 있어 미결제 낙찰이 없다 |
| 결제 횟수 | 한 번. 기존 장바구니 주문과 같이 상품값 + 일본 내 송료 + 국제배송비 + 통관 예상액을 한 번에 매입한다 | 2차 결제가 없다. 기존 `proxyOrderTotal` 규칙을 그대로 쓴다 |
| 환율 | 신청 시점 환율(에어쉽과 같은 공식, `59ec5dd`)로 고정. 매입도 같은 환율로 계산 | 고객이 본 「최대 결제액」을 넘지 않는다. 화면에는 「신청 시점 환율로 확정」까지만 쓴다 |
| 받는 기간 | 마감까지 96시간 이하인 경매만 | 카드 승인 유효 기간 안에서 끝낸다(1.3절) |
| 입찰 주체 | 1차: 운영자 수동 + 자동 취소 가드. 2차: 에어쉽 워커(tomo → 에어쉽 서버 간 요청) | 돈 흐름을 먼저 검증한다. 워커가 죽어도 tomo 가드가 따로 돈을 지킨다 |
| 워커 연결 | tomo 가 에어쉽에 작업을 넣고 결과를 받는다. 워커는 에어쉽 DB 만 본다 | 같은 야후·메루카리 계정의 일일 한도·세션·동시 발사를 한곳에서 센다 |
| 승인 해제 규칙 | 「입찰이 한 번도 안 들어간 것이 확실」하거나 「마감 뒤 tomo 가 직접 읽은 낙찰가로 유찰이 확실」할 때만 자동. 그 밖은 보류 | 승인 해제는 되돌릴 수 없다. 낙찰했는데 해제하면 우리 손실이다 |
| 낙찰 뒤 | 매입 성공 → 대행 주문(T 번호)·대행 요청(`paid`) 생성 → 기존 흐름(구매·센터 입고·국제 발송) | 새 배송·환불 경로를 만들지 않는다 |
| 상한 올리기 | 1차에는 없다. 2차에 「새 승인으로 교체」 방식으로 넣는다 | 승인 2개가 동시에 살아 있는 구간을 1차에서 없앤다 |
| 지원 순서 | 메루카리 경매 → 야후옥션 | 야후는 tomo 에서 검색·상세가 꺼져 있고 파서 상태를 확인하지 못했다 |
| 기능 플래그 | `NEXT_PUBLIC_MARKET_AUCTION=1` 일 때만 신청 패널이 보인다. 꺼져 있으면 「구경만」(14번 B0) | 리허설 전에는 운영에서 끈다 |

## 1. 돈 구조

### 1.1 대안 비교

| 안 | 돈이 움직이는 때 | 사고 지점 | 유찰 때 비용·고객 체감 | 판정 |
|---|---|---|---|---|
| (가) 상한가 전액 선결제 | 신청 때 전액 청구. 유찰이면 전액 환불, 낙찰가가 낮으면 차액 환불 | 환불이 유찰마다 생긴다(입찰은 지는 경우가 더 많다). 환불 실패·대기 건이 쌓인다. 차액 환불 계산 문의 | 결제 수수료는 환불해도 돌아오지 않는 것으로 알고 있다(확인 못 함). 카드 환불은 고객 명세에 며칠 뒤 반영된다 | 비추천 |
| (나) 카드 사전 승인 | 신청 때 승인만. 낙찰 때 실제 금액 매입, 유찰이면 승인 취소 | 승인 유효 기간 안에 매입해야 한다. 매입 누락·만료가 유일한 큰 사고다(1.3절로 막는다). 카드만 된다(카카오페이·네이버페이 불가로 가정) | 청구가 없으므로 환불도 없다. 승인 취소는 수수료가 없다(확인 못 함) | 추천 |
| (다) 보증금 + 낙찰 후 잔액 결제 | 신청 때 일부, 낙찰 뒤 나머지 | 잔액 미결제 낙찰. 메루카리는 낙찰 24시간 안에 구매하지 않으면 우리 계정이 이용 제한을 받는다. 우리 돈으로 사면 실손 | 보증금 환불이 유찰마다 생긴다 | 비추천 |
| (라) 카드 저장 후 낙찰 때 자동 청구 | 낙찰 순간 | 자동 청구 실패(한도·본인 인증 요구)가 곧 미결제 낙찰이다. 한국 발급 카드의 자동 청구 성공률을 확인하지 못했다 | 유찰 때 돈 이동 없음 | 비추천 |

### 1.2 추천: (나) 카드 사전 승인

| 항목 | 규칙 |
|---|---|
| 승인액 | `proxyOrderTotal(상한가 + 일본 내 송료 예상, 국제배송비, 통화)` 를 신청 시점 환율로 원화 환산한 값 + 입찰 대행 수수료(9장 2번, 기본 0). 화면 이름은 「최대 결제액」 |
| 매입액 | 같은 식에 `낙찰가 + 실제 일본 내 송료` 를 넣은 값. 환율은 신청 때 고정한 값. 항상 승인액 이하다 |
| 매입액이 승인액을 넘는 경우 | 일본 내 송료가 예상보다 클 때만 가능하다. 넘는 부분은 청구하지 않고 승인액까지만 매입한다. 차액은 운영 손실로 기록한다(`market_bid_events`). 그래서 송료가 불명확한 출품은 받지 않는다(5장) |
| 결제 수단 | 카드만. 신청 패널에 「경매 입찰은 카드만 가능해요」를 쓴다 |
| 결제창 | 기존 Checkout Session 을 쓴다. `payment_intent_data.capture_method = "manual"`, `metadata.kind = "mb"`. 만료 30분은 그대로 |
| 승인 확인 | 웹훅·복귀 경로가 PaymentIntent 상태 `requires_capture` 를 확인하고 신청을 `authorized` 로 바꾼다. 신청이 이미 취소·만료됐으면 그 승인을 바로 취소한다(환불이 아니다) |
| 승인 유효 시각 | Stripe 가 돌려주는 `charge.payment_method_details.card.capture_before` 를 `auth_expires_at` 으로 저장한다. 이 값이 정본이다 |
| 받을 수 있는 경매 | `마감 시각 + 12시간 <= auth_expires_at`. 승인 직후 이 조건이 깨지면 승인을 바로 취소하고 고객에게 알린다 |
| 낙찰 매입 | 낙찰 확정과 같은 요청 안에서 매입한다. 멱등 키 `mb_capture_<신청 id>`. 성공을 확인한 뒤에만 주문을 만든다 |
| 유찰·취소 | 승인 취소. 멱등 키 `mb_cancel_<승인 id>`. 실패하면 5분 크론이 다시 한다 |

### 1.3 승인 유효 기간 사고 막기

| 위험 | 막는 방법 |
|---|---|
| 경매 기간이 승인 유효 기간보다 길다 | 마감까지 96시간 넘는 경매는 신청을 받지 않는다. 화면에 「마감 4일 전부터 신청할 수 있어요」를 쓴다. 메루카리 경매는 첫 입찰 다음 날 20시대에 끝나 항상 범위 안이다 |
| 야후 자동 연장 | 연장은 분 단위다. 12시간 여유로 덮는다 |
| 낙찰했는데 매입을 놓친다 | 낙찰 확정과 매입이 한 동작이다. 5분 크론이 `won` 인데 매입 기록이 없는 건을 다시 매입한다. `auth_expires_at` 24시간 전에 미결 건이 있으면 운영 이벤트 `bid.auth_expiring` |
| 결과를 모르는 채 만료가 다가온다 | 보류 건은 「내 차례」 맨 위에 올린다. 만료 6시간 전까지 미결이면 운영자에게 푸시를 다시 보낸다. 자동 해제는 하지 않는다 |
| 매입 실패(만료·카드사 취소) | 상태 `capture_failed`. 우리 계정은 구매를 끝낸다(계정 보호). 고객에게 일반 결제 링크를 보낸다(기한 48시간). 미결제면 입찰 자격을 정지하고 상품은 우리가 보유한다. 운영 이벤트 `bid.capture_failed` |

### 1.4 환율

| 항목 | 규칙 |
|---|---|
| 환율 공식 | tomo 의 현재 엔→원 환율(에어쉽과 같은 공식)을 그대로 쓴다 |
| 고정 시점 | 신청(결제창을 여는 순간). `market_bids.rate` 에 저장한다 |
| 낙찰 매입 | 저장한 환율로 계산한다. 신청부터 낙찰까지(최대 약 4일)의 환율 변동은 우리가 진다 |
| 화면 문구 | 「최대 결제액 ○○원(신청 시점 환율로 확정)」. 환율 구성은 쓰지 않는다 |

## 2. 실제 입찰 주체

### 2.1 대안 비교

| 안 | 내용 | 사고 지점 | 판정 |
|---|---|---|---|
| (a) tomo → 에어쉽 서버 간 요청 | tomo 가 에어쉽 API 에 입찰 작업을 넣는다. 에어쉽이 `auction_bids` 에 `origin_site='tomo'` 로 담고 워커가 평소대로 입찰한다. 결과는 에어쉽이 tomo 운영 API 로 보낸다 | 에어쉽이 죽으면 tomo 입찰도 멈춘다(tomo 가드가 자동 취소한다). 에어쉽 낙찰 정산 함수에 「연결 사이트 건은 주문·바우처 경로를 건너뛴다」 분기를 넣어야 한다(돈 함수 수정) | 2차 추천 |
| (b) 워커가 tomo DB 큐를 직접 폴링 | 워커 PC 에 tomo 서비스 키를 두고 두 DB 를 번갈아 본다 | 일일 한도·동시 발사·계정 입찰 제한을 두 DB 에서 따로 센다. 같은 브라우저를 두 루프가 다툰다. 워커 PC 에 키가 하나 더 생긴다 | 비추천 |
| (c) 운영자 수동 입찰 | 에어쉽 어드민 연결 사이트 화면의 「입찰 필요」 줄을 보고 운영자가 우리 계정으로 직접 입찰하고 결과를 적는다 | 사람이 놓친다. 메루카리는 자동 입찰이 없어 밀릴 때마다 다시 넣어야 한다. 다만 돈은 가드가 지킨다(놓치면 승인 취소) | 1차 추천(소량) |

에어쉽 워커가 일을 받는 방식(확인): 워커는 서비스 키로 에어쉽 DB 의 `auction_bids` 를 직접 폴링한다(`worker/src/db.ts` `fetchSchedulable`·`fetchInstantPending`·`fetchReconcilable`·`fetchMissedBids`). 메루카리 입찰기는 10초마다 `market='mercari'` 건을 본다(`mercari-bid-run.ts`). 발사마다 `auction_bid_fires` 에 한 줄을 쓴다. 생존 신호는 `worker_heartbeat`(이름 `auction`·`mercari_bid`)이고 pg_cron 이 5분 넘게 끊기면 알린다. 일일 한도는 야후·메루카리 합산(`todayPlacedTotalJpy`)이다. 그래서 (a)처럼 같은 표에 담아야 이 안전망이 tomo 건에도 그대로 걸린다.

### 2.2 단계 도입

| 단계 | 입찰 주체 | 한도(기본값) | 넘어가는 조건 |
|---|---|---|---|
| 1차 | 운영자 수동. 메루카리 경매만 | 전체 동시 5건, 고객당 1건, 상한가 30,000엔 | 리허설(8.3절) 통과 + 실제 낙찰 3건·유찰 3건이 돈 사고 없이 끝남 |
| 2차 | 에어쉽 워커((a) 방식). 메루카리 | 전체 동시 20건, 고객당 3건, 상한가 100,000엔 | 에어쉽 메루카리 입찰기가 에어쉽 자체 건에서 2주 동안 「제출 불명」 0건 |
| 3차 | 야후옥션 추가 | 같음 | tomo 야후 재개 조건(5.2절) 충족 |

### 2.3 안전 동작(1차·2차 공통, tomo 가 직접 판정)

| 상황 | tomo 동작 | 돈 |
|---|---|---|
| 접수 중단 조건: 수동 단계에서 운영자가 「접수 중단」을 켬 / 워커 단계에서 에어쉽 건강 응답이 5분 넘게 없음·세션 만료·입찰기 꺼짐 | 신청 패널을 닫고 「지금은 입찰 신청을 받지 않아요」를 보인다. 진행 중 건은 아래 줄로 판정한다 | 새 승인 없음 |
| 마감 30분 전까지 「입찰 준비됨」이 아니다. 수동: 상태가 `placed` 가 아님. 워커: 에어쉽이 접수 확인을 안 했거나 생존 신호가 5분 넘게 없음 | 자동 취소. 고객 알림 「입찰을 넣지 못했어요. 카드 승인은 취소했어요」. 운영 이벤트 `bid.missed` | 승인 취소 |
| 입찰 제출 실패가 확정(화면에서 제출 전 오류, 발사 기록 없음) | 위와 같다 | 승인 취소 |
| 제출했는지 모른다(에어쉽 `[bid-submit-unknown]`, 시간 초과, 재로그인 요구가 제출 도중에 뜸) | 보류(`hold`). 운영자가 마켓 화면·야후 공개 입찰 기록으로 확인한 뒤 「입찰됨」 또는 「안 들어감」을 고른다 | 승인 유지 |
| 마감 뒤 15분 안에 결과가 오지 않는다 | 보류. 「내 차례」 맨 위 | 승인 유지 |
| 결과가 유찰로 왔다 | tomo 가 상품을 직접 다시 읽는다. 야후: 종료 + 낙찰가 > 상한이면 자동 유찰. 메루카리: 종료 + 낙찰가 ≠ 우리 마지막 입찰액이면 자동 유찰. 그 밖은 보류 | 확인되면 승인 취소 |
| 결과가 낙찰로 왔다 | 낙찰가 ≤ 상한인지 검사하고 매입한다. 낙찰가 > 상한이면 보류 | 매입 |

2026-11-19 에어쉽 사례(메루카리 입찰기가 시간 초과·재로그인 요구로 실제 입찰이 안 들어감)는 이 표의 2~4번째 줄에 해당한다. 제출 전 실패가 확실하면 승인 취소와 사과 알림이 자동으로 나가고, 확실하지 않으면 보류된다.

## 3. 상태 흐름

### 3.1 상태

| 상태 | 뜻 | 다음 | 고객 화면 |
|---|---|---|---|
| `pending_auth` | 결제창 열림(45분 유지) | `authorized` / `expired` | 카드 승인 대기 |
| `authorized` | 승인 완료, 입찰 대기 | `placed` / `cancelled` / `missed` / `hold` | 입찰 준비 중 |
| `placed` | 입찰됨(검증 기록 있음) | `outbid` / `won` / `lost` / `hold` | 입찰 중(현재 최고가 여부 표시) |
| `outbid` | 상한 안에서 밀림 또는 상한 초과 | `placed`(상한 안 재입찰) / `lost` / `won`(앞 입찰이 지워진 경우) | 밀렸어요. 마감까지 승인은 유지돼요 |
| `hold` | 검증 실패·결과 모름 | 운영자가 `placed`·`won`·`lost`·`missed` 중 선택 | 확인 중이에요 |
| `won` | 낙찰 확정, 매입 진행 | `ordered` / `capture_failed` | 낙찰! 결제 처리 중 |
| `ordered` | 매입 완료, 대행 주문 생성(끝 상태) | 이후는 대행 주문 흐름 | 주문 T 번호로 이동 |
| `lost` | 유찰(끝) | — | 낙찰되지 않았어요. 승인 취소됨 |
| `cancelled` | 고객 취소(입찰 전만)·운영 취소(끝) | — | 취소됨 |
| `missed` | 우리가 입찰을 못 넣음(끝) | — | 입찰을 넣지 못했어요. 승인 취소됨 |
| `expired` | 결제창 만료(끝) | — | 표시 안 함 |
| `capture_failed` | 낙찰했는데 매입 실패 | `ordered`(재결제) / 운영 종결 | 결제가 필요해요(기한 표시) |

`outbid` 에서 승인을 바로 풀지 않는 이유: 야후는 출품자가 앞선 입찰을 지우면 우리가 다시 최고가가 될 수 있다. 승인은 마감 결과가 확정될 때만 푼다.

### 3.2 고객 취소

| 시점 | 가능 여부 |
|---|---|
| `authorized`(입찰 전) | 가능. 승인 취소. 워커 단계에서는 에어쉽에 취소를 먼저 보내고 확인을 받은 뒤 취소한다(확인이 없으면 보류) |
| `placed` 이후 | 불가. 메루카리·야후 모두 입찰을 취소할 수 없다. 신청 확인 창에 미리 쓴다 |

### 3.3 낙찰 → 대행 주문 전환

| 순서 | 동작 | 실패 시 |
|---|---|---|
| 1 | 운영자 또는 워커 결과가 낙찰가·일본 내 송료를 넣는다 | 검사 실패면 보류 |
| 2 | `won` 으로 바꾸고 매입액을 계산해 저장한다(DB) | — |
| 3 | Stripe 매입(멱등 키) | `capture_failed` |
| 4 | `market_bid_to_order`: `proxy_orders`(상태 `paid`, `stripe_payment_intent_id` = 그 승인, `rate` = 고정 환율, 배송지 = 신청 때 받은 주소) + `proxy_requests`(상태 `paid`, `quote_item_price` = 낙찰가 + 일본 내 송료, `order_id`) 를 한 트랜잭션으로 만든다. `market_bids.order_id` 를 채우고 `ordered` | 5분 크론이 3번 성공·4번 미완 건을 다시 한다(매입 기록이 있고 주문이 없으면 4번만) |
| 5 | 기존 트리거가 `order.paid` 이벤트를 보낸다. 이후 구매(`purchasing`)·센터 입고·국제 발송·환불은 기존 화면·함수 그대로 | — |

메루카리는 낙찰 24시간 안에 우리 계정이 구매해야 한다. 그래서 `order.paid` 와 별도로 `bid.won` 이벤트를 보내고 「내 차례」에 기한(낙찰 + 24시간)을 붙인다.

### 3.4 낙찰가 외 비용

| 비용 | 언제 | 얼마 |
|---|---|---|
| 일본 내 송료 | 낙찰 매입에 포함 | 출품자 부담이면 0. 금액이 상품 화면에 적혀 있으면 그 금액. 그 밖은 접수하지 않는다 |
| 국제배송비 | 낙찰 매입에 포함 | 기존 장바구니와 같은 정액(8,000원/900엔, `lib/fees.ts`) |
| 통관 예상액 | 낙찰 매입에 포함 | 기존 `customsCharge` 그대로(낙찰가 기준으로 다시 계산) |
| 입찰 대행 수수료 | 낙찰 매입에 포함 | 9장 2번(기본 0). 유찰이면 받지 않는다 |
| 2차 결제 | 없음 | 기존 장바구니 주문과 같다 |

## 4. 데이터 모델

### 4.1 표

| 표 | 주요 칸 | 읽기 |
|---|---|---|
| `market_bids` | `id`, `code`(MB+6자리), `user_id`, `external_item_id`, `source`(mercari/yahoo_auction), `source_id`, `status`, `cap_jpy`, `domestic_ship_jpy`(예상), `rate`, `auth_base`(승인액 계산 근거, 주문 통화), `fee`, `ends_at`, `seen_price_jpy`, `auth_id`, `executor`(manual/airship), `executor_ref`, `armed_at`, `placed_at`, `last_bid_jpy`, `is_top`, `final_price_jpy`, `final_ship_jpy`, `capture_base`, `captured_krw`, `order_id`, `hold_reason`, `fail_reason`, 배송지·통관번호 칸(`create_proxy_order` 와 같은 칸), `request_id`, `created_at` | 본인·운영자. 쓰기는 함수만 |
| `market_bid_auths` | `id`, `bid_id`, `stripe_session_id`(유일), `payment_intent_id`(유일), `amount_krw`, `cap_jpy`, `status`(pending/authorized/captured/released/superseded/failed), `capture_before`, `captured_krw`, `released_at` | 운영자만 |
| `market_bid_events` | `bid_id`, `kind`(requested/authorized/armed/placed/outbid/rebid/hold/released/won/captured/ordered/lost/missed/cancelled/loss_recorded), `amount_jpy`, `evidence`(주소·메모), `actor`, `created_at` | 본인은 고객용 종류만(뷰), 운영자는 전부 |
| `market_bid_settings`(한 행) | 접수 중단 여부, 지원 마켓, 상한가 상한, 전체 동시 건수, 고객당 건수, 일일 총 상한, 마감 임박 거절 분, 최대 남은 시간(96시간), 수수료, 입찰 주체 | 누구나 읽기, 운영자만 쓰기 |

유일 조건: `(user_id, external_item_id)` 에 끝 상태가 아닌 신청은 한 건. 같은 상품에 여러 고객이 신청하면 우리 계정끼리 경쟁하므로 **상품당 진행 중 신청도 한 건**만 받는다(먼저 승인된 사람). 뒤 고객에게는 「다른 회원이 먼저 입찰 신청했어요」를 보인다.

### 4.2 함수(RPC)

| 함수 | 부르는 쪽 | 하는 일 |
|---|---|---|
| `request_market_bid(item, cap, ship, addr…, request_id)` | 고객(서버 경유) | 가드(7장) 검사, 환율 고정, 승인액 계산, `pending_auth` 생성. 같은 `request_id` 는 같은 결과 |
| `market_bid_authorized(session, pi, capture_before)` | 서버(웹훅·복귀) | `pending_auth → authorized`. 조건이 깨졌으면 `false` 를 돌려 서버가 승인을 취소하게 한다 |
| `cancel_market_bid(id)` | 고객 | `authorized` 일 때만 |
| `market_bid_set_placed(id, amount, evidence, expected_status)` | 운영(수동·워커 결과) | `authorized/outbid/hold → placed`, 사건 기록 |
| `market_bid_set_outbid(id, price)` | 운영·크론 | `placed → outbid` |
| `market_bid_set_won(id, final, ship, expected_status)` | 운영(돈 권한)·워커 결과 | 검사 후 `won`, 매입액 저장 |
| `market_bid_captured(id, krw)` / `market_bid_to_order(id)` | 서버 | 매입 기록, 주문 전환 |
| `market_bid_release(id, to, reason)` | 서버(크론·운영) | `lost/missed/cancelled` 로 닫고 승인 행을 `released` 예정으로 표시 |
| `market_bid_hold(id, reason)` / `market_bid_resolve(id, to, …)` | 크론·운영 | 보류와 해제 |
| `cron_market_bids()` | pg_cron 1분 | 4.3절 |

### 4.3 크론(1분, DB 판정 → 서버 경로가 Stripe 호출)

| 작업 | 조건 | 동작 |
|---|---|---|
| 결제창 만료 | `pending_auth` 45분 초과 | `expired` |
| 입찰 못 넣음 | `authorized` 이고 마감 30분 전 지남(수동), 또는 워커 준비 확인 없음 | `missed` + 승인 취소 예약 + 알림 |
| 결과 지연 | `placed/outbid` 이고 마감 + 15분 지남 | `hold` + 운영 이벤트 |
| 승인 취소 실행 | 승인 행이 `released` 예정이고 Stripe 미호출 | `POST /api/cron/market-bids` 가 취소 호출(멱등 키) |
| 매입·전환 재시도 | `won` 5분 초과 | 매입 → 주문 전환 다시 |
| 만료 임박 | 끝 상태가 아니고 `auth_expires_at` 24시간·6시간 전 | 운영 이벤트 `bid.auth_expiring` |
| 워커 단계 대조 | `executor='airship'` 진행 건 | 에어쉽 상태 조회로 훅 유실을 메운다(2분마다) |
| 기록 | — | `cron_runs` |

모든 전이는 `where status = 이전 상태` 조건이다. 두 번 돌아도 결과가 같다.

### 4.4 멱등

| 지점 | 키 |
|---|---|
| 신청 | 화면이 만든 `request_id` |
| 결제창 | 신청당 열린 세션 1개. 다시 열면 앞 세션을 만료시킨다(기존 방식) |
| 매입 | `mb_capture_<신청 id>` |
| 승인 취소 | `mb_cancel_<승인 id>` |
| 주문 전환 | `market_bids.order_id` 가 있으면 그대로 돌려준다 |
| 운영 조작 | 기존 운영 API 의 `request_id` + `expected_status`(12번 9.3절) |
| 에어쉽 작업 등록 | `site_key + code(MB 번호)` 유일 |

### 4.5 이벤트(outbox)·「내 차례」

| 이벤트 | 때 | 「내 차례」 줄 |
|---|---|---|
| `bid.requested` | `authorized`(수동 단계: 입찰 필요) | `market_bid.to_place` — 마감 가까운 순 |
| `bid.hold` | 보류 | `market_bid.hold` — 맨 위 |
| `bid.won` | 낙찰(메루카리 구매 기한 포함) | `market_bid.to_buy` — 기한 임박 순 |
| `bid.missed` | 못 넣음 | 알림만 |
| `bid.capture_failed` | 매입 실패 | `market_bid.capture_failed` |
| `bid.auth_expiring` | 승인 만료 임박 | `market_bid.hold` 에 강조 |

`ops_outbox.type` 검사 조건과 `OPS_EVENT_TYPES` 에 위 6종을 더한다. `/api/ops/counts` 에 4줄을 더한다.

### 4.6 알림(ko/ja)

| 종류 | 때 | ko 요지 |
|---|---|---|
| `mb_authorized` | 승인 완료 | 입찰 신청을 받았어요. 카드는 승인만 됐고 아직 결제되지 않았어요 |
| `mb_placed` | 입찰됨 | 입찰했어요(현재 ○엔) |
| `mb_outbid` | 밀림 | 다른 입찰자가 더 높게 넣었어요. 마감까지 지켜볼게요 |
| `mb_won` | 낙찰 | 낙찰됐어요. ○원이 결제됐어요(주문 T 번호) |
| `mb_lost` | 유찰 | 낙찰되지 않았어요. 카드 승인은 취소했어요 |
| `mb_missed` | 못 넣음 | 저희 쪽 문제로 입찰을 넣지 못했어요. 카드 승인은 취소했어요 |
| `mb_hold` | 보류 | 결과를 확인하고 있어요. 확인되면 바로 알려 드릴게요 |
| `mb_cancelled` | 취소 | 입찰 신청을 취소했어요. 카드 승인은 취소했어요 |
| `mb_pay_needed` | 매입 실패 | 낙찰됐지만 결제가 되지 않았어요. ○까지 결제해 주세요 |

모든 승인 취소 알림에 「카드사에 따라 한도 복구에 며칠 걸릴 수 있어요」를 붙인다.

### 4.7 번호·마이그레이션

| 항목 | 값 |
|---|---|
| 입찰 신청 번호 | `MB` + 6자리(`order_code('MB', nextval('market_bid_code_seq'))`). 자체 경매 `AU`, 대행 주문 `T`, 거래 `TX` 와 겹치지 않는다 |
| 낙찰 뒤 | 대행 주문 `T` 번호가 새로 붙는다. 화면에는 「입찰 MB000012 → 주문 T000345」 |
| `0049_market_bids.sql` | 표 4개, 권한·뷰, 신청·승인·취소 함수, 가드, 번호, 알림 종류 |
| `0050_market_bid_settle.sql` | 입찰됨·밀림·낙찰·매입·주문 전환·해제·보류 함수, 크론, outbox 종류, 운영 조회 |
| `0051_market_bid_raise.sql`(2차) | 상한 올리기(새 승인으로 교체) |
| 에어쉽 쪽 | 별도 마이그레이션(`auction_bids.origin_site`·`origin_code`, 정산 분기). 에어쉽 저장소 규칙을 따른다 |

## 5. 마켓별

### 5.1 메루카리 경매

규칙은 메루카리 공식 도움말·공지(help.jp.mercari.com/guide/articles/1925, jp-news.mercari.com/info/43034, 2026-11-27 검색 결과로 확인)와 에어쉽 마이그레이션 `20261020150000` 의 2026-10-20 확인 기록을 따랐다.

| 규칙 | 내용 | 설계 반영 |
|---|---|---|
| 입찰 방식 | 자동 입찰 없음. 넣은 금액이 곧 내 값이다. 입찰 0건이면 시작가부터, 1건 이상이면 현재가 + 100엔 이상 | 우리는 상한 안에서 「필요한 최소 금액」만 넣는다. 상한가를 그대로 넣지 않는다 |
| 마감 | 첫 입찰 다음 날 20시대(분은 첫 입찰과 같음). 입찰 전에는 마감이 없다 | 입찰 0건 상품은 우리 첫 입찰로 마감이 정해진다. 입찰 직후 마감을 다시 읽어 `ends_at` 을 채운다 |
| 연장 | 마감 5분 전 안에 입찰이 있으면 연장. 공식 도움말은 조건을 공개하지 않는다고 쓴다(공지에는 5분) | 연장 길이를 가정하지 않는다. 마감 시각은 매번 상품에서 읽는다 |
| 취소 | 입찰 취소·금액 변경 불가 | 신청 확인 창에 쓴다. `placed` 뒤 고객 취소 불가 |
| 출품자 조기 종료 | 가능(현재가로 확정) | 마감 전에도 결과가 날 수 있다. 수동·워커 모두 「종료됨」을 결과로 받는다 |
| 낙찰 뒤 | 낙찰자만 24시간 안에 구매. 안 하면 정액 출품으로 바뀌고 낙찰자는 이용 제한을 받을 수 있다 | 낙찰 즉시 매입 → `bid.won` → 운영자 구매(기한 표시) |
| 출품 제한 | 티켓 분류는 경매 불가 | 영향 없음 |
| 인식 | `items/get` 에 `include_auction=true` 를 붙여야 `auction_info` 가 온다(에어쉽 실측) | M0 에서 `lib/market/mercari.ts` 가 읽는다 |

| 지원 못 하는 경우 | 화면 표시 |
|---|---|
| 송료 구매자 부담(着払い)이거나 송료 금액을 알 수 없다 | 「이 상품은 입찰 신청을 받지 않아요(배송비 확인 불가)」 |
| 마감 60분 전 미만(수동 단계는 180분) | 「마감이 임박해 신청할 수 없어요」 |
| 専用·取り置き 등 기존 `unbuyable` 사유 | 기존 문구 |
| 메루카리 Shops 상품 | 경매가 아니므로 해당 없음 |

### 5.2 야후옥션(3차)

| 항목 | 내용 |
|---|---|
| 재개 조건 | ① `LIVE_SOURCES` 에 `yahoo_auction` 추가 전 파서 실측(검색·상세 각 20건, 현재가·즉결가·마감·입찰 수·송료·출품자 평가) ② 상세에서 자동 연장 여부·입찰자 제한·스토어 여부를 읽는다 ③ 서버 조회가 막히지 않는지 3일 관찰 ④ 에어쉽 야후 워커가 연결 사이트 건을 처리(2차 완료) |
| 파서 상태 | 코드는 남아 있다(`lib/market/yahoo-auction.ts`). 2026-09-07 중단 뒤 실제 동작은 확인하지 못했다 |
| 입찰 방식 | 상한가를 넣으면 야후가 대신 올린다. 낙찰가는 2등 + 단위 | 고객 상한가를 그대로 야후 상한으로 넣는다 |
| 자동 연장 | 출품자 설정. 마감 5분 안에 값이 오르면 5분 연장으로 알고 있다 | 마감 시각은 매번 읽는다 |
| 즉결가 | 상한 ≥ 즉결가면 신청 거절(즉결 구매는 이 기능 범위 밖) | 「상한가는 즉결가보다 낮아야 해요」 |
| 입찰 취소 | 불가(출품자만 지울 수 있다) | 3.1절 `outbid` 유지 이유 |
| 제한 출품 | 신규·평가 제한, 본인 확인 제한 출품은 우리 계정 상태에 따라 입찰 불가 | 에어쉽 판매자 게이트(`20260926100000_auction_seller_gate`)·사전 점검 결과를 접수 확인에 포함한다. 불가면 `missed`(승인 취소) |
| 검증 | 야후 공개 입찰 기록(`page.auctions.yahoo.co.jp/jp/show/bid_hist?aID=`)과 대조 | 수동 단계도 증빙 주소로 이 화면을 적는다 |

| 지원 못 하는 경우 | 화면 표시 |
|---|---|
| 송료 미정(낙찰 후 연락)·着払い | 신청 불가 |
| 마감까지 96시간 초과 | 「마감 4일 전부터 신청할 수 있어요」 |
| 스토어 출품(소비세 별도 표기) | 1차에는 신청 불가 |
| 출품자 평가 낮음 | 경고 + 동의 체크(7장) |

## 6. 화면

### 6.1 고객

| 화면 | 내용 |
|---|---|
| 상세(`app/global/[source]/[id]`) | 플래그가 켜지고 접수 중이면 경매 상품에 입찰 신청 패널을 연다. 기존 `ProxyRequestButton auction` 조각은 쓰지 않고 새 컴포넌트로 바꾼다(메모 칸에 금액을 넣는 방식은 버린다) |
| 신청 패널 | 현재가·입찰 수·마감 시각(남은 시간), 상한가 입력(엔, 최소 = 현재가 + 100엔), 예상 내역(상한가 기준: 상품 + 일본 내 송료 + 국제배송 + 통관 예상 = 최대 결제액 원화), 배송지·통관번호, 동의 체크 3개 |
| 동의 체크 | ① 입찰 뒤에는 취소할 수 없어요 ② 낙찰되면 낙찰가 기준으로 자동 결제돼요(최대 결제액 이하) ③ 낙찰을 보장하지 않아요. 낙찰되지 않으면 카드 승인을 취소해요 |
| 환불 규칙 문구 | 「지금은 카드 승인만 해요. 낙찰됐을 때만 실제 금액이 결제돼요. 낙찰되지 않거나 저희가 입찰을 넣지 못하면 승인을 취소해요. 카드사에 따라 한도 복구에 며칠 걸릴 수 있어요.」 |
| 신청 상세(`/bids/[id]`) | 상태 줄(3.1절), 사건 기록(고객용), 마감 시각, 최대 결제액, 낙찰 시 주문 링크. 30초 폴링 |
| 마이페이지 | 「입찰 신청」 탭: 진행 중·끝난 건. 낙찰 건은 주문으로 이어진다 |
| 접수 중단 | 패널 자리에 「지금은 입찰 신청을 받지 않아요」. 상품은 구경만 |

### 6.2 운영

| 화면 | 내용 |
|---|---|
| tomo `/admin/market-bids` | 목록(입찰 필요·입찰 중·보류·낙찰 구매 필요·매입 실패·끝), 상세(사건 기록·승인 행·증빙), 조작(입찰됨 기록, 밀림, 낙찰 처리, 유찰 처리, 못 넣음 처리, 보류 해제), 설정(접수 중단·한도) |
| 운영 API | `OPS_CAPABILITIES` 에 `"market_auction"`. `GET /api/ops/market-bids`, `GET /api/ops/market-bids/:id`, `POST …/:id/placed`(ops), `POST …/:id/outbid`(ops), `POST …/:id/won`(money), `POST …/:id/lost`(money), `POST …/:id/missed`(money), `POST …/:id/hold`(ops), `GET·POST /api/ops/market-bids/settings`(money) |
| 권한 이유 | 낙찰(매입)과 승인 해제는 돈이 움직이거나 되돌릴 수 없으므로 돈 권한이다 |
| 에어쉽 연결 사이트 | capability `market_auction` 이 오면 「마켓 입찰」 탭: 「입찰 필요」 줄(상품 주소·상한가·마감·남은 시간), 입찰 기록 입력(금액·증빙), 결과 입력, 보류 처리. 워커 단계에서는 줄마다 워커 상태·발사 기록을 같이 보인다 |
| 「내 차례」 | 4.5절 4줄. 지연 기준: 입찰 필요는 마감 2시간 전부터 경고, 보류는 즉시 지연 |
| 워커 결과의 운영자 이름 | 워커 결과는 에어쉽 서버가 서명해 같은 운영 API 로 보낸다. `ops_actors` 에 시스템 운영자 한 줄을 둔다. 돈 권한 규칙(주인만)과 충돌하므로 워커 결과 전용 경로 `POST /api/ops/market-bids/:id/executor-result` 를 따로 두고, tomo 가 2.3절 검사를 통과한 것만 매입·해제한다. 통과 못 하면 보류 |

## 7. 가드

| 가드 | 기본값 | 판정 위치 |
|---|---|---|
| 접수 스위치 | 꺼짐(리허설 전) | `market_bid_settings` + 플래그 |
| 상한가 상한 | 1차 30,000엔 / 2차 100,000엔 | `request_market_bid` |
| 상한가 하한 | 현재가 + 100엔(메루카리)·현재가 + 입찰 단위(야후) | 같음 |
| 일일 총 입찰 상한(전체 고객 승인 상한가 합) | 1차 100,000엔 / 2차 300,000엔. 워커 단계는 에어쉽 일일 한도(야후·메루카리 합산)에도 함께 걸린다 | 같음 + 에어쉽 |
| 전체 동시 건수 | 1차 5건 / 2차 20건 | 같음 |
| 고객당 동시 건수 | 1차 1건 / 2차 3건. 완료 거래 0건 회원은 1건 | 같음 |
| 상품당 진행 신청 | 1건 | 유일 조건 |
| 마감 임박 거절 | 수동 180분 / 워커 60분 | 같음 |
| 남은 시간 상한 | 96시간 | 같음 + 승인 뒤 `capture_before` 재검사 |
| 가격 재확인 | 신청 요청 때 서버가 마켓을 다시 읽는다(경매 여부·현재가·마감·송료). 화면에서 본 값과 다르면 다시 보여 주고 재확인 | `/api/market-bid` |
| 판매자 평가 낮음 | 평가 수 10 미만 또는 좋은 평가 비율 95% 미만이면 경고 + 동의 체크 | 화면 + 서버 |
| 미결제·정지 회원 | 정지 회원·`capture_failed` 미해결 회원은 신청 불가 | `request_market_bid` |
| 배송지 | 신청 때 받는다(낙찰 뒤 묻지 않는다) | 같음 |
| 검증 실패 | 2.3절 표대로 보류. 자동 해제 금지 | 크론·운영 API |
| 낙찰가 > 상한 결과 | 보류 | `market_bid_set_won` |

## 8. 구현

### 8.1 트랙(각각 standard 에이전트 한 세션)

순서: M0 → M1 → M2 → M3 → M4 → M5 → A3 → M6(리허설·1차 켜기) → W1 → W2 → M7 → Y1.

| 트랙 | 내용 | 소유 파일 | DB | 완료 기준 | 되돌리기 |
|---|---|---|---|---|---|
| M0 경매 인식·차단 | 14번 B0 와 같다. 추가로 `auction_info`(현재가·마감·입찰 수)를 상세 자료형에 담는다 | `lib/market/mercari.ts`, `lib/market/types.ts`, `lib/price-check.ts`, `lib/i18n*.ts` | 없음 | 실제 메루카리 경매 1건이 「경매·구경만」으로 보이고 장바구니·주문 API 가 거절한다. 일반 상품 3건은 그대로 | revert |
| M1 DB 핵심 | 표 4개, 신청·승인·취소 함수, 가드, MB 번호, 알림 종류 | `supabase/migrations/0049_market_bids.sql` | 0049 | 롤백 블록 시험: 가드 14종 각각 거절, 같은 `request_id` 재요청 같은 결과, 상품당 1건, 다른 계정 조회 0행 | 파일 끝 되돌리기 SQL |
| M2 승인·매입·취소 | 결제창(수동 매입), 웹훅·복귀의 `mb` 분기, 매입·취소 서버 함수, 신청 API | `lib/stripe.ts`, `lib/stripe-settle.ts`, `lib/market-bid.server.ts`(새), `app/api/market-bid/route.ts`(새), `tests/unit/market-bid*.test.ts` | 없음 | Stripe 시험 모드: 승인 → `requires_capture` 확인 → 부분 매입 → 남은 금액 풀림 확인. 승인 → 취소. 신청이 만료된 뒤 온 승인은 자동 취소. 기존 `tx`·`po` 결제 시험 그대로 통과 | 플래그 끄기 → revert |
| M3 정산·크론 | 입찰됨·밀림·낙찰·주문 전환·해제·보류 함수, 크론, outbox 종류 | `supabase/migrations/0050_market_bid_settle.sql`, `app/api/cron/market-bids/route.ts`(새) | 0050 | 롤백 블록 시험: 3.1절 전이표 전부, 허용 안 된 전이 거절, 크론 두 번 실행 결과 같음, 주문 전환 뒤 `proxy_order_amount` = 매입 근거 금액 | 되돌리기 SQL(크론 해제 먼저) |
| M4 고객 화면 | 신청 패널, 신청 상세, 마이페이지 탭, 알림 문구 ko/ja | `components/market-bid/*`(새), `app/global/[source]/[id]/page.tsx`, `app/bids/*`(새), `app/mypage/*`, `lib/i18n-port/market-bid.ts`(새), `lib/notifications.ts` | 없음 | 플래그 끄면 흔적 없음. ko/ja 누락 0. 최대 결제액이 서버 계산과 1원도 다르지 않음 | 플래그 끄기 → revert |
| M5 운영 | tomo 어드민 화면, 운영 API capability·경로·할 일·이벤트, 12번 9장 추가 | `app/admin/market-bids/*`(새), `lib/ops-api.ts`, `lib/ops-bridge.ts`, `docs/aaa/12-*.md` | 없음 | `/api/ops/meta` 에 `market_auction`. 조작 6종이 활동 기록에 남는다. `expected_status` 불일치 409 | revert |
| A3 에어쉽 화면(에어쉽 저장소) | 연결 사이트 「마켓 입찰」 탭, 새 이벤트 6종 수신, 「내 차례」 4줄 | `src/components/admin/connected/*`, `src/lib/connected/*` | 에어쉽 쪽 없음 | tomo 시험 건이 「입찰 필요」 줄에 뜨고 입찰 기록·결과 입력이 tomo 에 반영된다 | revert |
| M6 리허설·1차 켜기 | 8.2·8.3절 | 이 문서 부록 | 없음 | 시험표 통과, 시험 자료 정리 | 플래그 끄기 + 접수 중단 |
| W1 에어쉽 워커 연결(에어쉽 저장소) | 작업 등록·취소·상태 API, `auction_bids.origin_site`, 낙찰 정산의 주문·바우처 경로 건너뛰기, 한도 검사 제외, 결과 전송 | 에어쉽 `src/routes/api/site-bid.*`, 마이그레이션, `worker/src` 최소 수정 | 에어쉽 | 드라이런으로 tomo 시험 건이 접수·예약·결과 전송까지 간다. 에어쉽 자체 입찰 시험(`*.check.sql`) 그대로 통과. 바꾸지 않는 돈 함수 md5 대조 | down 마이그레이션 |
| W2 tomo 워커 단계 | `executor='airship'` 등록·취소·대조, 준비 확인 판정, `executor-result` 경로, 건강 응답으로 접수 중단 | `lib/market-bid.server.ts`, `lib/ops-api.ts`, `app/api/cron/market-bids/route.ts` | 없음 | 에어쉽 응답을 끊으면 5분 안에 접수 중단, 마감 30분 전 자동 취소. 「제출 불명」 결과는 보류 | 설정 `executor=manual` |
| M7 상한 올리기 | 새 승인으로 교체 | `0051_market_bid_raise.sql`, 패널 | 0051 | 새 승인 확인 뒤에만 상한 교체, 옛 승인 취소 재시도, 매입은 현재 승인에만 | 되돌리기 SQL |
| Y1 야후옥션 | 5.2절 재개 조건, 파서 실측, 제한 출품 표시 | `lib/market/yahoo-auction.ts`, `lib/market/types.ts` | 없음 | 5.2절 ①~④ | `LIVE_SOURCES` 원복 |

### 8.2 실결제 없는 리허설

| 번호 | 방법 | 확인 |
|---|---|---|
| 1 | Stripe 시험 모드 키를 쓰는 미리보기 배포에서 시험 카드로 승인 | `authorized`, `capture_before` 저장 |
| 2 | 운영 SQL 로 시험 건의 `ends_at` 을 20분 뒤로 당기고 아무것도 하지 않는다 | `missed`, 승인 취소, 알림 |
| 3 | 「입찰됨」 기록 뒤 `ends_at` 을 과거로 당기고 결과를 넣지 않는다 | `hold`, 승인 유지, 「내 차례」 맨 위 |
| 4 | 유찰 처리(시험 상품의 낙찰가를 상한보다 높게 입력) | `lost`, 승인 취소 |
| 5 | 낙찰 처리(낙찰가 < 상한) | 부분 매입, 남은 승인 풀림, T 번호 주문 생성, `order.paid` 이벤트, 환불 미리보기 금액 일치 |
| 6 | 낙찰가 > 상한 입력 | 거절·보류 |
| 7 | 매입 직전에 Stripe 대시보드에서 승인을 취소 | `capture_failed`, 결제 링크 알림 |
| 8 | 같은 낙찰 요청을 두 번 보냄 | 매입 1회, 주문 1개 |
| 9 | 결제창을 열어 두고 45분 넘긴 뒤 승인 | 승인이 자동 취소됨 |
| 10 | 같은 상품에 두 번째 계정이 신청 | 거절 |

실제 마켓 입찰은 하지 않는다. 시험 건은 실제 경매 상품 주소를 쓰되 운영자가 입찰하지 않고 결과만 손으로 넣는다.

### 8.3 Ren 승인이 필요한 실제 시험

| 번호 | 시험 | 돈·외부 영향 |
|---|---|---|
| 1 | 운영 키로 실제 카드 승인 → 취소 1회 | 카드 승인 1건(청구 없음) |
| 2 | 실제 메루카리 경매 저가 상품(1,000엔 안팎) 1건을 수동 입찰 → 낙찰 → 매입 → 구매 | 실결제·실구매 1건 |
| 3 | 실제 경매 1건을 낮은 상한으로 신청해 밀리게 둔다 | 승인 1건(청구 없음), 실제 입찰 1회 |
| 4 | 2차: 워커로 실제 입찰 1건 | 실입찰·실결제 |

## 9. Ren 이 정할 것 (기본값 = 추천)

| 번호 | 정할 것 | 기본값 | 다른 선택지 |
|---|---|---|---|
| 1 | 돈 받는 방식 | 카드로 「승인만」 잡아 두고 낙찰됐을 때만 결제 | 미리 전액 결제 후 유찰 시 환불 |
| 2 | 입찰 대행 수수료 | 따로 받지 않음(기존 대행 주문과 같은 계산) | 낙찰 건당 정액(예: 300엔) / 낙찰가의 일정 비율 |
| 3 | 처음 입찰은 누가 넣나 | 운영자가 손으로(소량), 검증 뒤 워커로 | 처음부터 워커 |
| 4 | 지원 순서 | 메루카리 경매 먼저, 야후옥션은 나중 | 야후 먼저 / 동시 |
| 5 | 상한가 최대 | 처음 30,000엔, 워커 단계 100,000엔 | 다른 금액 |
| 6 | 동시에 받는 건수 | 처음 전체 5건·고객당 1건 | 다른 수 |
| 7 | 하루 총 입찰 상한 | 처음 100,000엔 | 다른 금액 |
| 8 | 마감 임박 거절 | 손 입찰 단계 3시간 전, 워커 단계 1시간 전 | 다른 시간 |
| 9 | 송료를 모르는 출품 | 받지 않음 | 정액 예상치를 넣고 받음(차액은 우리 부담) |
| 10 | 밀렸을 때 상한 올리기 | 처음에는 없음, 워커 단계에서 추가 | 처음부터 넣음 |
| 11 | 낙찰했는데 결제가 실패한 고객 | 48시간 안 재결제, 안 하면 입찰 정지·상품은 우리가 보유 | 다른 기한 |
| 12 | 같은 상품에 두 회원이 신청 | 먼저 승인된 한 명만 | 둘 다 받고 높은 상한으로 입찰 |

## 10. 확인 못 한 것

| 항목 | 상태 |
|---|---|
| 카드 승인 유효 기간(카드사별 일수) | 문서로 확인하지 않았다. 설계는 Stripe 가 주는 `capture_before` 를 정본으로 쓰고 96시간 제한을 둔다. M2 에서 실측한다 |
| 수동 매입 결제창의 완료 시 `payment_status` 값 | `unpaid` + PaymentIntent `requires_capture` 로 알고 있다. M2 에서 실측한다 |
| 카카오페이·네이버페이의 사전 승인 지원 | 확인하지 않았다. 카드만으로 설계했다 |
| 환불·승인 취소 때 Stripe 수수료 | 확인하지 않았다. (가)안 비교의 수수료 줄은 추정이다 |
| 메루카리 연장 길이 | 공식 도움말은 비공개, 공지는 5분. 설계는 길이를 가정하지 않는다 |
| tomo 메루카리 조회에서 `include_auction=true` 동작 | 에어쉽 실측만 있다. tomo 에서는 M0 에서 확인한다 |
| tomo 야후옥션 파서의 현재 동작 | 2026-09-07 중단 뒤 실행하지 않았다 |
| 에어쉽 낙찰 정산 함수(`_settle_bid_core`·`_auction_win_order`)·한도 검사에 연결 사이트 분기를 넣는 세부 | 함수 본문을 끝까지 읽지 않았다. W1 착수 전에 따로 설계·리뷰가 필요하다 |
| 에어쉽 메루카리 입찰기의 지금 운영 상태(켜짐 여부·최근 성공률) | 확인하지 않았다. 2차로 넘어가는 조건에 넣었다 |
| 에어쉽 야후 판매자 게이트·사전 점검 결과의 칸 이름 | 마이그레이션 제목만 확인했다 |
| 메루카리 경매 상품이 지금 tomo 에서 결제까지 가는지 | 14번과 같다. 코드에 막는 곳이 없다는 것만 확인했다(실결제 시험 안 함) |

## 부록. M0~M2 구현 기록 (2026-11-27)

- 범위: M0 잔여(메루카리 경매 정보 읽기) + M1(DB) + M2(승인만 결제창·확정·해제·매입). M3 이후(입찰됨·낙찰·주문 전환·크론·고객 화면·어드민)는 다음 작업자.
- 마이그레이션 번호가 설계와 다르다: **0049 는 자체 경매 알림 수정**(아래), 입찰 대행 M1 은 **0050_market_bids.sql**. 설계의 0050(정산)·0051(상한 올리기)은 **0051·0052** 로 한 칸씩 민다.
- 플래그 `NEXT_PUBLIC_MARKET_AUCTION` 은 운영 Variables 에 넣지 않았다. 운영 `market_bid_settings.accepting=false`.

### 0049 선행 수정(자체 경매)
- 낙찰자 결제창 거래가 pending_payment → cancelled 이고 같은 상품에 그 구매자가 낙찰자인 `awaiting_payment` 경매가 있으면, 양쪽 `tx_cancelled` 대신 낙찰자에게만 `auction_pay_expired`(「결제창이 만료됐어요. 낙찰은 그대로예요. 기한 안에 다시 결제해 주세요」). 판매자에게는 안 보낸다. 경매가 이미 unpaid 이거나 일반 거래면 예전대로 양쪽 tx_cancelled.
- 방법: notify_transaction 을 다시 쓰지 않고 `pg_get_functiondef` 로 지금 정의를 읽어 cancelled 두 줄만 조건문으로 바꿔 EXECUTE. 바꿀 글이 정확히 1번이 아니면 예외(CR 은 빼고 비교 — 윈도 CRLF·CI LF 둘 다).
- 리허설(운영 DB, begin + 0049 + 시험 + 예외): 4묶음 통과(결제 대기 경매 → 낙찰자 1건·판매자 0, unpaid 경매 → 양쪽, 일반 거래 → 양쪽, 다른 분기 글 유지). 0049 없이 돌리면 1번이 실패(결함 확인). 되돌리기 SQL 을 적용 뒤 돌리면 정의 md5 가 원본(8c981fcf…)과 같다. 적용 뒤 md5 ac5ab4fe…. 리허설에서 거래 번호 시퀀스 1개(TX000068)가 소모됐다(시퀀스는 롤백 안 됨).

### 0050 표·함수(M1)
| 객체 | 내용 |
|---|---|
| `market_bid_settings`(한 행) | accepting=false, sources {mercari}, cap_max_jpy 30000, max_open 5, max_open_per_user 1, daily_cap_jpy 100000(서울 날짜), min_lead_minutes 180, max_lead_hours 96, auth_margin_hours 12, pending_minutes 45, fee_jpy 0, executor manual. 누구나 읽기, 쓰기는 SQL 만(운영 화면은 M5) |
| `market_bids` | 4.1절 칸 + `seen_bids`·`auth_breakdown`·`auth_krw`·`authorized_at`·`capture_breakdown`·`capture_krw`·`closed_at`. 번호 `MB`+6자리. 유일: (user, request_id), 고객·상품당 진행 1건(pending_auth 포함), 상품당 승인된 진행 1건 |
| `market_bid_auths` | 승인 행(pending/authorized/captured/releasing/released/superseded/failed), `capture_before` |
| `market_bid_events` | 사건 기록(requested/authorized/auth_void/cancelled/expired/released/captured …) |
| `market_bid_blocks` | 입찰 정지 회원(M3 가 채운다) |
| `market_bid_amount(가격, 송료, 환율, 수수료)` | 금액 정본. round((가격+송료)×환율) + 8,000 + proxy_customs + round(수수료×환율). lib/market-bid.ts `marketBidAmount`·`proxyOrderTotal` 과 같음(단위 테스트) |
| `request_market_bid(...)` service_role 만 | 가드: 접수 스위치, 정지·탈퇴·미해결 capture_failed·차단 회원, 한국 회원만(KRW), 지원 마켓, 송료 모름(null) 거절, 마감 3시간 이내·96시간 초과 거절, 상한가 최소(입찰 0건 = 시작가, 있으면 현재가+100엔)·최대 30,000엔, 주소·통관부호, 다른 회원 승인 선점 거절, 본인 중복 거절(본인 결제창 대기는 expired 로 바꾸고 새 신청), 고객당 1건, 전체 5건, 하루 100,000엔. 환율 = exchange_rates JPY_KRW(lib/fx-refresh 가 적용한 값) 고정 저장. 같은 request_id 는 같은 행 |
| `market_bid_attach_session(신청, 세션, 금액)` | 결제창 연결, 금액이 auth_krw 와 다르면 거절, 앞 창은 superseded 로 바꾸고 만료 대상 돌려줌 |
| `market_bid_authorized(세션, PI, 금액, capture_before)` | 승인 확정. 거절 조건(옛 창·신청이 대기 아님·금액·`마감+12시간 > capture_before`·같은 상품 선점)이면 승인 행 releasing + 알림 mb_auth_void + `release_auth_id` 반환. 재진입은 ok·again. 같은 상품은 advisory lock 으로 줄 세움 |
| `cancel_market_bid(id)` 고객·운영자·서버 | pending_auth·authorized 만. 승인됨이면 승인 행 releasing, 알림 mb_cancelled. 두 번째 호출은 again |
| `market_bid_expire_pending()` | 결제창 대기 45분 넘은 신청 → expired(M3 크론이 부른다) |
| `market_bid_auth_released(승인)`·`market_bid_auth_captured(승인, 원)` | Stripe 호출 뒤 기록(멱등). 매입은 승인액 이하만 |
- 리허설(운영 DB, begin + 0050 + 시험 블록 + 예외, 시험 회원 4명·상품 4개는 트랜잭션 안에서 만들고 사라짐): **48단언 통과** — 접수 꺼짐, 신청·번호·금액·통관부호 대문자화, 멱등(다른 상한가로 재요청해도 같은 행), 금액 불일치 연결 거절, 승인·capture_before·재진입·알림 1건, 고객당 2건째 거절, 같은 상품 다른 회원 거절(item taken), 본인 중복, 96시간 초과·3시간 이내(2시간 59분) 거절, 상한 초과·미달(입찰 0건 시작가 포함), 송료 모름, 통관부호·주소, 야후 거절, 일본 회원 거절, 하루 상한·전체 건수, 같은 상품 두 회원 결제창 → 먼저 승인된 쪽만·뒤 승인 해제·알림, 유효 기간 부족 해제, 옛 창 승인 해제(신청 유지), 만료 뒤 승인 해제, 남의 신청 취소 거절·본인 취소·멱등·해제 기록 멱등·알림, 매입 초과 거절·부분 매입·멱등, 입찰 뒤 취소 거절, 차단·미해결 매입 실패 회원 거절, 권한(고객 직접 신청·수정·승인 함수 거절, 남의 신청·승인 행 0행). 결함 주입 4종(고객당 한도·유효 기간·취소 상태·96시간 검사 제거)이 각 단언에서 실패. 적용 전 객체 0 확인 → 적용 → 표 5·함수 10·정책 5 확인.

### M2 서버·API
- `lib/stripe.ts createSession({ manual: true })`: `payment_intent_data.capture_method = "manual"`, 결제수단 카드만. 일반 결제(tx·po)는 그대로(단위 테스트가 capture_method 없음을 확인).
- `lib/market-bid.server.ts`: `openBidCheckout`(열린 창 재사용·완료 창은 확정 경로·앞 창 만료), `settleMarketBidSession`(metadata.app=APP_TAG·kind=mb 만, PI requires_capture 만 확정, capture_before 저장, DB 거절이면 즉시 해제), `releaseAuth`(releasing 행만 PaymentIntent cancel, 키 `mb_cancel_<승인 id>`, 이미 canceled 면 성공), `captureAuth`(승인액 이하, `amount_to_capture`, 키 `mb_capture_<신청 id>`, 이미 매입된 PI 는 Stripe 값으로 기록).
- 웹훅·복귀(`/api/stripe/webhook`·`/api/stripe/return`): metadata.kind === "mb" 를 먼저 분기한다. 복귀는 `/global/<source>/<id>?mb=ok` 또는 `?mb=fail&code=<사유>`(예 BID_EXPIRED). M4 가 `/bids/[id]` 를 만들면 바꾼다.
- `/api/market-bid`: 플래그 없으면 404. POST = 같은 request_id 면 마켓을 다시 읽지 않고 이어감 → 아니면 서버가 메루카리를 다시 읽어(`bidFacts`) 경매·진행·송료 확인, seenPrice 가 다르면 409 mb.err.changed + 지금 값 → external_items 행 없으면 fetched_at=epoch 로 만든다(장바구니 15분 신선도 통과 못 하게, B0 차단 유지) → request_market_bid(service_role) → 결제창 URL. DELETE = cancel_market_bid(본인 세션) → 결제창 만료·승인 해제(실패하면 releasing 으로 남아 M3 크론 몫).
- M0: `MarketItemDetail.auctionInfo`(price·bids·startPrice·endsAt·state·open). `mercariAuctionInfo` 실측 응답 기준. 일본 내 송료는 `shippingIncluded`(送料込み) → 0, 그 밖(着払い·未定) → null → 거절.

### Stripe 테스트 모드 실측(로컬 next dev, 운영 DB, 테스트 키, 카드 4242, 상품은 실제 메루카리 경매 주소지만 입찰은 안 함)
| 확인 | 결과 |
|---|---|
| 승인만 결제창 완료 | Checkout Session `status=complete`, **`payment_status=unpaid`**, PI **`requires_capture`**, `capture_method=manual`, `amount_capturable`=승인액. 이벤트: payment_intent.created → charge.succeeded(captured=false) → payment_intent.amount_capturable_updated → checkout.session.completed(unpaid) |
| capture_before | 시험 Visa(US) 승인 시각 + **7일**(2026-11-27 07:54 → 12-04 07:54). 한국 발급 실카드 값은 확인 못 함(실결제 금지). 정본은 저장한 값 |
| 금액 | MB000001 상한 3,600엔 → 승인 ₩43,091 = 31,901 + 8,000 + 3,190(서버·DB 계산 일치) |
| 부분 매입 | 낙찰가 3,000엔 가정 → ₩37,243 매입: PI succeeded, amount_received 37,243, amount_capturable 0, charge amount_refunded 0(남은 5,848원은 환불이 아니라 승인 해제로 처리됨) |
| 매입 멱등 | DB 를 매입 전으로 되돌리고 다시 호출 → 같은 키라 Stripe 1회, 기록만 다시 captured 37,243 |
| 고객 취소 | MB000002 승인 뒤 DELETE → 신청 cancelled, 승인 행 released, PI `canceled`(charge amount_refunded 0), 알림 mb_cancelled. 두 번째 DELETE 도 200(멱등) |
| 만료 뒤 승인 | MB000003 결제창을 연 채 신청을 expired 로 만든 뒤 결제 → 복귀 `?mb=fail&code=BID_EXPIRED`, 승인 행 released(bid expired), PI canceled, 알림 mb_auth_void |
| 웹훅 | 실제 checkout.session.completed 이벤트 본문을 로컬 비밀로 서명해 보냄 → 200(재진입, 상태 그대로), 틀린 서명 400 |
| 거절 | 상한 미달 409 capLow(최소 2,500엔), 초과 409 capHigh, 화면 가격 다름 409 changed, 着払い 경매 409 shipping |
- 정리: 시험 신청 3·승인 3·사건 12·알림 4·external_items 4행 삭제, `market_bid_code_seq` 1부터 다시, accepting=false. Stripe 테스트 PI 는 1건 매입(테스트 돈)·2건 취소로 남음.

### M3~M5 작업자가 알아야 할 것
1. 번호: 다음 마이그레이션은 **0051**(정산·크론). 0051 에서 ops_outbox 종류·크론(`market_bid_expire_pending` 호출, releasing 행 재해제는 서버 경로 `releaseAuth`), 입찰됨·밀림·낙찰·주문 전환 함수를 더한다.
2. 낙찰 매입 금액은 `market_bid_amount(final_price, final_ship, rate, fee_jpy)` 로 계산해 `capture_krw` 에 저장하고 `captureAuth(authId, capture_krw)` 를 부른다. `capture_krw > auth_krw` 면 승인액까지만 매입하고 차액을 loss_recorded 로(1.2절). `market_bid_auth_captured` 는 승인 행만 바꾼다. 신청 상태 won → ordered 는 M3 함수.
3. 승인 해제가 실패하면 승인 행이 `releasing` 으로 남는다(`market_bid_auths_releasing` 색인). 크론이 `releaseAuth` 를 다시 부르면 된다(멱등 키 같음).
4. 매입 멱등 키는 신청 id 기준이다. 같은 신청을 다른 금액으로 다시 매입하면 Stripe 가 키 충돌로 거절한다(설계 의도). Stripe 멱등 키 보관은 24시간이라 그 뒤 재시도는 PI 상태로 판정한다(코드가 이미 그렇게 한다).
5. 고객 취소 알림·승인 해제 알림은 0050 이 만든다(mb_authorized·mb_cancelled·mb_auth_void). 나머지 알림 kind(mb_placed·mb_outbid·mb_won·mb_lost·mb_missed·mb_hold·mb_pay_needed)는 M3·M4 가 NOTIF_KINDS·i18n 과 같이 더한다(tests/unit/market-bid.test.ts 가 SQL notify kind 를 검사).
6. 1차는 한국 회원(KRW)만 받는다(`mb: country`). 일본 회원은 메루카리 탭을 보지 않으므로 막았다.
7. 고객 화면(M4)은 오류 키 `mb.err.*` 와 409 응답 `facts`(지금 가격·입찰 수·마감)를 쓰면 된다. 최소 상한가는 `minCapJpy`.
8. 운영 키(sk_live)로는 아무것도 안 했다. 실카드 사전 승인 1회는 8.3절 1번(Ren 승인 필요).
## 부록. M3~M5 구현 기록 (2026-11-27)

- 범위: M3(정산·크론, `0052_market_bid_settle.sql`) + M4(고객 화면) + M5(tomo 어드민·운영 API) + 에어쉽 연결 사이트 「마켓 입찰」 화면(설계 A3 몫 중 화면 1개). 다음은 M6(리허설·1차 켜기).
- 번호: 설계의 0050(정산) = **0052**(0051 은 거래 임베드 수정이 썼다). 다음 마이그레이션은 **0053**.
- 플래그 `NEXT_PUBLIC_MARKET_AUCTION` 은 운영 Actions Variables 에 넣지 않았다(server-image.yml 에 전달 줄만 추가 — 변수가 없으면 꺼짐). 운영 `market_bid_settings.accepting=false`.

### 0052(M3) 함수·크론
| 객체 | 하는 일 |
|---|---|
| `market_bid_set_placed(신청, 금액, 증빙 메모, expected, 마감?)` | 운영자·서버. authorized·outbid·hold·placed → placed. 금액 ≤ 상한가, 앞 입찰보다 높게, 마감 전, 승인 행이 살아 있을 때만. 첫 입찰 `placed`, 그 뒤 `rebid` 사건. 알림 mb_placed |
| `market_bid_set_outbid(신청, 남의 현재가)` | placed → outbid(승인 유지). 알림 mb_outbid |
| `market_bid_hold(신청, 사유)` | authorized·placed·outbid → hold(승인 유지). 알림 mb_hold, 이벤트 bid.hold |
| `market_bid_set_won(신청, 낙찰가, 송료?, 메모, expected)` | placed·outbid·hold → won + 매입액(`market_bid_amount`, 고정 환율) 저장. **낙찰가 > 상한가 · 매입액 > 승인액 · 메루카리 낙찰가 ≠ 우리 마지막 입찰액 · 승인 행이 authorized 아님** → 거절하고 hold(예외 아님, 반환 status=hold). 같은 낙찰가로 다시 부르면 `again`(이중 처리 멱등) |
| `market_bid_capture_failed(신청, 사유)` | 서버만. won → capture_failed, 승인 행 failed, 알림 mb_pay_needed, 이벤트 bid.capture_failed |
| `market_bid_to_order(신청)` | 서버만. 승인 행 captured·금액 일치 뒤에만. proxy_orders(pending_payment → paid, PI·세션 = 그 승인, paid_krw = 매입액, rate = 고정 환율, ship_pccc) + proxy_requests(requested → paid, quote_item_price = 낙찰가 + 송료, NARITA) → ordered. 기존 트리거가 order.paid·proxy_paid. 알림 mb_won. order_id 가 있으면 그대로 돌려준다 |
| `market_bid_release(신청, lost\|missed\|cancelled, 사유, 본 낙찰가?, expected)` | lost = placed·outbid·hold 이고 입찰 기록 있음 + 본 낙찰가 필수 + 본 낙찰가 ≠ 우리 마지막 입찰액. missed·cancelled = authorized·hold 이고 입찰 기록 없음. 승인 행 releasing(서버가 Stripe 해제) |
| `cron_market_bids()` | pg_cron `tomo_market_bids` 1분(DB 만): 결제창 45분 만료, **마감 30분 전 authorized → missed + 해제 예약 + 알림**, placed·outbid 가 마감 + 15분 → hold(result overdue), 승인 만료 24·6시간 전 bid.auth_expiring. cron_runs job=market_bids |
| `/api/cron/market-bids` | pg_cron `tomo_market_bids_stripe` 1분(x-cron-secret): releasing 승인 해제 재시도, won 2분 넘은 건 매입·주문 전환 재시도. 할 일이 있을 때만 cron_runs job=market_bids_stripe |
| 조회 | `admin_market_bids(탭, q)`·`admin_market_bid_detail`·`market_bid_ops_counts`(운영자·서버), `my_market_bid_events`(본인, 고객용 종류만), `admin_market_bid_settings(jsonb)`(운영자, 범위 검사) |
| 이벤트 | 트리거 `market_bids_ops_event`: authorized → bid.requested, hold → bid.hold, won → bid.won, missed → bid.missed, capture_failed → bid.capture_failed. ops_outbox 제약 19종 |
| 권한 | 조작 함수는 `is_admin_user()` 또는 service_role(`market_bid_actor_ok`). 주문 전환·매입 실패·크론은 service_role 만(authenticated 실행 권한 없음) |
| 추가 | `can_read_client_item` 에 market_bids 한 줄(신청 고객이 고객 입력 상품 행을 읽는다 — 신청 상세 제목·사진) |

### 서버·화면
- `lib/market-bid.server.ts`: `settleWon`(DB 매입액으로 `captureAuth` → `market_bid_to_order`. PI 가 canceled 면 capture_failed, 그 밖 오류는 won 유지 = 크론 재시도), `runMarketBidStripeCron`. 결제 복귀 = `/bids/<신청 id>?mb=ok|fail`.
- `lib/market-bid-ops.ts`: 조작 본체(`runMbOp`·`saveMbSettings`) — tomo 어드민 `/api/admin/market-bids`(쿠키 운영자 세션)와 운영 API 가 같이 쓴다. `lib/market-bid-admin.ts`: 라벨·탭·조작 권한(`MB_OP_SCOPE`)·상태별 조작(`mbOpsFor`)·지연(`mbAging`)·오류 문구.
- 고객(M4, 플래그 켜진 빌드만): 상세 `components/market-bid/MarketBidPanel.tsx`(현재가·입찰 수·남은 시간, 상한가 입력, 최대 결제액 내역 — 환율 구성 숫자 없음, 카드만·승인 안내·환불/해제 규칙 문구, 배송지·통관부호, 동의 3개). 막히는 경우 문구: 접수 중단·비로그인·한국 회원 아님·송료 모름·마감 3시간 이내·96시간 초과·내 진행 신청 있음(그 신청으로 링크). `/bids/[id]`(상태·최대 결제액·우리 입찰·낙찰가·결제된 금액·주문 링크·진행 기록·입찰 전 취소, 30초 새로 읽기), `/mypage/bids`(진행 중·끝난 신청, 메뉴는 플래그 있을 때만). 알림 ko/ja 7종 추가(mb_placed·outbid·won·lost·missed·hold·pay_needed), 알림을 누르면 `/bids/<id>`. 플래그가 꺼지면 상세는 기존 「경매 · 구경만」, `/bids`·`/mypage/bids` 404.
- tomo 어드민 `/admin/market-bids`: 탭(입찰 필요·입찰 중·보류·낙찰·구매 필요·끝남·전체), 줄마다 메루카리 링크·신청 때 현재가·송료·상한가·우리 입찰·마감(남은 시간)·승인액·지연 배지. 상세 시트: 상태별 조작 버튼, 낙찰 처리는 매입 금액 미리보기(상품+송료·국제배송·통관·합계 vs 승인액, 넘거나 우리 입찰액과 다르면 빨간 경고) → 「낙찰 처리 실행」 → 확인창(두 번 확인). 접수 스위치·한도 폼과 수동 입찰 절차는 접힌 칸. 메뉴 「마켓 입찰」 배지 = 입찰 필요 + 보류 + 구매 필요 + 매입 실패, 대시보드 처리 대기 줄 3개.
- 운영 API: capability `market_auction`, 경로는 docs/aaa/12 9.4, counts 4줄, 이벤트 9.5.

### 운영자 수동 입찰 절차서(1차)
1. `/admin/market-bids` 「입찰 필요」(또는 에어쉽 연결 사이트 「마켓 입찰」)를 연다. 마감이 가까운 줄부터 처리한다. 마감 30분 전까지 입찰됨이 기록되지 않으면 자동 취소(승인 해제·고객 알림)된다.
2. 줄의 ↗ 로 메루카리 상품을 연다. 확인할 것: 경매가 진행 중인가, 송료가 출품자 부담(送料込み)인가, 専用·取り置き 표기가 없는가. 하나라도 어긋나면 입찰하지 않고 「보류」에 사유를 적는다.
3. 우리 메루카리 계정으로 **필요한 최소 금액만** 넣는다: 입찰 0건이면 시작가, 있으면 현재가 + 100엔. 상한가를 그대로 넣지 않는다. 그 금액이 상한가를 넘으면 넣지 않는다(밀린 채 둔다).
4. 입찰 직후 메루카리 화면에서 우리 입찰액과 마감 시각을 확인한다. 「입찰됨 기록」에 금액, 마감(바뀌었으면), 증빙 메모(확인 시각·화면에 보인 내용)를 적는다.
5. 제출 중 시간 초과·재로그인 요구 등으로 들어갔는지 모르면 「보류」(사유: 제출 여부 불명)로 두고 메루카리 화면에서 확인한다. 안 들어간 것이 확실하면 「못 넣음」(돈 권한, 승인 해제), 들어갔으면 「입찰됨 기록」.
6. 다른 사람이 더 높게 넣으면 「밀림」(남의 현재가)을 적는다. 상한가 안이면 3~4 를 다시 한다.
7. 마감 뒤 우리가 최고가면 「낙찰 처리」: 낙찰가 = 우리 마지막 입찰액, 송료(출품자 부담이면 0) → 매입 금액 확인 → 실행(확인 두 번). 카드 매입과 대행 주문(T 번호)이 생긴다. **24시간 안에** 메루카리에서 구매하고, 그 뒤는 기존 대행 주문 흐름(구매 → 센터 → 발송)이다.
8. 다른 사람이 낙찰했으면 「유찰 처리」에 본 낙찰가를 적는다(우리 마지막 입찰액과 같으면 거절된다 — 그럴 땐 낙찰인지 다시 본다). 출품자가 경매를 지웠으면 0.
9. 마감 + 15분이 지나도 결과를 안 넣으면 자동으로 「보류(결과 지연)」가 된다. 보류는 승인 만료 전에 반드시 푼다(상세의 「승인 만료」 시각).

### 검증
- SQL 되돌림 리허설(운영 DB, begin + 0052 + 시험 블록 + 예외): **15묶음 통과** — 신청·승인·bid.requested 이벤트, 비운영자 조작·조회·주문 전환 거절과 실행 권한, 입찰됨(상한 초과·상태 불일치·메모 없음 거절, 알림·활동 기록), 밀림 → 다시 입찰(낮은 금액 거절), 낙찰가 > 상한 거절·보류·bid.hold, 낙찰가 ≠ 우리 입찰 보류, 정상 낙찰 매입액 = market_bid_amount, 이중 낙찰 처리 멱등(won 사건 1개), 매입 기록 전 주문 전환 거절 → 주문 T 번호·paid·PI·paid_krw·통관부호·`proxy_order_amount` = 매입액·요청 paid·order.paid·mb_won, 두 번째 전환 같은 주문, 기존 `admin_cancel_proxy` 부분 환불 10,000원 → refunds(PI = 그 승인, 부분), 유찰(입찰 없는 건·본 낙찰가 = 우리 입찰·낙찰가 없음 거절), 매입액 > 승인액 거절·보류(매입액 저장 안 함), 제출 불명 보류 → 입찰 없는 보류는 못 넣음·입찰 있는 보류는 해제 거절, 크론 마감 30분 전 자동 취소·결제창 만료·두 번째 실행 변화 0, 결과 지연 보류(승인 유지), 운영 조회·고객 기록 본인만, 매입 실패는 서버만·설정 범위 검사·비운영자 설정 거절. 결함 주입 5종(매입액 > 승인 검사·looks won·주문 한 번만·30분 자동 취소·조작자 검사 제거)이 각 단언에서 실패. 적용 뒤 함수 18·트리거 1·크론 2·제약 확인, accepting=false.
- Stripe 테스트 모드 로컬 한 바퀴(next build+start, 플래그 켬, NEXT_PUBLIC_SITE_URL=http://localhost:3100, 운영 DB, 테스트 키, 카드 4242, 실제 메루카리 경매 주소지만 실제 입찰 없음, 접수 스위치는 시험 동안만 켬): alice(localhost) 신청 패널 최대 결제액 ₩37,243(상한 3,000엔) → Stripe 승인 → `/bids/<id>?mb=ok`(입찰 준비 중) → center(center.localhost) 어드민 입찰됨 1,600엔 → 낙찰 처리 미리보기 ₩23,595 → 실행 → PI succeeded·amount_received 23,595·amount_capturable 0, 주문 T000027 paid(paid_krw 23,595) → 어드민 대행 취소 부분 환불 ₩10,000 → Stripe 환불 done(charge amount_refunded 10,000). 두 번째 신청(상한 4,500엔) → 승인 → 입찰됨 3,800엔 → 유찰(본 낙찰가 3,800 → looks won 거절, 5,000 → lost) → PI canceled(환불 아님). 운영 API(로컬, 서명): meta 에 market_auction, 목록 200, counts 4줄, ops scope 로 won·settings → 403 money scope required, expected_status 불일치 409.
- 정리: 시험 신청 2·승인 2·사건 11·알림 9·주문 1·대행 요청 1·환불 1·활동 기록 5·outbox 5·ops_requests 1·external_items 2 삭제, `market_bid_code_seq` 1부터, accepting=false. 시퀀스 소모: 대행 주문 번호 T000027(시험) 등은 되돌리지 않았다(빈 번호). Stripe 테스트 PI 2건(1건 매입·부분 환불, 1건 취소)은 테스트 모드에 남음. 에어쉽 connected_site_events 에 시험 이벤트 5건(bid.requested 2·bid.won·order.paid T000027·refund.pending)이 전송됐다(정리는 에어쉽 기록 참고).

### 다음 작업자(M6)가 알아야 할 것
1. 켜기 순서: 리허설 10항목(8.2절) → Ren 승인 → Actions Variables `NEXT_PUBLIC_MARKET_AUCTION=1` + 재빌드 → 어드민에서 접수 켜기. 끄기는 반대(접수 멈춤이 즉시, 플래그는 재빌드).
2. 매입 실패(capture_failed) 뒤 재결제 링크는 없다(알림은 「고객센터에서 결제 방법 안내」). 1차는 운영자가 일반 결제로 처리한다.
3. 상한 올리기(M7)·워커 연결(W1·W2)·야후(Y1)는 없다. `executor` 는 manual 고정.
4. 입찰 대행 수수료(`fee_jpy`)는 0. 0 이 아니면 주문의 service_fee 에 통관 + 수수료가 들어가 `proxy_order_amount`(수수료 모름)와 주문 total 이 달라진다 — 수수료를 켜기 전에 환불 미리보기 규칙을 같이 고친다.
5. 화면 캡처 중 「신청 패널」 1장은 시간 초과로 남기지 못했다(패널 높이 1,100px). → M6 에서 남김(아래 부록).

## 부록. M6 실결제 없는 리허설 기록 (2026-11-27)

- 환경: 로컬 `next build`+`start`(포트 3100, `NEXT_PUBLIC_MARKET_AUCTION=1`, `NEXT_PUBLIC_SITE_URL=http://localhost:3100`), 운영 DB, Stripe **테스트 키**(대시보드 시험 모드 화면에서 읽어 임시 파일에만 두고 끝나고 지움), 카드 4242. 고객 alice = `localhost`, 운영자·두 번째 고객 = `center.localhost`(주소별 쿠키라 운영 사이트 쿠키는 바꾸지 않음). 상품은 실제 메루카리 경매 주소, 실제 입찰은 하지 않음.
- 접수 스위치(accepting)와 고객당 한도(1 → 5)는 시험 동안만 바꾸고 원래대로 되돌렸다.
- 시각 당기기는 시험 행만 SQL 로 했다. 크론 판정은 `cron_market_bids()` 를 분 중간에 직접 불렀고, 해제는 로컬 `/api/cron/market-bids` 로 바로 했다(운영 크론이 운영 키로 시험 PI 를 건드리지 않게).
- 텔레그램 시험 알림: 로컬 감시 스크립트가 시험 계정의 `ops_outbox` 행(bid.* 15·order.paid 2)을 운영 전송 크론(1분)보다 먼저 지웠다. 보내진 시험 이벤트 0건.

### 10항목 결과
| 번호 | 항목 | 결과 | 확인 |
|---|---|---|---|
| ① | 승인 | 통과 | MB 신청 → 결제창(카드만) → `/bids/<id>?mb=ok`「입찰 준비 중」, 승인 행 authorized, `capture_before` = 승인 + 7일 |
| ② | 마감 20분 전으로 당겨 자동 취소 | 통과 | 크론 missed 1 → 승인 해제 → PI canceled(환불 아님), 알림 mb_missed |
| ③ | 입찰 뒤 마감 과거 → 보류 | 통과 | 크론 overdue 1 → hold(result overdue), 승인 유지, 어드민 「보류」 탭 |
| ④ | 유찰 | 통과 | 입찰됨 3,700엔 → 유찰(본 낙찰가 5,000) → lost, PI canceled |
| ⑤ | 낙찰·부분 매입·T 번호·환불 미리보기 | 통과 | 승인 ₩37,243 → 매입 ₩36,267(PI amount_received 36,267, capturable 0), 주문 paid, 대행 취소 화면 환불 계산값 36,267 = 매입액 |
| ⑥ | 낙찰가 > 상한 | 통과(고침) | 6,000엔 > 상한 5,500 → 거절·보류. 고친 것: 확인창이 「매입한다」고 쓰던 것, 거절 사유가 영문이던 것 |
| ⑦ | 매입 직전 승인 취소 → capture_failed | 통과(새 기능) | Stripe 에서 PI 취소 → 낙찰 처리 → capture_failed, 알림 mb_pay_needed. 고객 재결제(0053)로 T 번호 주문까지 |
| ⑧ | 이중 낙찰 요청 | 통과 | 같은 요청 동시 2회 + 1회 더 → 주문 1개, won 사건 1개, Stripe 매입 1회 |
| ⑨ | 결제창 45분 넘긴 뒤 승인 | 통과(문구 고침) | 신청 expired → 결제 → 승인 즉시 해제(PI canceled), 알림 mb_auth_void. 고친 것: 「카드 승인이 끝나지 않았어요(BID_EXPIRED)」 → 설명 문구 |
| ⑩ | 같은 상품 두 번째 계정 | 통과(고침) | 제출 거절 「다른 회원이 먼저 입찰 신청했어요」. 고친 것: 폼을 다 채우기 전에 패널에서 바로 보이게 |

### 이전 작업이 남긴 것 처리
| 항목 | 처리 |
|---|---|
| (a) 매입 실패 뒤 재결제 경로 | `0053_market_bid_repay.sql`(운영 적용). 매입 실패 때 결제 기한 = +48시간. 고객 `/bids/<id>` 의 「○원 결제하기」 → 즉시 결제 창(kind `mbp`, 금액 = 낙찰 매입액) → 새 승인 행(captured) → 기존 주문 전환. 옛 창·기한 지남·금액 다름 결제는 전액 환불(키 `mbp_refund_<PI>`). 기한 + 35분이 지나면 크론이 신청을 닫고 입찰 정지(`market_bid_blocks`), 알림 mb_pay_expired. 되돌림 리허설 10묶음 통과·결함 주입 4종(금액 검사·닫힘 검사·정지·수수료 제약 제거) 각각 실패 확인 뒤 적용. 실화면: 재결제 → T 주문 paid 42,116원, 기한 지남 → PUT 409·「결제 기한 지남(신청 정지)」 |
| (b) 수수료 ≠ 0 | 수수료는 설정 화면에 칸이 없다(SQL 로만 바뀜). 표 제약 `fee_jpy = 0`(설정·신청 둘 다)으로 막았다 |
| (c) 플래그 꺼짐 200 | `proxy.ts` `isFlagOffPath` 가 스트리밍 전에 404 로 바꾼다. 꺼진 빌드 실측: `/mypage/bids`·`/bids/<id>`·(경매 플래그 없을 때)`/mypage/auctions` 404, `/mypage` 200 |
| (d) 패널 높이 | 저장 배송지가 있으면 배송지를 한 줄로 접는다(빈 칸이 있으면 제출 때 펼침). 통관부호 칸은 밖에 둔다. 390px 높이: 저장 배송지 있음 약 830px, 없음 약 1,200px |

### 고객 눈으로 본 문구·흐름에서 고친 것
1. 검색 카드·상세 배지가 「경매 · 구경만」이었다 → 입찰 대행이 켜지면 「경매」.
2. 패널 머리 「입찰 / 입찰 2건」 중복 → 「입찰 수 / 2건」.
3. 신청 상세·마이페이지 제목이 일본어 원문 → 신청 때 한국어 번역을 한 번 저장.
4. 알림에 어느 신청인지 없었다 → 알림 보조 줄에 MB 번호.
5. 매입 실패 뒤 기한이 지나도 상태가 「결제가 필요해요」 → 「결제 기한 지남(신청 정지)」.
6. 어드민 사건 기록이 영문 종류(requested·placed…) → 한국어 이름.
- 그대로 둔 것: Stripe 결제창 버튼 이름 「결제」(승인만 하는 창도 Stripe 가 그렇게 쓴다 — 패널·창 제목에 「최대 결제액 승인」을 적어 둠). 승인만 결제창에 브라우저 저장 카드 자동 채우기가 뜬다(시험 때 실카드가 채워지는 것을 막고 진행).

### 정리(운영 DB)
- 삭제: market_bids 8 · market_bid_auths 9 · market_bid_events 41 · market_bid_blocks 1 · 대행 주문 2(T000034·T000035) · 대행 요청 2 · 알림 25 · 활동 기록 10 · external_items 4 · ops_outbox 17(전송 전). 기준값과 같음(proxy_orders 21 · proxy_requests 23 · external_items 13 · refunds 3).
- `market_bid_code_seq` 1부터, accepting=false, max_open_per_user=1.
- 남은 것: 빈 번호(T000031~T000035, MB 는 재시작), cron_runs 의 market_bids 실행 기록(시스템 로그, 운영 크론과 섞여 있어 두었다). Stripe 테스트 모드 PI 9건(2건 매입·나머지 취소)은 시험 모드에 남는다.

### 화면 캡처
- 신청 패널 390px(저장 배송지 없음): `docs/aaa/shots/m6-panel-390.jpg`
- 신청 상세(승인됨) 390px: `docs/aaa/shots/m6-bid-authorized.jpg`
- 어드민 입찰 필요 줄: `docs/aaa/shots/m6-admin-to-place.jpg`
- 낙찰 처리 확인(매입 금액 미리보기): `docs/aaa/shots/m6-admin-won-confirm.jpg`

## 운영자 수동 입찰 절차서 (1차, M6 개정)

준비: tomo 운영자 계정으로 `/admin/market-bids` 에 로그인한다. 우리 메루카리 계정이 로그인된 브라우저를 옆에 연다.

### A. 새 신청이 들어왔을 때(「입찰 필요」 탭)
1. `/admin/market-bids` 를 연다. 「입찰 필요」 탭이 기본이다(캡처 `m6-admin-to-place.jpg`).
2. 마감이 가까운 줄부터 처리한다. 마감 30분 전까지 「입찰됨」을 적지 않으면 자동 취소된다(승인 해제·고객 알림).
3. 줄의 ↗ 를 눌러 메루카리 상품을 연다.
4. 확인한다: 경매가 진행 중이다. 송료가 「送料込み」다. 専用·取り置き 표기가 없다.
5. 하나라도 어긋나면 입찰하지 않는다. 「열기」 → 「보류」에 사유를 적는다.
6. 우리 계정으로 **필요한 최소 금액만** 넣는다. 입찰 0건이면 시작가, 있으면 현재가 + 100엔이다.
7. 그 금액이 상한가를 넘으면 넣지 않는다. 그대로 두면 마감 30분 전에 자동 취소된다.
8. 입찰 직후 메루카리 화면에서 우리 입찰액과 마감 시각을 본다.
9. 「열기」 → 「입찰됨 기록」을 누른다. 넣은 금액, 바뀐 마감 시각, 증빙 메모(확인 시각·화면 내용)를 적는다. 「입찰됨 기록 실행」.
10. 제출 중 시간 초과·재로그인 요구로 들어갔는지 모르면 「보류」(사유: 제출 여부 불명)로 둔다. 메루카리 화면에서 확인한 뒤, 안 들어갔으면 「못 넣음」, 들어갔으면 「입찰됨 기록」.

### B. 마감 전까지(「입찰 중」 탭)
1. 다른 사람이 더 높게 넣으면 「밀림」에 그때 현재가를 적는다.
2. 상한가 안이면 A-6~A-9 를 다시 한다.

### C. 마감 뒤
1. 우리가 최고가면 「낙찰 처리」를 누른다. 낙찰가 = 우리 마지막 입찰액, 송료(출품자 부담이면 0)를 적는다.
2. 「매입 금액 확인」을 누른다. 매입 금액·승인액을 본다(캡처 `m6-admin-won-confirm.jpg`).
3. 빨간 경고(승인액 초과·우리 입찰액과 다름)가 보이면 실행하지 않는다. 메루카리 화면을 다시 본다.
4. 경고가 없으면 「낙찰 처리 실행」 → 확인창 「확인」. 카드 매입과 대행 주문(T 번호)이 생긴다.
5. **24시간 안에** 우리 계정으로 메루카리에서 구매한다. 그 뒤는 기존 대행 주문 흐름(구매 → 센터 → 발송)이다.
6. 다른 사람이 낙찰했으면 「유찰 처리」에 본 낙찰가를 적는다. 출품자가 경매를 지웠으면 0. 우리 마지막 입찰액과 같으면 거절된다 — 그때는 낙찰인지 다시 본다.
7. 마감 + 15분이 지나도 결과를 안 넣으면 자동으로 「보류(결과 지연)」가 된다. 보류는 상세의 「승인 만료」 시각 전에 반드시 푼다.

### D. 매입 실패(「낙찰·구매 필요」 탭의 빨간 「매입 실패」)
1. 고객에게 자동 알림이 간다. 고객은 신청 화면에서 48시간 안에 같은 금액을 다시 결제한다.
2. 고객이 결제하면 자동으로 「주문 생성」이 된다. C-5 부터 한다.
3. 기한이 지나면 신청이 닫히고 그 고객은 입찰 신청이 정지된다. 상품은 우리가 보유한다. 처리 방법은 운영자가 정한다.
4. 상세 「고객 재결제」 줄에서 기한·상태를 본다.

## 켜기·끄기 절차

### 켜기(Ren 승인 뒤)
1. GitHub `montsaintandco/tomo` → Settings → Secrets and variables → Actions → Variables 에 `NEXT_PUBLIC_MARKET_AUCTION` = `1` 을 넣는다.
2. Actions → `server-image` 를 다시 돌린다(또는 master 에 커밋 1개를 푸시한다).
3. `server-image`·`smoke` 가 success 인지 본다. `https://tomo.airship.click/api/health` 의 version 이 새 커밋인지 본다.
4. 메루카리 경매 상품 상세에 「경매 입찰 신청」 패널이 보이는지 본다(이때는 「지금은 입찰 신청을 받지 않아요」).
5. `/admin/market-bids` → 「접수 스위치·한도」 → 접수 켬 → 저장. 이때부터 신청을 받는다.

### 끄기
1. 즉시: `/admin/market-bids` → 접수 끔. 새 신청이 바로 막힌다. 진행 중 신청은 그대로 처리한다(크론·해제는 계속 돈다).
2. 화면까지 숨기기: Actions Variables 에서 `NEXT_PUBLIC_MARKET_AUCTION` 을 지운다 → `server-image` 다시 실행. 패널·`/bids`·`/mypage/bids` 가 사라진다(404). 진행 중 신청이 있으면 1 만 하고 다 끝난 뒤 2 를 한다.

## 실제 시험 4건 준비물(설계 8.3, Ren 승인 필요)

| 번호 | 시험 | 고를 상품 | 돈 | 예상 소요 |
|---|---|---|---|---|
| 1 | 운영 키 카드 승인 → 고객 취소 | 아무 메루카리 경매(조건은 2와 같음) | 승인만 약 2~4만 원, 청구 없음(취소로 풀림. 카드사에 따라 한도 복구 며칠) | 10분 |
| 2 | 실제 저가 경매 낙찰 → 매입 → 구매 | 메루카리 경매 중 送料込み, 현재가 300~1,000엔, 입찰 0~2건, 마감 4시간~3일 남음, 출품자 평가 좋음, 専用 표기 없음. 상한가 = 현재가 + 300엔 안팎 | 낙찰가 1,000엔 기준 약 9,000원 + 국제배송 8,000원 + 통관 예상 약 900원 = 약 1만 8천 원 실결제. 실제 물건이 들어온다 | 신청·입찰 30분 + 마감까지(첫 입찰 다음 날 20시대) + 구매 24시간 안 + 기존 대행 배송 |
| 3 | 낮은 상한으로 밀리게 두기 | 입찰이 많은(10건 이상) 인기 경매, 상한가 = 최소 금액 | 승인만(유찰 뒤 취소) | 신청 10분 + 마감까지 |
| 4 | 워커 실입찰(2차) | — | — | 지금은 할 수 없다. W1(에어쉽 워커 연결)·W2 를 먼저 만든다 |

- 1~3 은 같은 날 같이 할 수 있다(고객당 1건 한도라 고객 계정 3개 또는 한도를 잠시 3 으로).
- 2 의 낙찰 뒤 24시간 안 구매를 놓치면 우리 메루카리 계정이 이용 제한을 받을 수 있다. 시험 날 구매 담당을 정해 둔다.
- 시험 뒤 확인: Stripe 대시보드에서 1·3 의 PI 가 canceled, 2 의 PI 가 부분 매입(남은 승인 해제)인지 본다.