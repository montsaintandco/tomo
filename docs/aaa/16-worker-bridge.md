# 16. 에어쉽 입찰 워커 연결 (tomo 메루카리 경매 입찰 대행 W1·W2)

작성 2026-11-27. 설계만 담았다. 코드는 고치지 않았다.
Ren 지시: tomo 입찰 대행은 운영자 수동이 아니라 에어쉽 입찰 워커를 같이 쓴다. 수동 입찰은 예비 경로로 남긴다.
추천 기준: 운영 사고·돈 누락·고객 혼란이 가장 적은 쪽. 작업량은 근거로 쓰지 않았다.

읽은 기준: tomo `51bb096`(docs/aaa/15, 0050·0052·0053, lib/ops-bridge.ts), 에어쉽 `origin/migrate-vercel` `83401764`(worker/src, supabase/migrations, src/lib/connected).

## 0. 추천 한 줄

**(A) 에어쉽 `auction_bids` 에 「연결 사이트 건」 행을 넣는다.** 워커 코드는 고치지 않는다. 워커 재시작도 필요 없다. 돈·알림 경로는 DB 함수 맨 앞에서 끊는다. 낙찰은 워커 결과만으로 매입하지 않고 「낙찰 확인 대기 → 운영자 확인 → 매입」으로 시작한다.

## 1. 코드로 확인한 사실

| 항목 | 확인한 내용 | 근거 |
|---|---|---|
| 워커가 일을 집는 조건 | `auction_bids` 에서 `market='mercari'` 이고 `status in (requested, placed, outbid)` 인 행을 마감 순으로 50건 읽는다. 회원·출처로 거르지 않는다 | `worker/src/mercari-bid-run.ts` `processMercariBids` |
| 주기 | 기본 3초(`MERCARI_BID_MS`). 마감 직전 창(30초+15초)에는 2.5초 | `config.ts`, `mercari-bid-run.ts` |
| 입찰 시점 | 예약(reserve): 마감 lead(기본 120초, 어드민 설정 `mercari_lead_sec`) 안에서만 넣는다. 그 밖에서는 현재가·마감만 갱신한다. 즉시(instant)·입찰 0건(마감 미정)은 신청 직후 바로 넣는다 | `mercari-bid.ts` `plan`·`urgency` |
| 금액 | 현재가 + 100엔(입찰 0건이면 시작가). 마감 30초 안(`MERC_FINAL_MS`)에는 상한가 전액을 넣는다. 상한을 넘으면 넣지 않는다 | `mercari-bid.ts` `plan`·`nextAmount` |
| 재입찰(밀림) | lead 창 안에서 매 틱 다시 읽고, 최고가가 우리 것이 아니면 다시 넣는다. 메루카리는 자동입찰이 없어 워커가 반복한다 | `mercari-bid.ts` `tickBid` |
| 잠금 | 조건부 UPDATE 로 `worker_state='firing'` 선점. 상태·현재가가 판정 때와 같을 때만 잡는다. 2분 넘은 firing 은 다시 잡는다 | `mercari-bid-run.ts` `claim` |
| 발사 기록 | 발사마다 `auction_bid_fires` 한 줄 + 증거 사진(`auction-evidence` 버킷). `ok=true/false/null(접수 불명)` | `recordFire` |
| 낙찰 판정 | 마감 뒤 최고가가 「접수 확인된 우리 금액」과 같고, 상품명 앞 낙찰자 표기(`R*n`·`Y*L`)를 읽었을 때만 낙찰로 정산한다. 표기를 못 읽으면 정산하지 않고 관리자에게 알린다 | `mercari-bid.ts` 336행 부근, `oursFrom` |
| 결과 기록 | `settle()` → RPC `worker_settle_bid` → `_settle_bid_core` | `worker/src/db.ts` |
| 생존 신호 | `worker_heartbeat(name='mercari_bid')` + meta(enabled, dryRun, active, last_action, last_error, reauth). 5분 끊기면 `check_mercari_bid_heartbeat` 가 알린다 | `beat`, `20261022150000` |
| 로그인 풀림 | `reauth` → 10분 쉼 + 관리자 알림 「메루카리 로그인 필요」. 계정 입찰 제한(`利用制限中`)은 그 신청을 failed 로 닫고 10분 쉼 | `mercari-bid-run.ts` |
| 일일 한도 | `todayPlacedTotalJpy` 가 마켓·회원 구분 없이 `auction_bids` 전체를 센다. 한도 값은 세션 행 `daily_spend_cap_jpy` | `db.ts`, `budget` |
| 못 넣은 건 닫기 | 마감 5분 지난 `requested`(발사 0건)를 워커가 failed 로 닫는다. 워커가 죽어 있으면 아무도 닫지 않는다 | `failMissed` |
| 드라이런 | 환경 변수 `MERCARI_BID_DRY_RUN`(전체 공통). 행별 드라이런은 없다. 바꾸려면 워커 재시작이 필요하다 | `config.ts` 137행 |
| 전체 끄기 | 어드민 「경매 설정」 `auction_worker_settings.bid_enabled`(60초마다 읽음, 재시작 불필요). 에어쉽 고객 건도 같이 멈춘다 | `db.ts` `fetchWorkerSettings` |
| 상품당 한 건 | 유일 인덱스 `auction_bids_one_active_per_auction (auction_id) where status in (requested,bidding,placed,outbid)` | `20260919290000` |
| `auction_bids` 필수 칸 | `user_id uuid not null references auth.users`, `auction_id`, `title`, `url`, `max_bid_jpy`, `market`(yahoo/mercari 검사) | `20260728190000`, `20261020150000` |
| `auction_bids` 트리거 | `auction_bid_deposit`(예치·입찰한도, BEFORE), `zz_tg_bids_ins/upd`(텔레그램), `auction_bid_max_changed`(사건 기록), `auction_over_max_notice`(고객 알림), `auction_bid_extended_notice`(연장 알림) | 마이그레이션 grep |
| 낙찰 정산 | `_settle_bid_core`: 고객 알림 insert → `_auction_win_order`(에어쉽 주문 생성) → 바우처 결제 시도 → 관리자 알림 | `20261127180000_bid_limit.sql` 438행~ |
| tomo 자동 취소 | 0052·0053 크론의 「마감 30분 전 미입찰 → missed」는 **`executor='manual'` 만** 본다. `executor='airship'` 건에는 지금 자동 취소가 없다 | 0052 263행, 0053 96행 |
| tomo 설정 | `market_bid_settings.accepting`, `executor('manual','airship')` 칸이 이미 있다. 신청 때 설정의 executor 를 복사한다 | 0050 15·26·63·223행 |
| 운영 API 권한 | 조회·입찰됨·밀림·보류·유찰 = ops. 낙찰 매입·못 넣음·운영 취소 = money | 에어쉽 `src/lib/connected/ops-routes.ts` 30~38행 |
| tomo 검사 | 입찰됨: 금액 ≤ 상한, 직전 금액보다 큼. 낙찰: 낙찰가 ≤ 상한, 메루카리는 낙찰가 = 우리 마지막 입찰액. 어긋나면 보류 | 0052 86~91·150~152행 |

## 2. 태우는 방식 비교

| 항목 | (A) `auction_bids` 에 연결 사이트 행 | (B) 별도 표 `external_bid_jobs` + 워커 수정 | (C) 워커가 tomo 운영 API 폴링 |
|---|---|---|---|
| 워커 코드 변경 | **없음** | 큼(두 번째 Deps 묶음, 조회·잠금·발사 기록·정산 전부) | 큼 + 워커 PC 에 tomo 서명 키 |
| 워커 재시작 | **필요 없음** | 필요(Ren 승인) | 필요(Ren 승인) |
| 건드리는 에어쉽 돈 함수 | `_auction_bid_deposit`, `_settle_bid_core` 두 곳에 「맨 앞에서 돌려보내기」 | 없음 | 없음 |
| 건드리는 알림 트리거 | `_tg_bids_after`(표기만), `auction_over_max_notice`, `auction_bid_extended_notice` | 없음 | 없음 |
| tomo 건이 에어쉽 돈·주문·고객 알림을 타는 사고 지점 | 분기를 빠뜨린 함수. 아래 3중 방어로 막는다 | 없음 | 없음 |
| 같은 상품에 에어쉽 고객과 tomo 고객이 겹침 | **DB 유일 인덱스가 막는다** | 표가 달라 못 막는다. 우리 계정끼리 값을 올린다(돈 사고) | 못 막는다 |
| 일일 한도 | **그대로 걸린다**(합산) | 따로 세야 한다 | 따로 세야 한다 |
| 생존 신호·로그인 풀림 알림 | 그대로 걸린다 | 루프를 새로 달아야 한다 | 새로 달아야 한다 |
| 발사 기록·증거 사진 | 그대로 쌓인다(`auction_bid_fires` 가 `bid_id` 로 묶임) | 새 표 필요 | tomo 로 올려야 한다 |
| 어드민 접수 불명 해제·수동 정산 도구 | 그대로 쓴다(표시 분리만) | 새로 만든다 | 새로 만든다 |
| 같은 브라우저 다툼 | 없음(한 루프) | 두 루프가 한 브라우저를 쓴다 | 같음 |
| 판정 | **추천** | 비추천 | 비추천 |

추천 이유: (B)·(C)는 에어쉽 돈 함수를 안 건드리지만 「우리 계정끼리 경쟁」과 「한도 이중 계산」이 새로 생긴다. 둘 다 실제 엔화가 나가는 사고다. (A)의 사고 지점은 DB 안에서 닫을 수 있다.

(A)의 3중 방어:

| 겹 | 방법 | 막는 것 |
|---|---|---|
| 1 | 전용 시스템 회원(`site-bridge-tomo`). 바우처 0원, 전화·푸시 토큰 없음, 알림 수신 꺼짐 | 분기를 빠뜨려도 고객 돈·고객 연락처가 없다 |
| 2 | 함수 맨 앞 분기: `origin_site is not null` 이면 예치·한도·주문 생성·바우처 결제·고객 알림을 건너뛴다 | 주문·원장·알림 생성 |
| 3 | 검사 조건(CHECK): `origin_site` 가 있으면 `user_id = 시스템 회원`, `deposit_krw = 0`, `market = 'mercari'`, `origin_ref` 필수. 그리고 `orders.auction_bid_id` 가 연결 사이트 행을 가리키면 거절하는 트리거 | 직접 insert·수동 조작 실수 |

## 3. 데이터 흐름

```
tomo 고객 신청 → 카드 승인(authorized, executor='airship')
  → 훅 bid.requested (tomo → 에어쉽, 깨우는 신호만)
  → 에어쉽 다리 작업: 운영 API GET /market-bids?status=authorized 로 상세를 가져온다
  → site_bid_upsert (멱등 키 = origin_site + tomo 신청 id) → auction_bids 행(requested)
  → 운영 API POST /market-bids/{id}/armed (에어쉽이 접수 확인)
  → 워커가 평소대로 읽고 입찰 (코드 변경 없음)
  → 에어쉽 다리 작업(1분): 행 상태·발사 기록을 읽어 바뀐 것만 tomo 운영 API 로 보낸다
  → tomo 가 승인 해제 / 낙찰 확인 대기 / 매입 / 주문 전환
```

| 단계 | 누가 | 무엇을 | 멱등 |
|---|---|---|---|
| 1 작업 생성 | 에어쉽 서버(훅 수신 + 1분 크론이 같은 함수) | tomo 에서 `authorized`·`executor='airship'` 건을 가져와 `site_bid_upsert` | `(origin_site, origin_ref)` 유일. 다시 불러도 같은 행 |
| 2 접수 확인 | 에어쉽 → tomo | `POST /market-bids/{id}/armed` → `armed_at`, `executor_ref = 에어쉽 행 id` | `request_id = armed:<행 id>` |
| 3 입찰 | 워커 | 기존 로직 | 기존 선점 |
| 4 결과 전달 | 에어쉽 1분 크론 | 아래 표대로 호출. 보낸 내용은 `auction_bids.origin_pushed`(jsonb)에 적어 같은 것을 다시 보내지 않는다 | `request_id = <행 id>:<종류>:<금액>` |
| 5 건강 신호 | 에어쉽 1분 크론 | `POST /market-bids/worker-health` 로 heartbeat·enabled·dryRun·reauth·bid_enabled 를 보낸다 | 덮어쓰기 |

훅은 유실될 수 있으므로 1분 크론이 정본이다. 훅은 빨리 깨우는 용도다. 방향 규칙은 그대로다(운영 API = 에어쉽 → tomo, 훅 = tomo → 에어쉽). tomo 가 에어쉽을 조회하는 새 경로는 만들지 않는다.

### 3.1 에어쉽 상태 → tomo 호출

| 에어쉽 행 | 조건 | tomo 호출 | 권한 | 돈 |
|---|---|---|---|---|
| `placed` | `ok=true` 발사가 새로 생김 | `placed`(금액 = 그 발사 금액, 증거 = 발사 id) | ops | 없음 |
| `outbid` 또는 `is_top_bidder=false` | 현재가 > 우리 마지막 금액 | `outbid`(현재가) | ops | 없음 |
| `worker_error` 가 `[mercari-submit-unknown]` 으로 시작 | 접수 불명 | `hold`(사유 submit_unknown) | ops | 승인 유지 |
| `failed` + 제출된 발사 0건 | 제출 전 실패 확정(로그인 풀림·버튼 없음·계정 제한·마감 놓침) | `missed`(사유 = worker_error 요약) | money | 승인 해제 |
| `failed` + 제출된 발사 있음 | 넣었는지 모름 | `hold`(사유 failed_after_submit) | ops | 승인 유지 |
| `lost` | 워커 정산 유찰 | `lost`(최종가). tomo 가 0052 규칙으로 다시 검사한다 | ops | 승인 해제 |
| `won` | 워커 정산 낙찰 | **`hold`(사유 worker_won, 낙찰가, 구매 기한)** — 5절 | ops | 승인 유지 |
| `cancelled` | 에어쉽에서 수동 전환·취소 | 호출 없음(전환 쪽이 이미 불렀다) | — | — |

`missed` 만 money 권한이다. 다리 작업용 서명 주체를 「시스템(bridge)」으로 두고 money 는 `missed` 한 경로에만 허용한다. 낙찰 매입(`won`)은 다리 작업이 부르지 못하게 tomo 가 거절한다(자동 매입을 켜기 전까지).

### 3.2 실패·불명·워커 미가동

| 상황 | 판정하는 곳 | tomo 동작 |
|---|---|---|
| 건강 신호가 5분 넘게 없음, 또는 enabled=false·dryRun=true·reauth 중·bid_enabled=false | tomo(받은 건강 신호) | 접수 자동 중단(유효 접수 = `accepting` AND 워커 정상). 패널에 「지금은 입찰 신청을 받지 않아요」. 운영 이벤트 `bid.worker_down` 1회 |
| `authorized` 인데 10분 안에 접수 확인(`armed_at`)이 없음 | tomo 크론 | 이벤트 `bid.to_place_due`. 「내 차례」에 「워커 미접수」 |
| 마감 2시간·1시간 전, 접수 확인이 없거나 워커 비정상 | tomo 크론 | 이벤트 `bid.to_place_due:<id>:<2|1>`(재알림, 한 번씩). 운영자가 「수동 전환」을 고를 수 있다 |
| 마감 30분 전, 접수 확인이 없거나 워커 비정상 | tomo 크론(새 규칙) | `missed` + 승인 해제 + 고객 알림. 수동 건의 기존 규칙과 같은 결과 |
| 마감 30분 전, 접수 확인 있고 워커 정상 | — | 그대로 둔다. 예약 입찰은 마감 2분 전에 들어가므로 이때 `authorized` 인 것이 정상이다 |
| 마감 뒤 15분 안에 결과 없음 | tomo 크론(기존 규칙을 `authorized`+airship 에도 적용) | `hold`. 승인 유지. 맨 위 줄 |
| 워커가 죽어 마감을 놓침 | 에어쉽 1분 크론(워커 없이도 돈다) | 마감 5분 지난 `requested` + 제출 발사 0건 → failed 로 닫고 tomo `missed` |

마감 30분 전 규칙의 뜻: 30분 안쪽에서 워커가 죽으면 수동으로 바꿀 시간이 없다. 그때는 결과가 「못 넣음(승인 해제)」 또는 「보류」 둘 중 하나로만 끝난다. 고객 돈은 나가지 않는다.

### 3.3 수동 예비 경로

| 항목 | 내용 |
|---|---|
| 전환 주체 | 운영자만. 자동 전환은 하지 않는다(워커와 사람이 같은 건에 동시에 넣는 사고 방지) |
| 전환 위치 | 에어쉽 어드민 연결 사이트 화면의 「수동 전환」 |
| 전환 순서 | ① 에어쉽 행을 `cancelled` 로 닫는다(firing 중이거나 제출 발사가 있으면 거절) ② tomo `POST /market-bids/{id}/executor {manual}` ③ 그 뒤는 15번 수동 절차서 |
| 전체 전환 | tomo 설정 `executor='manual'`. 새 신청부터 수동. 진행 중 건은 건별로 전환한다 |
| 전환 기준 | 워커 로그인 풀림이 30분 넘게 복구 안 됨 / 계정 입찰 제한 / 접수 불명 2건 연속 / 워커 PC 꺼짐 |
| 수동일 때 한도 | 15번 1차 값(전체 5건, 고객당 1건, 마감 180분 전 접수 마감) |

### 3.4 고객 취소

| 항목 | 내용 |
|---|---|
| 취소 가능 구간 | `authorized` 이고 마감 30분 전까지(워커 단계). 에어쉽 고객 취소 마감(15분)보다 넉넉하게 둔다 |
| 순서 | tomo 가 에어쉽에 서명 요청 `bid.cancel` 을 **동기로** 보낸다 → 에어쉽이 행을 `cancelled` 로 닫고 성공을 돌려준다 → tomo 가 취소·승인 해제 |
| 에어쉽이 거절·무응답 | tomo 는 취소하지 않는다. 「지금은 취소할 수 없어요. 잠시 뒤 다시 시도해 주세요」 |
| `placed` 뒤 | 취소 불가(메루카리 규칙, 15번 그대로) |

## 4. 입찰 방식

| 선택 | 내용 | 사고 지점 | 판정 |
|---|---|---|---|
| 예약(reserve) | 마감 2분 전부터 현재가+100엔, 30초 안에는 상한가 | 실패가 마지막 2분에 몰린다. 수동으로 바꿀 시간이 없다(돈은 안전: 승인 해제) | **기본값**. 에어쉽에서 10/24부터 실전 사용 |
| 즉시(instant) | 신청 직후 넣고 밀릴 때마다 바로 다시 넣는다 | 일찍 넣은 입찰은 취소할 수 없다. 값이 일찍 오른다. 고객 취소 구간이 사라진다 | 쓰지 않는다 |

입찰 0건(마감 미정) 상품은 워커가 신청 직후 첫 입찰을 넣는다. 그 순간부터 고객 취소가 안 된다. tomo 신청 확인 창에 이 문구가 있어야 한다(15번 5.1절과 대조).

## 5. 낙찰 뒤

### 5.1 매입(고객 카드 결제) 시점

| 안 | 내용 | 사고 지점 | 판정 |
|---|---|---|---|
| 자동 매입 | 워커가 낙찰이라고 하면 바로 고객 카드를 결제한다 | 거짓 낙찰이면 고객 카드가 잘못 결제된다. 2026-11-11 에 남이 같은 금액을 넣어 거짓 낙찰이 난 기록이 있다(지금은 낙찰자 표기까지 본다) | 나중 단계 |
| **낙찰 확인 대기** | 워커 낙찰 → tomo `hold(worker_won)` → 운영자가 메루카리 화면에서 낙찰을 확인 → 「낙찰 매입」(기존 M5, 두 번 확인) | 운영자가 늦으면 구매 기한(24시간)이 준다. 재알림으로 막는다 | **기본값** |

전환 조건(Ren 결정): 워커 낙찰과 운영자 확인이 5건 연속 같으면 자동 매입을 켠다. 켜도 tomo 검사(낙찰가 ≤ 상한, 낙찰가 = 우리 마지막 입찰액)는 그대로 돈다.

고객 문구: 일반 보류(「결과를 확인하고 있어요」)와 구분한다. 새 알림 `mb_won_check` = 「낙찰된 것으로 보여요. 확인한 뒤 결제하고 알려 드릴게요」.

### 5.2 메루카리 구매

| 단계 | 누가 | 내용 |
|---|---|---|
| 1 낙찰 확인 | 운영자 | 메루카리 상품 화면에서 낙찰자 표기 확인. 에어쉽 행의 증거 사진을 같이 본다 |
| 2 매입 | 운영자(money) | tomo 「낙찰 매입」 → 고객 카드 결제 → 대행 주문 T 번호 생성 |
| 3 구매 | 운영자 | **입찰한 그 메루카리 계정**으로 24시간 안에 구매. 화면에 입찰 계정을 표시한다 |
| 4 입고 예정 | 운영자 | 수령지는 에어쉽 낙찰 건과 같은 일본 센터. 상자 표기는 `TOMO T000123`(0054 규칙) |
| 5 기록 | 운영자 | tomo 대행 주문에 구매 계정·거래번호·실구매가 입력 → 「구매완료」 |

에어쉽 주문은 만들지 않는다. 에어쉽 「구매대행 관리 > 구매 필요」에도 넣지 않는다. tomo 대행 주문(T 번호)이 연결 사이트 화면의 「구매 필요」 줄에 뜬다.

### 5.3 24시간 기한

| 장치 | 내용 |
|---|---|
| 기한 표시 | `bid.won`·「낙찰 확인 대기」 줄에 구매 기한(마감 + 24시간)을 적고 기한 임박 순으로 정렬 |
| 재알림 | 낙찰 뒤 2시간·12시간·20시간에 미구매면 이벤트 `bid.to_buy_due`(텔레그램) |
| 매입 실패(카드 거절) | 기본값: **그래도 24시간 안에 구매한다.** 계정 제한은 에어쉽 고객 입찰까지 멈춘다. 고객은 0053 의 48시간 재결제로 받는다. 워커 단계 초기 상한 30,000엔이 한 건 손실 한도다 |
| 재결제 기한 넘김 | 0053 그대로(입찰 정지). 산 물건의 처리는 Ren 결정 |

## 6. 변경 목록

### 6.1 에어쉽

| 구분 | 이름 | 내용 |
|---|---|---|
| 마이그레이션 | `20261128100000_site_bids.sql` + `.down.sql` + `docs/sql/…rollback-test.sql` | 아래 전부 |
| 표 칸 | `auction_bids.origin_site text`, `origin_ref text`, `origin_code text`(MB 번호), `origin_pushed jsonb`, `origin_pushed_at` | 유일 `(origin_site, origin_ref)`. CHECK(2절 3겹째) |
| 시스템 회원 | `site-bridge-tomo` | 바우처 없음. 등급 한도 제외. 알림 수신 꺼짐 |
| 설정 | `site_bid_bridge`(사이트당 한 행): `enabled`, `cap_max_jpy`, `max_open` | **스위치 하나로 연결 끄기** = `enabled=false`(새 작업 생성 중단) |
| 돈 함수 분기 | `_auction_bid_deposit` | 맨 앞: 연결 사이트 행이면 `deposit_pct=0`, `deposit_krw=0` 으로 두고 돌려보낸다(한도 검사·원장 insert 없음) |
| 돈 함수 분기 | `_settle_bid_core` | 상태·낙찰가만 쓰고 돌려보낸다. 고객 알림·`_auction_win_order`·바우처 결제·「낙찰 → 구매」 관리자 알림 없음 |
| 방어 | `orders` 트리거 | `auction_bid_id` 가 연결 사이트 행이면 거절 |
| 알림 분기 | `auction_over_max_notice`, `auction_bid_extended_notice` 함수 | 연결 사이트 행이면 건너뜀 |
| 텔레그램 | `_tg_bids_after` | 건너뛰지 않는다. 회원 자리에 「TOMO MB000012」를 적는다 |
| 새 함수 | `site_bid_upsert(site, ref, code, auction_id, title, url, image, max_bid, ends_at, current)` | service_role 전용. 검사: 스위치 켜짐, 상한 ≤ `cap_max_jpy`, 진행 건수, `auction_id` 형식, 마감 미래. `bid_mode='reserve'` 고정 |
| 새 함수 | `site_bid_cancel(site, ref, reason)` | `requested` 이고 firing 아님·제출 발사 0건일 때만 `cancelled` |
| 새 함수 | `site_bid_close_missed()` | 워커가 죽었을 때 마감 5분 지난 `requested`(제출 발사 0건)를 failed 로 |
| 상태 조회 | `admin_mercari_bid_status` | 연결 사이트 진행 건수를 따로 한 줄 |
| 안 바꾸는 돈 함수 | `settle_checkout`, `spend_voucher`, `release_auction_deposit`, `_auction_capture`, `pay_auction_order`, `_auction_win_order` | 적용 전후 md5 대조 |
| 서버 | `src/lib/connected/site-bids.server.ts` | 가져오기(1단계)·결과 전달(4단계)·건강 신호(5단계). 순수 판정 함수 + check 파일 |
| 서버 | `/api/cron/site-bids` | 1분. 위 세 가지 실행. 기록 남김 |
| 서버 | `/api/site-hook/$site` | `bid.requested` 를 받으면 가져오기를 바로 한 번. `bid.cancel` 은 동기 응답 |
| 어드민 | `/admin/auction` | 기본 목록·건수·통계에서 연결 사이트 행 제외. 필터 「연결 사이트」 추가. 배지 「TOMO MB000012」. 회원 이메일 칸 숨김. 「낙찰 주문 만들기」·「예치 해제」 버튼 숨김. 접수 불명 해제·증거 보기는 그대로 |
| 어드민 | 연결 사이트 마켓 입찰 화면 | 칸 추가: 실행자(워커/수동), 워커 상태, 에어쉽 행 링크, 「수동 전환」, 「낙찰 확인 대기」 줄 |
| 내 차례 | 에어쉽 경매 집계 | 연결 사이트 행 제외(tomo counts 가 센다) |
| 허용 표 | `ops-routes.ts` | `POST /market-bids/{id}/executor`(ops) 추가 |
| 워커 | — | **변경 없음** |

### 6.2 tomo

| 구분 | 이름 | 내용 |
|---|---|---|
| 마이그레이션 | `0055_market_bid_worker.sql` | 아래 전부 |
| 설정 칸 | `market_bid_settings.worker_seen_at`, `worker_ok`, `worker_reason`, `auto_capture`(기본 false) | 건강 신호 저장 |
| 함수 | `market_bid_worker_health(payload)` | 건강 신호 기록. 정상→비정상으로 바뀌면 `bid.worker_down` |
| 함수 | `market_bid_accepting()` | 유효 접수 = `accepting` AND (executor='manual' OR 건강 신호 5분 안·정상). `request_market_bid` 와 패널이 이 값을 쓴다 |
| 함수 | `market_bid_set_armed(id, ref)` | `armed_at`, `executor_ref` |
| 함수 | `market_bid_set_executor(id, to)` | `authorized` 일 때만 |
| 함수 | 보류 사유 `worker_won` | 낙찰가·구매 기한 저장. `auto_capture=true` 면 바로 기존 낙찰 검사·매입 경로 |
| 크론 | `cron_market_bids` | ① airship 건 마감 30분 전 규칙(3.2절) ② 접수 확인 10분 지연 ③ 재알림 `bid.to_place_due` 2시간·1시간(수동·워커 공통, 켜기 기록의 「재알림 없음」 해결) ④ `bid.to_buy_due` ⑤ 결과 지연 보류를 airship `authorized` 에도 적용 |
| 이벤트 | `ops_outbox.type`·`OPS_EVENT_TYPES` | `bid.to_place_due`, `bid.to_buy_due`, `bid.worker_down` 추가 |
| 알림 | `mb_won_check` (ko/ja) | 5.1절 문구 |
| 운영 API | `POST /market-bids/worker-health`, `/{id}/armed`, `/{id}/executor`, `GET /market-bids?executor=airship&status=authorized` | 전부 ops. 시스템 주체의 `won` 호출은 `auto_capture=false` 면 거절 |
| 서버 | 고객 취소 | airship 건은 에어쉽에 `bid.cancel` 동기 요청 뒤 취소. 마감 30분 전 마감 |
| 어드민 | `/admin/market-bids` | 실행자 표시 「워커 입찰」/「수동 전환됨」, 워커 상태 띠, 설정에 실행자 고르기·자동 매입 스위치 |
| 고객 화면 | 패널·상세 | 워커 단계 문구(「마감 직전에 입찰해요」), 취소 마감 시각 |

## 7. 시험

### 7.1 위험 확인

| 질문 | 답 |
|---|---|
| 에어쉽 DB 에 시험 행을 넣었다 빼면 안전한가 | **안전하지 않다.** 커밋된 `market='mercari'`·`requested` 행은 워커가 3초 안에 읽는다. 마감 미정이면 바로, 아니면 마감 2분 전에 실제로 입찰한다 |
| 드라이런 스위치 | 환경 변수뿐이고 전체 공통이다. 켜면 에어쉽 고객 입찰도 멈춘다. 재시작이 필요하다. 시험용으로 쓰지 않는다 |
| 워커가 안 집는 상태 | `bidding`·`cancelled`·`failed`·`won`·`lost`. 메루카리 루프는 `requested/placed/outbid` 만 읽는다 |

### 7.2 실입찰 없는 리허설

| 번호 | 방법 | 확인하는 것 |
|---|---|---|
| R1 | `BEGIN … ROLLBACK` 안에서 `site_bid_upsert` → `worker_settle_bid`(낙찰·유찰) → 대조. 커밋 전 행은 워커가 못 본다 | `orders`·`voucher_ledger` 0행 증가, 시스템 회원 밖 `notifications` 0행, 돈 함수 md5 동일, CHECK·orders 트리거 거절 |
| R2 | 같은 묶음에서 분기를 일부러 빼고 실행 | 검사가 실제로 실패하는지(검사가 우연히 통과하는 것 방지) |
| R3 | 순수 함수 시험(check 파일): 에어쉽 행·발사 기록 → tomo 호출 목록 | 3.1절 표 전 줄, 같은 입력 두 번 = 호출 0 |
| R4 | **이미 끝난 경매**로 끝에서 끝까지: tomo 시험 신청(15번 8.2절 방식) → 에어쉽 행(끝난 상품) → 워커는 읽기만 하고 유찰·못 넣음으로 닫음 → tomo 승인 해제 | 가져오기·접수 확인·결과 전달·승인 해제. 끝난 경매에는 입찰 버튼이 없어 입찰이 불가능하다 |
| R5 | 건강 신호를 끊는다(다리 스위치 off) | 5분 뒤 tomo 접수 자동 중단, `bid.worker_down` |
| R6 | 접수 확인 없이 둔 시험 신청 | 재알림 2회, 마감 30분 전 자동 취소 |

### 7.3 Ren 승인이 필요한 실제 시험

| 번호 | 내용 | 돈 |
|---|---|---|
| S1 | 실입찰 1건: 현재가 2,000엔 안팎·送料込み 상품, 상한 = 최소 금액. 워커가 마감 2분 전에 넣는다 | 낙찰되면 실구매 약 2,100엔 + 고객 카드 매입(시험 카드) |
| S2 | S1 이 낙찰이면: 낙찰 확인 대기 → 매입 → 메루카리 구매 → T 주문 구매완료 | 위와 같음 |
| S3 | 고객 취소 1건(마감 1시간 전) | 승인 해제 |

선행 조건: 15번 시험 1(실카드 승인 → 취소)이 아직 3D Secure 에서 멈춰 있다. 그 시험이 먼저 통과해야 한다.

## 8. 구현 트랙

각 트랙은 standard 에이전트 한 세션 크기다.

| 순서 | 트랙 | 저장소 | 내용 | 완료 기준 |
|---|---|---|---|---|
| 1 | A1 DB | 에어쉽 | 6.1절 마이그레이션·시스템 회원·함수 분기·방어 | R1·R2 통과. 돈 함수 md5 대조. 스위치 기본 off 로 운영 적용 |
| 2 | T1 DB·API | tomo | 0055, 운영 API 4경로, 크론 규칙, 이벤트 3종 | R6 통과. `executor='manual'` 기존 동작 그대로(0052·0053 검사 재실행) |
| 3 | A2 서버 | 에어쉽 | 다리 작업·크론·훅 처리 | R3 통과. 스위치 off 에서 호출 0건 |
| 4 | A3 어드민 | 에어쉽 | 표시 분리·수동 전환·낙찰 확인 대기 줄 | 저장 → 새로고침 → tomo 상태 반영까지 확인 |
| 5 | T2 화면 | tomo | 어드민 실행자·워커 상태, 고객 문구·취소 | 화면 확인(visual) |
| 6 | R 리허설 | 둘 다 | R4·R5 | 운영 DB 정리 기록 |
| 7 | S 실제 시험 | 둘 다 | S1~S3 | Ren 승인 뒤 |
| — | W 워커 | 에어쉽 | **없음** | — |

켜는 순서: ① 에어쉽 `site_bid_bridge.enabled=true` ② 건강 신호가 tomo 에 정상으로 보임 ③ tomo 설정 `executor='airship'` ④ tomo `accepting=true`.

되돌리기:

| 단계 | 조작 | 효과 |
|---|---|---|
| 1 | tomo 설정 `executor='manual'` | 새 신청은 수동. 워커 건강과 접수가 분리된다 |
| 2 | 에어쉽 `site_bid_bridge.enabled=false` | 새 작업 생성 중단. 진행 중 건의 결과 전달은 계속한다 |
| 3 | 진행 중 건을 건별 「수동 전환」 | 에어쉽 행 닫힘 |
| 4 | 마이그레이션 down | 진행 행 0건일 때만 |

워커는 어느 단계에서도 건드리지 않는다.

## 9. 워커 재시작 필요 여부

**필요 없다.** 워커는 `market='mercari'` 행을 출처와 상관없이 읽는다. 정산은 RPC 를 부르고 분기는 DB 안에 있다. 전제는 지금 워커가 실입찰 상태(`MERCARI_BID_ENABLED=true`, `MERCARI_BID_DRY_RUN=false`)라는 것이다. 현재 값은 `worker_heartbeat(name='mercari_bid').meta` 로 읽는다(이번에 확인 못 함).

## 10. Ren 이 정할 것

| 번호 | 정할 것 | 기본값(추천) | 다른 선택 |
|---|---|---|---|
| 1 | 낙찰되면 고객 카드를 바로 결제할까 | 아니오. 운영자가 낙찰을 확인한 뒤 결제. 5건 연속 맞으면 자동으로 바꿈 | 처음부터 자동 |
| 2 | 워커 재시작 | 안 함(필요 없음) | — |
| 3 | 상한가 한도를 언제 올릴까(30,000엔 → 100,000엔) | 워커로 낙찰 3건·유찰 3건이 사고 없이 끝난 뒤 | 켤 때 바로 |
| 4 | 같은 상품에 에어쉽 고객과 tomo 고객이 겹칠 때 | 먼저 신청한 쪽. 뒤쪽에는 「다른 회원이 먼저 입찰 신청했어요」 | 에어쉽 고객 우선 |
| 5 | 입찰 시점 | 마감 2분 전(에어쉽과 같음) | 신청 직후 |
| 6 | 카드 결제가 거절된 낙찰 건도 메루카리에서 살까 | 산다(계정 제한 방지). 고객에게 48시간 재결제 요청 | 안 산다 |
| 7 | 하루 입찰 한도 | 에어쉽과 합산(지금 값 그대로) | tomo 몫을 따로 정함 |
| 8 | 야후옥션 확장 | 메루카리가 안정된 뒤 따로 설계 | — |
| 9 | 고객 취소 마감 | 마감 30분 전 | 15분 전 |
| 10 | 수동으로 바꾸는 기준 | 로그인 풀림 30분 지속·계정 제한·접수 불명 2건 연속 | — |

## 11. 확인 못 한 것

| 항목 | 왜 필요한가 |
|---|---|
| 운영 워커의 현재 환경 값(`MERCARI_BID_ENABLED`, `MERCARI_BID_DRY_RUN`, `MERCARI_BID_VIA`, `WORKER_AUTO_UPDATE`) | 실입찰 상태인지, 입찰 계정이 어느 것인지(`ego` 면 다른 계정), 워커가 코드를 스스로 받는지 |
| 2026-11-19 사례(시간 초과·재로그인)의 원인이 지금 코드에서 해결됐는지 | 운영 기록·발사 기록을 읽지 못했다. 같은 일이 나면 3.2절대로 「못 넣음」 또는 「보류」로 끝난다 |
| `notifications` 표의 insert 트리거(푸시·알림톡·메일) | 워커가 시스템 회원에게 직접 넣는 알림(상한 초과, 못 넣음)이 밖으로 나가지 않는지. A1 에서 확인한다 |
| `_tg_bids_after`, `auction_over_max_notice`, `auction_bid_extended_notice`, `auction_bid_max_changed` 함수 본문 | 분기 위치. 트리거 이름만 확인했다 |
| `_bid_limit_check` 의 면제 조건(`exempt`) | 시스템 회원 처리 방식 |
| `/admin/auction` 의 집계·내 차례 쿼리 전체, `admin_mercari_bid_status` 본문 | 제외 조건을 넣을 곳 |
| `connected_sites` 표 칸, `/api/site-hook/$site` 처리부, 훅이 동기 응답을 돌려줄 수 있는지 | 스위치 위치와 `bid.cancel` 방식. `hook.ts`·`bridge.server.ts` 는 함수 이름만 봤다 |
| 에어쉽에서 1분 HTTP 크론을 돌리는 기존 방식 | `/api/cron/site-bids` 를 무엇이 부르는지 |
| tomo 운영 API 가 사람 없는 시스템 주체 호출을 받는지, money 권한 판정 | `lib/ops-bridge.ts` 서명 줄만 봤다. `app/api/ops/[...path]/route.ts`·`lib/ops-api.ts`·`lib/market-bid-ops.ts` 본문은 읽지 못했다 |
| tomo 0050·0052·0053 의 함수 실제 이름 | 이 문서의 함수 이름은 15번 4.2절 기준이다. 구현 전에 대조한다 |
| 우리 메루카리 계정의 결제 수단, 낙찰품 수령 주소·입고 예정 등록 절차 | 5.2절 3~4단계. 코드에 없다 |
| tomo `ops_outbox` 발송부, `app/api/cron/market-bids/route.ts` | 재알림·승인 해제 실행 경로 |
| 야후 입찰기(`yahoo.ts`·`index.ts`) 상세 | 이번 범위는 메루카리다. `db.ts` 의 조회 조건만 확인했다 |

## 12. A1·T1 구현 기록 (2026-11-27)

### 12.1 A1 에어쉽 DB — 완료·운영 적용(스위치 꺼짐)

에어쉽 커밋 `daa85c27`(migrate-vercel), 마이그레이션 `20261128100000_site_bids`(+ `.down.sql`, `docs/sql/20261128100000_site_bids.rollback-test.sql`). 상세·md5 표는 에어쉽 `docs/connected-sites.md` 「연결 사이트 입찰 A1」.

| 항목 | 결과 |
|---|---|
| 적용 | 2026-11-27 21:40 KST, 대시보드 쿼리 DO 블록 한 번. `site_bid_bridge('tomo')` enabled=false, cap 30,000엔, max_open 5 |
| 시스템 회원 | `5eea0538-eab4-4262-8bb0-f32e9369536c`(이메일·전화 없음, 미인증, 로그인 차단). 알림 행은 BEFORE 트리거가 버리고, 바우처 원장은 거절(가입 축하 bonus 만 버림). 적용 뒤 원장 0·알림 0 |
| 분기 위치(운영 정의 위 맨 앞) | `_auction_bid_deposit`(begin 바로 뒤), `_settle_bid_core`(상태 검사 뒤·패배 처리 앞), `_auction_over_max_notice`·`_auction_bid_extended_notice`(begin 뒤), `_auction_bid_max_changed`(사건 insert 뒤·알림 앞), `_tg_bids_after`(mem 계산), `_orders_auction_link_guard`(begin 뒤, 관리자·RPC 도 거절), `admin_mercari_bid_status`(`site_active` 추가) |
| md5 전 → 후 | _auction_bid_deposit a25b8477→165463df, _settle_bid_core 4969976d→fa1055d9, _auction_over_max_notice 4d5fd67a→b57fe0b2, _auction_bid_extended_notice f167464a→c181b391, _auction_bid_max_changed 10c4577a→dd140945, _tg_bids_after ff10913d→6b4f6447, _orders_auction_link_guard 9974eea4→261dceeb, admin_mercari_bid_status 5214ddb9→7edf96c7. 돈 함수(settle_checkout·spend_voucher·_auction_capture·_auction_win_order·pay_auction_order·release_auction_deposit·worker_settle_bid·_bid_limit_check 등 15개) 불변 |
| 리허설 | ① 에어쉽 낙찰·유찰 결과 분기 전후 같음(주문 생성·바우처 결제·알림 4) ② 연결 행 원장 0·주문 0·알림 0 ③ CHECK·주문 연결·원장 거절 ④ 겹침 양방향 거절 ⑤ 꺼짐 거절. 결함 주입 5종 모두 검출. down 실행 시 md5 원복 |
| 운영 확인 | 적용 뒤 리허설 재통과, 워커 생존 신호 정상(mercari_bid enabled=true·dryRun=false), 진행 입찰 1건(야후 placed)·전체 323행 그대로 |

설계 11절 「확인 못 한 것」 중 메운 것:

| 항목 | 확인 |
|---|---|
| notifications insert 트리거 | `_app_push_on_notification`(앱 푸시만, device_tokens 기준, /admin 링크 제외) + `a_notifications_group_pay_mute`. 알림톡·메일 트리거 없음 |
| 워커 직접 쓰는 알림 | `notifyUser`(시스템 회원 → 행 버림), `notifyAdmins`(관리자에게 그대로, TOMO 표시 없음) |
| _bid_limit_check | 면제 칸 없음. 연결 행은 예치 분기에서 호출 전에 돌아간다 |
| 운영 워커 값 | 생존 신호 meta: enabled=true, dryRun=false. 자체 업데이트는 `worker/` 변경이 있을 때만 받는다(이번 커밋은 worker/ 무변경) |
| admin_ops_counts | auction_unreleased 는 deposit_krw>0 만 세어 연결 행 제외. members_new 에 시스템 회원 1 |
| 온보딩 메일 | email_confirmed_at 없는 회원 제외 → 시스템 회원 대상 아님 |

### 12.2 T1 tomo — 이번에 못 함

0055·운영 API 4경로·크론 규칙·이벤트 3종은 손대지 않았다. 운영 상태 그대로(플래그 켜짐, accepting=false, MB000001 시험 신청).

### 12.3 다음 작업자(T1·A2·A3·T2·R)가 알아야 할 것

- T1: 워커 건에도 마감 30분 전 미입찰 자동 취소 필요(0052·0053 은 executor='manual' 만). 재알림 `bid.to_place_due` 2h·1h 는 수동·워커 공통.
- A2: `site_bid_upsert` 오류는 접두어로 구분한다(`site_disabled`·`auction_taken`·`bad_max`·`bad_ends_at`(마감 10분 이내 거절)·`too_many_open`·`bad_auction_id`). 멱등 키는 (site, tomo 신청 id). `site_bid_close_missed()` 는 워커가 죽었을 때를 위한 것으로 1분 크론에서 부른다. 결과 판정의 「제출된 발사」 = `auction_bid_fires` 에서 `submitted_at is not null or ok is distinct from false`.
- A2: 연결 행 정산 결과(`_settle_bid_core`)에는 `site` 키가 붙고 주문·바우처는 없다. 낙찰은 tomo `hold(worker_won)` 로만 보낸다.
- A3(켜기 전 필수): `/admin/auction` 목록·건수·통계·「내 차례」에서 `origin_site is not null` 제외, 「낙찰 주문 만들기」·「예치 해제」 숨김.
- 워커 일일 한도는 연결 행 합산. 워커 관리자 알림 제목에는 TOMO 표시가 없다.
- 리허설 행은 반드시 DO 블록 안에서 만들고 롤백한다. 커밋된 mercari·requested 행은 워커가 3초 안에 실제로 입찰한다.
