# 12. 에어쉽 어드민에서 TOMO 같이 관리하기 — 설계

- 지시: Ren 2026-11-27 「tomo 어드민도 수정·업데이트해. 이 사이트는 에어쉽 어드민에서 같이 관리할 거야. 그거에 맞춰서 사이트 기능들도 다시 체크해.」
- 상태: 설계만. 코드·DB 변경 없음. 승인 전.
- 판단 기준: 운영 사고·돈 누락·고객 혼란이 가장 적은 쪽. 작업량은 근거로 쓰지 않는다.
- 확인한 사실(2026-11-27 코드): tomo 마이그레이션은 `0040_refund_void.sql` 까지 있다. 새 파일은 **0041부터** 쓴다. tomo 운영 API 는 `app/api/admin/{cancel,listings,refunds,users/delete}` 4개뿐이다. 에어쉽 「보는 사이트」는 `src/lib/admin-site.ts` 가 브라우저 localStorage 로만 들고 있는 화면 필터다. 에어쉽 최신 마이그레이션은 `20261127120000_yoru_site_email.sql` 이다.
- 확인 못 한 것(구현 첫 단계에서 읽는다): tomo 돈 RPC 안에서 `auth.uid()` 를 운영자 기록에 쓰는 자리 전체, tomo Stripe 웹훅이 에어쉽 결제 이벤트를 걸러내는 방식, 에어쉽 `allSites()` 사용처 전체.

## 1. 결론

**추천: 브리지 방식(대안 1)에 홈 합치기를 더한다.** TOMO 데이터와 돈의 정본은 tomo DB 하나로 둔다. 에어쉽 어드민에는 「TOMO」 메뉴 그룹을 만들고, 모든 조작은 tomo 운영 API(서버 간 서명 토큰)로 보낸다. tomo 는 기존 RPC 를 그대로 실행한다. 주문을 에어쉽 `orders` 로 복사하지 않는다. 에어쉽 홈 「내 차례」와 시스템 상태에는 TOMO 건수를 합친다.

## 2. 대안 비교

| 기준 | 1. 브리지(추천) | 2. 주문을 에어쉽 orders 로 넘김 | 3. DB 통합 |
|---|---|---|---|
| 정본 | tomo 하나 | 둘(tomo 결제 + 에어쉽 주문) | 에어쉽 하나 |
| 돈 누락 위험 | 낮음. 환불·정산·출금이 tomo 기존 경로 그대로다 | 높음. 에어쉽 2차 청구·바우처·정산 트리거가 brand=tomo 행에도 걸린다. 금액이 두 곳에 생긴다 | 이전 중 높음. 원장·환불·출금 행을 옮기며 대조해야 한다 |
| 운영 사고 위험 | 낮음. 브리지가 죽으면 조작이 멈출 뿐 값이 틀어지지 않는다. tomo 어드민이 비상 창구로 남는다 | 높음. 상태를 되돌려 보내는 동기화가 실패하면 두 화면이 다른 상태를 보여 준다 | 높음. 회원 로그인 계정 이전, 권한 규칙 재작성, 전환 중단 시간이 생긴다 |
| 고객 혼란 | 낮음. 고객 화면·알림 이름이 TOMO 그대로다 | 중간. 에어쉽 이름의 알림·청구가 tomo 고객에게 갈 수 있다. tomo 고객은 에어쉽 회원이 아니라 가짜 회원 행이 필요하다 | 중간. 전환 시 재로그인·주소 재확인이 생긴다 |
| C2C·분쟁·출금 | 그대로 다룬다 | 에어쉽에 대응 구조가 없다. 결국 브리지가 따로 필요하다 | 표를 새로 만든다 |
| 되돌리기 | 토큰을 지우면 끝난다 | 넘긴 주문을 다시 맞춰야 한다 | 사실상 못 되돌린다 |
| 직원이 한 화면에서 보나 | 본다(메뉴 그룹 + 홈 건수) | 대행 주문만 본다 | 본다 |

- 대안 2 의 이점은 「구매·입고·발송을 같은 작업 줄에서 본다」 하나다. 이 이점은 추천안에서 홈 「내 차례」 합치기와 TOMO 대행 화면의 에어쉽식 상태 이름으로 대부분 얻는다.
- 대안 2 는 추천안이 4주 이상 사고 없이 돌고, Ren 이 「같은 창고·같은 구매 계정」이라고 확정한 뒤에 다시 검토한다(5장 결정 12).

## 3. 추천안 상세

### 3.1 화면 배치

배치 뜻: 「조작」= 에어쉽 화면에서 tomo API 로 읽고 쓴다. 「읽기」= 에어쉽에서 보기만 한다. 「남김」= tomo 어드민에 두고 에어쉽 메뉴에서 새 창 링크만 건다.

| tomo 화면 | 1단계 | 에어쉽 위치 | 비고 |
|---|---|---|---|
| 대시보드 | 합침 | 홈 「내 차례」·시스템 상태 + `/admin/tomo` 개요 | 건수 조회 실패는 0 이 아니라 「확인 못 함」으로 표시한다 |
| 주문(proxy_orders) | 조작 | `/admin/tomo/proxy` | 주문 한 건 안에 대행 요청 행을 묶어 보여 준다 |
| 대행 요청(proxy_requests) | 조작 | `/admin/tomo/proxy` | 상태 변경은 `admin_set_order_status` 그대로 |
| C2C 거래(transactions) | 조작 | `/admin/tomo/trades` | |
| 센터(SEOUL/NARITA) | 조작 | `/admin/tomo/center` | 입고·검수·발송. 검수 기록은 T4 뒤에 붙는다 |
| 분쟁 | 조작(2단계 확인) | `/admin/tomo/disputes` | 환불이 따르는 결정은 금액·대상 요약 뒤 확인을 한 번 더 받는다 |
| 문의(support_tickets) | 조작 | `/admin/tomo/support` | 에어쉽 1:1 문의 화면과 섞지 않는다. 사이트를 헷갈린 답변을 막는다 |
| 신고 | 조작 | `/admin/tomo/reports` | |
| 환불(refunds 대기열) | 조작(소유자) | `/admin/tomo/refunds` | 실행 코드는 tomo `lib/refunds.ts` 하나만 쓴다 |
| 정산·출금 | 조작(소유자) | `/admin/tomo/payouts` | |
| 회원 | 조작 | `/admin/tomo/users` | 조회·정지. 완전 삭제는 T1 수정 뒤 소유자만 |
| 활동 기록 | 읽기 | `/admin/tomo/activity` | 에어쉽 활동 기록에도 브리지 조작을 남긴다 |
| 오류 | 읽기(건수) | 시스템 상태 | 상세는 tomo 화면 링크 |
| 환율 | 읽기 | `/admin/tomo` 개요 | 수동 입력을 자동 갱신으로 바꾼다(T2). 수동 덮어쓰기는 tomo 에 남긴다 |
| 상품·외부 상품·큐레이션·배너·공지·후기·AI 로그 | 남김 | 메뉴 링크 | 돈이 움직이지 않는 화면이다. 2단계에서 옮긴다 |

- tomo 어드민은 닫지 않는다. 같은 RPC 를 쓰므로 양쪽에서 조작해도 값이 갈라지지 않는다. tomo 어드민 위쪽에 「평소 운영은 에어쉽 어드민에서 한다」 띠를 붙인다(T4).

### 3.2 인증·권한

| 항목 | 설계 |
|---|---|
| 에어쉽 쪽 관문 | 서버 함수에서 `user_roles` admin 과 `admin_menu_access` 키(`tomo.ops`, `tomo.money`)를 확인한다. 브라우저는 tomo 를 직접 부르지 않는다 |
| 서버 간 인증 | 헤더 `x-ops-key-id`, `x-ops-ts`, `x-ops-sig`(본문·시각·경로의 HMAC-SHA256). 시각 차이 5분 초과는 거부한다. 비교는 상수 시간으로 한다(`bank-deposit-hook.ts` 방식) |
| 비밀값 보관 | 에어쉽: `integration_secrets` 의 `tomo_ops`(주소·키·훅 토큰). tomo: 환경 변수 `OPS_BRIDGE_SECRET`, `AIRSHIP_HOOK_TOKEN`. 값을 로그·보고에 적지 않는다 |
| 누가 한 것으로 기록되나 | tomo 에 표 `ops_actors`(에어쉽 관리자 id·이메일 → tomo `profiles.id`, is_admin 필수)를 둔다. 브리지는 그 tomo 운영자 이름으로 RPC 를 실행한다. 기존 활동 기록·`is_admin_user()` 검사·정지 차단이 그대로 작동한다 |
| 실행 방법 1안 | tomo 서버가 그 운영자의 수명 60초 사용자 토큰을 만들어 사용자 권한으로 RPC 를 부른다. RPC 수정이 없다 |
| 실행 방법 2안 | 1안이 Supabase 키 방식 때문에 안 되면, 서비스 권한으로 부르고 RPC 에 `p_actor uuid` 를 추가한다. `auth.uid()` 를 쓰는 자리를 모두 바꿔야 한다 |
| 연결 없는 관리자 | 403 으로 거부한다. 운영자 계정을 자동으로 만들지 않는다 |
| 돈 조작 | `tomo.money` 는 기본으로 소유자만 가진다. 환불 실행·출금 확정·분쟁 환불 결정·회원 완전 삭제가 여기에 든다 |
| 기록 | tomo `ops_requests`(요청 id·운영자·동작·대상·결과), 에어쉽 `tomo_ops_log`(같은 요청 id). 두 기록을 요청 id 로 맞춘다 |

### 3.3 데이터 흐름

| 흐름 | 방향 | 방식 | 멱등·실패 |
|---|---|---|---|
| 목록·상세 조회 | 에어쉽 → tomo | `GET /api/ops/<자원>` | 타임아웃 8초. 실패하면 화면에 「TOMO 응답 없음」과 마지막 성공 시각을 보여 준다. 캐시 값을 현재 값처럼 보이지 않게 한다 |
| 조작 | 에어쉽 → tomo | `POST /api/ops/<자원>/<동작>` + `request_id` + `expected_status` | tomo `ops_requests.request_id` 유일 제약. 같은 요청이 다시 오면 저장된 결과를 돌려준다. 현재 상태가 기대와 다르면 409 로 거부한다 |
| 조작 타임아웃 | 에어쉽 | 같은 `request_id` 로 1회 자동 재시도 | 그래도 실패하면 「결과 확인 못 함」으로 두고 상세를 다시 읽어 판정한다. 성공으로 표시하지 않는다 |
| 이벤트 알림 | tomo → 에어쉽 | `POST /api/tomo-hook`(토큰) | tomo `ops_outbox` 에 먼저 쓰고 보낸다. 실패하면 크론이 24시간 동안 간격을 늘려 다시 보낸다. 에어쉽은 `tomo_events.event_id` 유일 제약으로 중복을 버린다 |
| 건수 | 에어쉽 → tomo | `GET /api/ops/counts` | 60초 캐시. 실패는 「확인 못 함」 |
| 주문 넘기기 | 없음 | — | 에어쉽 `orders`·`order_items` 에 tomo 행을 만들지 않는다 |

- 이벤트 종류: 대행 결제 완료, 고객 취소 요청, 분쟁 접수, 문의 접수, 환불 대기 생성, 출금 요청, 신고 접수, 오류 급증, 크론 실패.
- 이벤트 본문에는 번호·종류·금액·링크만 넣는다. 주소·통관번호 같은 개인정보는 넣지 않는다.

### 3.4 돈 경로

| 항목 | 정본 | 에어쉽 어드민이 하는 일 | 막을 것 |
|---|---|---|---|
| 결제 | tomo `proxy_orders`·`transactions` + Stripe | 읽기 | — |
| 환불 | tomo `refunds` 대기열 | 승인·실행 요청(소유자) | 에어쉽 결제 화면에서 tomo 결제를 직접 환불하지 못하게 한다. Stripe 메타데이터의 사이트 값으로 가린다 |
| 판매자 정산 | tomo `seller_ledger` | 읽기 | 에어쉽 정산·바우처 표에 tomo 금액을 쓰지 않는다 |
| 출금 | tomo `payouts` | 송금 완료 표시(소유자, 2단계 확인) | — |
| 매출 통계 | 각자 | 에어쉽 통계에 tomo 를 더하지 않는다. `/admin/tomo` 개요에 따로 보여 준다 | 합산 표시 금지(통화·수수료 구조가 다르다) |
| Stripe 웹훅 | 각자 | — | 같은 Stripe 계정이라 서로의 이벤트를 받을 수 있다. 두 사이트 모두 자기 결제가 아니면 아무것도 하지 않는지 T1·A3 에서 확인한다 |

### 3.5 알림

| 대상 | 채널 | 발신 이름 |
|---|---|---|
| 운영자 | 에어쉽 어드민 알림 + 텔레그램 + 웹푸시(에어쉽 채널 공용) | 제목 앞에 「[TOMO]」 |
| tomo 고객 | tomo 인앱 알림 + tomo 웹푸시(`lib/notifications.ts`, `lib/push.ts`) | TOMO |
| tomo 고객 메일 | 2단계. tomo 발신 주소로 보낸다(요루 사이트별 발신 선례 `20261127120000`) | TOMO |
| 알림톡 | 쓰지 않는다. 에어쉽 발신 프로필로 tomo 고객에게 보내면 고객이 혼란스럽다 | — |

### 3.6 「내 차례」·시스템 상태·사이트 필터

| 항목 | 설계 |
|---|---|
| 「내 차례」 건수 | 구매 필요(대행 paid), 취소 요청, 입고 대기, 발송 대기, 분쟁, 문의 미답변, 환불 대기, 출금 요청, 신고. tomo `lib/admin-aging.ts` 의 지연 기준을 그대로 쓴다 |
| 배지 | `nav.ts` `BadgeKey` 에 `tomo` 하나만 더한다. 세부 건수는 TOMO 개요에서 본다 |
| 시스템 상태 | tomo `/api/health`, 브리지 마지막 성공 시각, 훅 실패 건수, 크론 마지막 실행 시각, 24시간 오류 건수 |
| 「보는 사이트」 | 선택지에 TOMO 를 더한다. `public.sites` 에 행을 넣지 않고 어드민 전용 「외부 사이트」 목록에 둔다. `sites` 는 도메인 판정·사이트맵·메일 발신에도 쓰이므로 부작용을 피한다 |
| TOMO 선택 시 | TOMO 메뉴 그룹만 펼친다. 에어쉽 표 화면에는 「TOMO 데이터는 TOMO 메뉴에 있다」 안내를 보여 준다 |
| `brand='tomo'` 값 | 에어쉽 9개 표의 brand 칸에 쓰지 않는다. tomo 데이터가 에어쉽 DB 에 들어오지 않기 때문이다. 에어쉽에 생기는 `tomo_events`·`tomo_ops_log` 두 표만 TOMO 전용이다 |

### 3.7 이름 맞추기

| 항목 | 결정 |
|---|---|
| 센터 코드 | tomo 값(SEOUL/NARITA)을 바꾸지 않는다. 브리지 응답에 에어쉽 코드(KR/JP)를 같이 실어 화면에서 「KR(서울)」처럼 보여 준다 |
| 주문 번호 | tomo 에 사람이 읽는 번호를 만든다. 대행 주문 `T`+6자리, C2C 거래 `TX`+6자리. 에어쉽 J/C/K/OUT/A 와 겹치지 않는다 |
| 상태 이름 | tomo enum 은 그대로 둔다. 에어쉽 화면 라벨만 맞춘다: paid=구매 필요, purchasing=구매 중, center_received=입고 완료, shipped_international=발송, delivered=완료 |

## 4. tomo 사이트 기능 재점검 — 우선순위

| 순위 | 항목 | 지금 문제 | 고칠 방향 | 트랙 |
|---|---|---|---|---|
| P0 | 분쟁 환불 시 상품 상태 | 센터에 실물이 있는데 상품이 active 로 돌아가 다시 팔린다 | 센터 단계 이후면 「보류」 상태로 둔다. 반송 확인 뒤에만 다시 판매한다 | T1 |
| P0 | 센터 단계 운영자 취소 | 취소 뒤 상품이 sold 로 굳는다 | 위와 같은 「보류」 규칙을 쓴다. 한 함수로 합친다 | T1 |
| P0 | 회원 완전 삭제 | 진행 중 거래·미정산·미출금 검사가 없다 | 진행 거래, 환불 대기, 정산 잔액, 출금 대기가 있으면 거부한다 | T1 |
| P0 | 정지된 운영자 | 정지돼도 운영 RPC 를 쓴다 | `is_admin_user()` 에 정지 검사를 넣는다 | T1 |
| P0 | 직접 테이블 쓰기 | 활동 기록이 없다 | 운영 표에 기록 트리거를 붙인다. 가능한 쓰기는 RPC 로 옮긴다 | T1 |
| P0 | Stripe 웹훅 교차 수신 | 확인 못 함 | 자기 결제가 아니면 무시하는지 읽고, 아니면 가드를 넣는다 | T1 |
| P1 | 대행 결제 완료 알림 | 운영자도 고객도 알림이 없다 | 고객 인앱·푸시, 운영자는 outbox 이벤트 | T2 |
| P1 | C2C 센터 단계 알림 | 없다 | 입고·검수·발송 시 구매자·판매자에게 알린다 | T2 |
| P1 | 자동 구매확정 | 크론이 없다. 정산이 멈춘다 | DB 크론. 분쟁이 열려 있으면 건너뛴다 | T2 |
| P1 | 예약 만료 | 크론이 없다. 상품이 묶인다 | DB 크론 | T2 |
| P1 | 환율 | 수동 입력 | 매일 자동 갱신. 변동 폭이 크면 적용을 보류하고 알린다 | T2 |
| P1 | 주문 번호 | 사람이 읽는 번호가 없다 | `T`/`TX` 번호 | T2 |
| P2 | 검수 기록 | 없다 | 사진·결과·검수자 표 | T4 |
| P2 | 센터 매칭 코드 | 없다 | 상자 라벨용 짧은 코드 | T4 |
| P2 | 통관번호 | 형식만 본다 | 에어쉽 진위 확인 기능 재사용을 2단계에서 검토한다 | 보류 |
| P2 | 고객 메일 | 없다 | 2단계 | 보류 |

## 5. Ren 이 정할 것

| 번호 | 정할 것 | 기본값(답이 없으면 이대로) |
|---|---|---|
| 1 | 통합 방식 | 브리지. 주문을 에어쉽으로 넘기지 않는다 |
| 2 | 돈 조작 권한(환불 실행·출금 확정·분쟁 환불·회원 완전 삭제) | 소유자만. 직원은 조회와 메모만 |
| 3 | 센터 단계에서 취소·분쟁 환불된 상품 | 「보류」로 둔다. 반송 확인 뒤 판매자가 다시 판매한다 |
| 4 | 자동 구매확정 기한 | 배송 완료 뒤 7일. 분쟁 중이면 멈춘다 |
| 5 | 예약 만료 시간 | 24시간 |
| 6 | 환율 | 매일 1회 자동. 에어쉽과 같은 원천. tomo 현재 가산 값 유지. 전일 대비 3% 넘게 바뀌면 보류하고 알린다 |
| 7 | 고객 알림 | TOMO 이름의 인앱·웹푸시만. 에어쉽 알림톡은 쓰지 않는다 |
| 8 | 운영자 알림 | 에어쉽 텔레그램 채널에 「[TOMO]」로 같이 보낸다 |
| 9 | 주문 번호 | 대행 `T`+6자리, C2C `TX`+6자리. 기존 주문에도 채운다 |
| 10 | tomo 어드민 | 비상용으로 남긴다. 콘텐츠 화면은 2단계에서 옮긴다 |
| 11 | NARITA·SEOUL 이 에어쉽 JP·KR 센터와 같은 창고인가 | 같은 창고로 본다. 작업 줄은 따로 둔다 |
| 12 | 2단계에서 대행 구매·발송을 에어쉽 구매대행 흐름에 태울지 | 안 한다. 4주 운영 뒤 다시 본다 |
| 13 | 에어쉽 관리자 ↔ tomo 운영자 연결 대상 | Ren 계정 하나만 먼저 연결한다 |

## 6. 구현 트랙

순서: T1 → T2 → T3 → A1 → A2 → A3 → T4. T3 와 A1 은 7장 API 약속을 고정하면 동시에 할 수 있다. 각 트랙은 standard 에이전트 1명이 한 세션에 끝낸다.

### 6.1 tomo 저장소(`C:\dev\tomo`)

| 트랙 | 범위 | 소유 파일 | DB | 완료 기준 | 되돌리기 |
|---|---|---|---|---|---|
| T1 위험 수정 | 4장 P0 여섯 가지 | `supabase/migrations/0041_ops_safety.sql`, `app/api/admin/users/delete/route.ts`, `app/api/admin/cancel/route.ts`, `app/api/stripe/**`(가드만), `app/admin/disputes/**`·`app/admin/listings/**`(보류 표시) | 0041: 상품 「보류」 상태, `resolve_dispute`·운영자 취소 수정, `is_admin_user()` 정지 검사, 삭제 검사 함수, 기록 트리거 | 롤백 블록 안에서 센터 단계 분쟁 환불·운영자 취소 뒤 상품이 「보류」다. 진행 거래가 있는 회원 삭제가 거부된다. 정지 운영자의 RPC 가 거부된다. 직접 쓰기가 활동 기록에 남는다 | 0041 역방향 SQL 을 같은 파일 아래 주석으로 둔다. 「보류」 행은 되돌리기 전에 목록으로 뽑는다 |
| T2 번호·크론·알림 | 4장 P1 | `supabase/migrations/0042_order_code_cron.sql`, `app/api/cron/rates/route.ts`, `vercel.json`(크론), `lib/notifications.ts`, `lib/notify-ops.ts`, `lib/stripe-settle.ts`, `lib/currency.ts` | 0042: `proxy_orders.code`·`transactions.code` + 기존 행 채움, DB 크론 2개(자동 구매확정·예약 만료), 크론 실행 기록 표 | 새 주문에 번호가 붙는다. 시험 거래가 기한 뒤 확정된다. 분쟁 중 거래는 확정되지 않는다. 결제 완료 시 고객 알림이 한 번만 간다 | 크론 등록 해제 SQL. 번호 칸은 남겨도 해가 없다 |
| T3 운영 API | 3.2·3.3 | `supabase/migrations/0043_ops_bridge.sql`, `lib/ops-bridge.ts`, `app/api/ops/**`, `app/api/cron/ops-outbox/route.ts` | 0043: `ops_actors`, `ops_requests`, `ops_outbox` | 서명 틀린 요청 401. 연결 없는 관리자 403. 같은 `request_id` 재요청이 한 번만 실행된다. 기대 상태가 다르면 409. 훅 실패 건이 다시 전송된다 | `OPS_BRIDGE_SECRET` 을 지우면 모든 `/api/ops` 가 503 을 낸다 |
| T4 검수·띠 | 4장 P2 일부 | `supabase/migrations/0044_inspections.sql`, `app/admin/center/**`, `app/admin/layout.tsx`(띠), `app/api/ops/center/**` | 0044: 검수 기록 표, 센터 매칭 코드 | 검수 사진·결과가 저장되고 다시 읽힌다. 에어쉽 센터 화면에 보인다 | 표 삭제 SQL |

- tomo 주의: `AGENTS.md` 는 `next dev` 가 자동으로 고친다. pull 전에 `git stash push -- AGENTS.md` 를 한다.
- 돈 경로 마이그레이션은 운영 적용 전에 `BEGIN … ROLLBACK` 으로 한 번 돌려 확인한다. 같은 마이그레이션을 다른 세션이 이미 적용했는지 먼저 읽는다.

### 6.2 에어쉽 저장소(`C:\dev\airship-mint-delivery`, `migrate-vercel`)

| 트랙 | 범위 | 소유 파일(새 파일 위주) | DB | 완료 기준 | 되돌리기 |
|---|---|---|---|---|---|
| A1 브리지·메뉴 | 연결·권한·훅·개요 | `src/lib/tomo-bridge.server.ts`, `src/lib/tomo-types.ts`, `src/routes/api/tomo-hook.ts`, `src/routes/admin/tomo.index.tsx`, `src/components/admin/ui/nav-tomo.ts`. 기존 파일은 `nav.ts`(import 1줄 + 배지 키 1개), `integrations.tsx`(`tomo_ops` 칸), `admin-site.ts`(외부 사이트 1개)만 건드린다 | `2026MMDDHHMMSS_tomo_bridge.sql`: `tomo_events`(event_id 유일), `tomo_ops_log`, 메뉴 권한 키 `tomo.ops`·`tomo.money` | 토큰이 없으면 TOMO 메뉴가 안 보인다. 개요에 tomo 건수가 뜬다. tomo 를 끄면 「확인 못 함」이 뜬다. 같은 이벤트 두 번이 알림 한 번이 된다 | `tomo_ops` 비밀값을 지우면 메뉴가 숨는다. 표는 남겨도 해가 없다 |
| A2 운영 화면 | 대행·C2C·센터·문의·신고·회원·활동 | `src/routes/admin/tomo.proxy.tsx`, `tomo.trades.tsx`, `tomo.center.tsx`, `tomo.support.tsx`, `tomo.reports.tsx`, `tomo.users.tsx`, `tomo.activity.tsx`, `src/components/admin/tomo/**` | 없음 | 대행 요청 상태를 바꾸고 새로 고쳐도 유지된다. tomo 고객 화면에 같은 상태가 보인다. tomo 활동 기록에 연결된 운영자 이름이 남는다 | 라우트 파일 삭제 |
| A3 돈 화면·홈 | 환불·분쟁·출금·홈 합치기·가드 | `src/routes/admin/tomo.refunds.tsx`, `tomo.disputes.tsx`, `tomo.payouts.tsx`. 기존 파일은 `admin/index.tsx`(TOMO 칸 1개), `payments.tsx`(tomo 결제 환불 가드)만 건드린다 | 없음(필요하면 `2026MMDDHHMMSS_tomo_money_guard.sql`) | `tomo.money` 없는 직원에게 실행 버튼이 안 보이고 서버도 거부한다. 시험 환불이 tomo `refunds` 와 Stripe 에 한 번만 남는다. 에어쉽 결제 화면에서 tomo 결제 환불이 막힌다 | 라우트 파일 삭제, 가드는 남긴다 |

- 마이그레이션 이름: `YYYYMMDDHHMMSS_설명.sql`. 푸시 직전에 `git fetch` 하고 `origin/migrate-vercel` 의 최신 파일보다 뒤 시각으로 붙인다.
- 충돌 주의 1: 다른 세션이 같은 브랜치에 푸시한다. 작업 전후로 `git fetch` + `git rebase origin/migrate-vercel` 을 한다. 별도 작업 폴더(worktree)에서 일한다.
- 충돌 주의 2: `src/routeTree.gen.ts` 는 손으로 합치지 않는다. 리베이스 뒤 다시 생성한다.
- 충돌 주의 3: `nav.ts`·`admin/index.tsx`·`payments.tsx` 는 여러 세션이 고친다. 한 덩어리만 넣고, 정의는 새 파일(`nav-tomo.ts`)에 둔다.
- 충돌 주의 4: 푸시하면 Vercel 이 바로 배포한다. TOMO 메뉴는 비밀값이 있어야만 보이므로, 화면이 덜 된 상태로 푸시해도 운영에 드러나지 않는다.
- 운영 확인 시 `lang=` 이 붙은 에어쉽 주소를 열지 않는다.

## 7. API 약속(T3·A1 공통)

| 경로 | 메서드 | 용도 | 권한 키 |
|---|---|---|---|
| `/api/ops/health` | GET | 상태·크론 마지막 실행 | 서명만 |
| `/api/ops/counts` | GET | 「내 차례」 건수·지연 건수 | `tomo.ops` |
| `/api/ops/proxy` , `/api/ops/proxy/:id` | GET | 대행 주문·요청 목록·상세 | `tomo.ops` |
| `/api/ops/proxy/:id/status` | POST | 상태 변경(`expected_status`, 메모, 송장) | `tomo.ops` |
| `/api/ops/proxy/:id/cancel` | POST | 운영자 취소(환불 대기 생성) | `tomo.money` |
| `/api/ops/trades`, `/api/ops/trades/:id` | GET | C2C 거래 | `tomo.ops` |
| `/api/ops/center/:code/…` | GET·POST | 입고·검수·발송 | `tomo.ops` |
| `/api/ops/disputes/:id/resolve` | POST | 분쟁 결정 | `tomo.money` |
| `/api/ops/refunds`, `/api/ops/refunds/:id/run` | GET·POST | 환불 대기열·실행 | `tomo.money` |
| `/api/ops/payouts`, `/api/ops/payouts/:id/paid` | GET·POST | 출금 목록·송금 완료 | `tomo.money` |
| `/api/ops/support/:id/reply` | POST | 문의 답변 | `tomo.ops` |
| `/api/ops/reports/:id/act` | POST | 신고 처리 | `tomo.ops` |
| `/api/ops/users`, `/api/ops/users/:id/suspend` | GET·POST | 회원 조회·정지 | `tomo.ops` |
| `/api/ops/activity` | GET | 활동 기록 | `tomo.ops` |

- 모든 POST 본문: `request_id`(uuid), `actor`(에어쉽 관리자 id·이메일), `expected_status`(상태 변경일 때).
- 모든 응답: `{ ok, data | error, request_id }`. 목록에는 `code`(T/TX 번호), `center`(tomo 값), `center_airship`(KR/JP)을 넣는다.
- 권한 키는 에어쉽이 서명 본문에 담아 보내고, tomo 는 연결된 운영자의 권한과 한 번 더 대조한다.


## 8. 13번 로드맵에 따른 수정

- 근거: [13-commerce-platform-roadmap.md](13-commerce-platform-roadmap.md) 3장. TOMO 연결을 「연결 사이트」 공용으로 만든다. 두 번째 사이트(키라팝)를 붙일 때 표·권한 키·주소를 갈아엎지 않기 위해서다.
- 범위: 이름·표·칸·주소만 바꾼다. 1~5장의 흐름·돈 경로·멱등 규칙과 각 트랙의 완료 기준·되돌리기는 그대로다.
- 이 절이 6.2·7장의 같은 항목보다 우선한다. 위 내용은 지우지 않는다.
- 확인한 사실(2026-11-27): 에어쉽 `migrate-vercel`(`ced9b1a3`)에 A1 코드가 없다. tomo 메인 폴더에 `app/api/ops` 가 없다. 그래서 지금 바꿔도 운영 데이터 이전이 없다. T3 작업 폴더에 이미 쓴 코드가 있으면 병합 전에 8.3 을 반영한다.

### 8.1 이름 대응표(에어쉽 쪽, 6.2 전체에 적용)

| 원안 | 수정 |
|---|---|
| 표 `tomo_events`(`event_id` 유일) | `connected_site_events`(`site_key` 칸, `(site_key, event_id)` 유일) |
| 표 `tomo_ops_log` | `connected_site_ops_log`(`site_key` 칸) |
| 「어드민 전용 외부 사이트 목록」(3.6) | 표 `connected_sites`: `site_key`, 이름, 소유 구분(`own`/`client`), 주소, 규격 버전, `capabilities`, 통화, 상태, 마지막 성공 시각. `public.sites` 와 합치지 않는다 |
| `integration_secrets` 의 `tomo_ops` | `provider = 'site:tomo'`(규칙 `site:<site_key>`) |
| 권한 키 `tomo.ops`·`tomo.money`(`admin_menu_access`) | 새 표 `connected_site_access(user_id, site_key, scopes text[])`. scope 는 `ops`·`money`. **행 없음 = 거부.** 소유자(`is_owner`)만 기본 전체 |
| 라우트 `/admin/tomo`, `/admin/tomo/<화면>` | `/admin/sites/$site`, `/admin/sites/$site/<화면>`(`/admin/sites/tomo/proxy`) |
| `src/lib/tomo-bridge.server.ts`, `src/lib/tomo-types.ts` | `src/lib/connected/bridge.server.ts`(인자 `siteKey`), `src/lib/connected/types.ts` |
| `src/components/admin/tomo/**`, `nav-tomo.ts` | `src/components/admin/connected/**`, `nav-connected.ts` |
| 훅 `src/routes/api/tomo-hook.ts`(`/api/tomo-hook`) | `src/routes/api/site-hook.$site.ts`(`/api/site-hook/tomo`). 토큰은 사이트마다 다르다 |
| 배지 키 `tomo` | `site:<site_key>`(`site:tomo`) |
| 마이그레이션 `…_tomo_bridge.sql`, `…_tomo_money_guard.sql` | `…_connected_sites.sql`, `…_connected_site_money_guard.sql` |

- 권한 표를 따로 두는 이유: `admin_menu_access` 는 화면을 가리는 장치이고 「행 없음 = 전체 접근」이다. 그 표에 돈 권한을 두면 제한 행이 없는 직원이 TOMO 환불을 실행할 수 있다. 5장 결정 2(소유자만)와 어긋난다.
- 메뉴 가림은 지금 방식 그대로 쓴다. `/admin/sites/tomo` 경로를 `admin_menu_access.menus` 에 넣으면 그 사이트 메뉴가 보인다. 실행 권한은 서버 함수가 `connected_site_access` 로 따로 확인한다.

### 8.2 6.2 트랙별 수정

| 트랙 | 수정 |
|---|---|
| A1 | 파일·표·비밀값 이름을 8.1 로 바꾼다. `nav-connected.ts` 는 `connected_sites` 행마다 메뉴 그룹 하나를 만들고, 그 사이트 `capabilities` 에 있는 항목만 그린다. `admin-site.ts` 는 TOMO 를 박아 넣지 않고 `connected_sites` 를 읽어 선택지에 더한다. 개요 화면은 `GET /api/ops/meta` 로 규격 버전·기능을 읽어 `connected_sites` 에 저장한다. 완료 기준 추가: `connected_site_access` 행이 없는 관리자에게 TOMO 메뉴가 보이지 않고 서버도 거부한다. tomo 의 `capabilities` 에서 한 기능을 빼면 그 메뉴가 사라진다 |
| A2 | 라우트 파일을 `src/routes/admin/sites.$site.<화면>.tsx` 로 둔다. 화면은 `site_key` 를 인자로 받는다. 화면 위쪽에 사이트 이름 띠를 고정한다. 완료 기준 추가: 화면 코드에 `tomo` 문자열이 없다(라벨은 `connected_sites` 의 이름을 쓴다) |
| A3 | 돈 화면 실행 버튼과 서버 관문을 scope `money` 로 확인한다. 확인 창에 사이트 이름·금액·대상을 적는다. `payments.tsx` 가드는 「연결 사이트 결제는 여기서 환불하지 않는다」로 일반화한다(Stripe 메타데이터의 사이트 값이 에어쉽·요루가 아니면 막는다). 홈 합치기는 `counts` 배열을 사이트별로 그린다 |

### 8.3 7장(API 약속) 수정 — T3·A1 공통

| 항목 | 원안 | 수정 |
|---|---|---|
| 자기소개 | 없음 | `GET /api/ops/meta`(서명만) → `{ api_version: 1, site: { key, name, currency }, capabilities: [...], money_actions: [...] }` |
| 버전 | 없음 | 요청 헤더 `x-ops-version: 1`. 모든 응답에 `api_version`. 칸·기능·이벤트 추가는 같은 버전, 뜻 변경·삭제는 새 버전 |
| 권한 값 | `tomo.ops`·`tomo.money` | `scope: "ops" \| "money"`. 7장 표의 「권한 키」 칸을 이 값으로 읽는다 |
| 센터 코드 칸 | `center_airship`(KR/JP) | `center_country`(ISO 두 글자) |
| 운영자 칸 | `actor`(에어쉽 관리자 id·이메일), `ops_actors` 의 에어쉽 관리자 칸 | `actor: { id, email }` 뜻은 「센터 운영자」. `ops_actors` 칸 이름은 `center_actor_id`·`center_actor_email` |
| 환경 변수 | `AIRSHIP_HOOK_TOKEN` | `OPS_HOOK_URL`, `OPS_HOOK_TOKEN`. `OPS_BRIDGE_SECRET` 은 그대로 |
| `counts` 응답 | 형태 미정 | `[{ key, label, count, overdue, capability, url }]` |
| 이벤트 | 한글 설명 | 종류 이름 고정: `order.paid`, `order.cancel_requested`, `dispute.opened`, `ticket.opened`, `refund.pending`, `payout.requested`, `report.opened`, `errors.spike`, `cron.failed`. 본문 공통 칸: `event_id`, `site_key`, `type`, `code`, `amount`, `currency`, `url`, `occurred_at` |
| 모르는 값 | — | 센터는 모르는 기능·이벤트를 무시하고 시스템 상태에 건수만 보여 준다. tomo 는 모르는 버전 요청에 400 과 지원 버전을 돌려준다 |

- tomo v1 기능 선언: `proxy`, `c2c`, `center`, `disputes`, `refunds`, `payouts`, `support`, `reports`, `users`, `activity`.
- `/api/ops/…` 경로 이름은 이미 사이트 이름이 없어 그대로 둔다.

### 8.4 바꾸지 않는 것

- 주문을 에어쉽 `orders` 로 넘기지 않는다(1장).
- `public.sites` 와 에어쉽 9개 표의 brand 칸에 TOMO 를 넣지 않는다(3.6).
- 서명·시각 검사·`request_id` 멱등·`expected_status`·outbox 재전송(3.2·3.3).
- 매출 통계를 사이트끼리 합치지 않는다(3.4).
- 에어쉽·요루에 운영 API 를 붙이는 일, 센터를 따로 배포하는 일은 13번 3단계로 미룬다.


## 9. 구현된 운영 API(v1)

- 구현: 2026-11-27 T3. 코드 `lib/ops-bridge.ts`(서명·멱등·이벤트 본문, 순수 함수), `lib/ops-server.ts`(인증·운영자 세션·멱등 저장), `lib/ops-api.ts`(경로 표), `app/api/ops/[...path]/route.ts`, `app/api/cron/ops-outbox/route.ts`. DB `0043_ops_bridge.sql`(운영 적용 완료).
- 이 절이 7장·8.3 과 다르면 이 절이 실제 동작이다. 서명 호출 예시는 `scripts/ops-call.mts`.
- A3(2026-11-27): 경로 4개 추가(미지급 합계·원장 잔액·원장 조정·보류 해제). `meta.money_actions` 에 `ledger.adjust`. 경로 scope 는 `tests/unit/ops-routes-a3.test.ts` 가 지킨다. SQL 변경 없음(0045 없음).

### 9.1 공통 규칙

| 항목 | 값 |
|---|---|
| 주소 | `https://tomo.airship.click/api/ops/<경로>` |
| 꺼짐 | env `OPS_BRIDGE_SECRET` 이 없으면 모든 경로 503 `ops bridge disabled` |
| 필수 헤더 | `x-ops-version: 1`, `x-ops-key-id`, `x-ops-ts`(유닉스 초), `x-ops-sig`(hex 소문자) |
| 운영자 헤더 | `x-ops-actor-id`(센터 관리자 id), `x-ops-actor-email`, `x-ops-scope`(`ops`\|`money`). meta·health 는 없어도 된다. 7장의 본문 `actor` 대신 이 헤더를 쓴다 |
| 서명 문자열 | 줄바꿈(`\n`)으로 9칸: `v1`, 키 id, ts, 메서드(대문자), 경로+쿼리, 운영자 id, 운영자 이메일(소문자), scope, 본문 SHA-256 hex(빈 본문도 빈 문자열의 해시) |
| 경로+쿼리 정규화 | 쿼리는 `new URLSearchParams(q).toString()` 으로 다시 직렬화한 값을 쓴다(`,` → `%2C`). 쿼리가 비면 `?` 없이 경로만 |
| 서명 | `HMAC-SHA256(OPS_BRIDGE_SECRET, 서명 문자열)`. 비교는 상수 시간. 시각 차이 300초 초과는 401 |
| 버전 | `x-ops-version` 이 1 이 아니거나 없으면 400 `unsupported x-ops-version (supported: 1)` |
| 응답 | 항상 JSON `{ api_version: 1, ok, data \| error, request_id, ... }`. 조작 응답에는 `replayed`(저장된 결과를 다시 준 것인지)가 붙는다 |
| 오류 코드 | 400 입력 오류·RPC 거부(`error` 에 DB 메시지), 401 서명, 403 운영자·권한, 404 없음, 409 상태 불일치·중복 id·실행 중, 500 결과 모름, 502 DB 조회 실패, 503 꺼짐 |
| 목록 쪽수 | `limit`(1~200, 기본 50), `offset`(기본 0). 응답 `data = { items, total }` |
| 센터 칸 | 목록·상세 행에 `center`(SEOUL/NARITA)와 `center_country`(KR/JP) |
| 지연 칸(A2) | 대행·거래·센터·분쟁·문의·신고 목록 행에 `aging_level`(`warn`\|`late`\|null)·`aging_since`. 기준은 `lib/admin-aging.ts`. 운영자 차례가 아닌 단계는 null |

### 9.2 운영자·권한

| 규칙 | 동작 |
|---|---|
| 연결 | `ops_actors` 에서 `center_actor_id` 로 먼저 찾고, 없으면 `center_actor_email` 로 찾는다. 이메일로 찾은 행의 `center_actor_id` 가 비어 있으면 **첫 서명 요청의 `x-ops-actor-id` 로 채운다**. 그 뒤로는 id 가 달라지면 403 |
| 지금 연결 | Ren(`mellowdazzle@gmail.com`, tomo 닉네임 「렌」, `is_owner=true`), `center_actor_id` 는 비어 있다(A1 첫 요청이 채운다) |
| 403 | `actor required`, `scope required (ops\|money)`, `actor not linked`, `money scope required`(돈 경로를 ops 로 부름), `money scope is owner only`, `linked operator is not an active admin`(tomo 프로필이 운영자 아님·정지·삭제) |
| 실행 이름 | 조작은 그 운영자의 tomo 사용자 세션으로 기존 RPC 를 부른다(설계 1안). 활동 기록(`admin_actions.admin_id`)에 tomo 운영자가 남는다. 환불 실행만 기존과 같이 서버 권한(`runRefund`) |

### 9.3 조작 공통 본문

```json
{ "request_id": "uuid", "expected_status": "현재 상태", "...경로별 칸": "..." }
```

| 상황 | 응답 |
|---|---|
| `request_id` 없음·uuid 아님 | 400 |
| `expected_status` 없음 | 400 |
| 처음 받은 id | 현재 상태를 읽어 다르면 409 `{ error: "status mismatch", current_status, expected_status }`(실행 안 함). 같으면 실행 |
| 같은 id 재요청(같은 동작·대상·운영자) | 저장된 결과 그대로, `replayed: true`. 다시 실행하지 않는다 |
| 같은 id 를 다른 동작·대상·운영자에 | 409 `request_id already used for another action` |
| 같은 id 가 실행 중 | 409 `in_progress` → 상세를 다시 읽어 판정 |
| 실행 중 예외 | 500 `result unknown: …` 를 저장한다. 같은 id 로는 다시 실행되지 않는다. 상세를 다시 읽고 새 id 로 보낸다 |

- 409·400 결과도 저장된다. 상태를 다시 읽은 뒤에는 **새 request_id** 로 보낸다.

### 9.4 경로 표

| 경로 | 메서드 | scope | 요청(쿼리·본문) | 응답 `data` | expected_status 대상 |
|---|---|---|---|---|---|
| `/api/ops/meta` | GET | 서명만 | — | `{ api_version, site{key,name,currency,url}, capabilities[10], events[9], money_actions[] }` | — |
| `/api/ops/health` | GET | 서명만 | — | `{ version, db, db_ms, cron{job:{ok,at}}, outbox{hook_configured,pending,failing,dead_24h,last_sent_at}, errors_24h }` | — |
| `/api/ops/counts` | GET | ops | — | `[{ key, label, count, overdue, capability, url }]` 10줄. 조회 실패한 줄은 `count: null, overdue: null`(「확인 못 함」) | — |
| `/api/ops/proxy` | GET | ops | `status`(쉼표), `q`(T 번호·주문 uuid), `cancel_requested=1` | `{ items[대행 요청 행 + external_items + customer + proxy_orders{code,…}], total }` | — |
| `/api/ops/proxy/:id` | GET | ops | `:id` = proxy_requests.id | `{ item, order(배송지·통관번호 포함), items[같은 주문 형제], refunds[], cancel_preview{amount,cap,currency,full} \| null }` | — |
| `/api/ops/proxy/:id/status` | POST | ops | `to`, `note`, `tracking` → `admin_set_order_status` | `{ result: proxy_requests 행 }` | proxy_requests.status |
| `/api/ops/proxy/:id/quote` | POST | ops | `item_price`, `fee`, `shipping`(0 이상 정수, 엔) → `admin_quote_proxy`(0044, quote_proxy + 활동 기록 `proxy_quote`) | `{ result: proxy_requests 행 }` | proxy_requests.status(`requested`·`quoted`) |
| `/api/ops/rates` | GET | ops | — | `{ JPY_KRW: {rate, updated_at} \| null, KRW_JPY: …, last_run: { ok, at, status, source_date, raw, jpy_krw, change, error } \| null }` — 지금 적용 값과 마지막 자동 갱신 결과(A2). 운영자 화면 전용 | — |
| `/api/ops/proxy/:id/cancel` | POST | money | `reason`(필수), `refund_amount`(없으면 기본값) → `adminCancel(type proxy)` | `{ ok, refund: null \| { id, status, error? } }` | proxy_requests.status |
| `/api/ops/trades` | GET | ops | `status`(쉼표), `q`(TX 번호·uuid) | `{ items[거래 + listing + buyer + seller], total }` | — |
| `/api/ops/trades/:id` | GET | ops | — | `{ item, refunds[] }` | — |
| `/api/ops/trades/:id/advance` | POST | ops | `to`, `tracking` → `advance_transaction` | `{ result: transactions 행 }` | transactions.status |
| `/api/ops/trades/:id/cancel` | POST | money | `reason`(필수) → `admin_cancel_transaction` + 환불 | `{ ok, refund }` | transactions.status |
| `/api/ops/trades/:id/complete` | POST | money | `note` → `admin_complete_transaction` | `{ ok, refund: null }` | transactions.status |
| `/api/ops/center/:center` | GET | ops | `:center` = SEOUL·NARITA·KR·JP. `shipped_to_center`·`center_received` 거래 | `{ items, total }` | — |
| `/api/ops/center/:center/:id/advance` | POST | ops | 위 `trades/:id/advance` 와 같음. 그 센터 거래가 아니면 404 | `{ result }` | transactions.status |
| `/api/ops/disputes` | GET | ops | `disputed` 거래(`dispute_reason`·`disputed_from` 포함) | `{ items, total }` | — |
| `/api/ops/disputes/:id/resolve` | POST | money | `to`(`completed`\|`cancelled`), `note` → `resolve_dispute` + 환불 | `{ ok, refund }` | transactions.status(`disputed`) |
| `/api/ops/refunds` | GET | money | `status`(기본 `pending,failed`) | `{ items[환불 + customer], total }` | — |
| `/api/ops/refunds/:id/run` | POST | money | — → `runRefund`(Stripe, 같은 환불 id 는 한 번만) | `{ id, status: done\|failed\|pending, error? }`. done 200, 그 밖 202 | refunds.status(`pending`·`failed`) |
| `/api/ops/payouts` | GET | money | `status`(기본 `requested`). 계좌 정보 포함 | `{ items, total }` | — |
| `/api/ops/payouts/:id/paid` | POST | money | `note` → `admin_process_payout(sent=true)` | `{ result: payouts 행 }` | payouts.status(`requested`) |
| `/api/ops/payouts/:id/reject` | POST | money | `note` → `admin_process_payout(sent=false)` | `{ result }` | payouts.status |
| `/api/ops/support` | GET | ops | `status`(기본 `open`) | `{ items[문의 + customer{nickname,language}], total }` | — |
| `/api/ops/support/:id/reply` | POST | ops | `reply`(필수, 2000자) → 상태 `answered` | `{ result: { id, status } }` | support_tickets.status |
| `/api/ops/support/:id/close` | POST | ops | — → 상태 `closed` | `{ result }` | support_tickets.status |
| `/api/ops/reports` | GET | ops | `status`(기본 `open`) | `{ items, total }` | — |
| `/api/ops/reports/:id/act` | POST | ops | `status`(`resolved`\|`dismissed`\|`open`), `note`, `hide_listing`(true 면 상품 신고 대상 숨김) → `admin_resolve_report` | `{ result, listing_hidden }` | reports.status |
| `/api/ops/users` | GET | ops | `q`(닉네임 일부·uuid) | `{ items[프로필], total }` | — |
| `/api/ops/users/:id` | GET | ops | — | 프로필 + `email` | — |
| `/api/ops/users/:id/suspend` | POST | ops | `suspended`(boolean) → `admin_set_user`(운영자 여부는 그대로) | `{ result: null }` | `active`·`suspended` |
| `/api/ops/users/:id/delete` | POST | money | — → `adminDeleteUser`(진행 거래 등 있으면 409 + `blockers`) | `{ deleted: true }` | `active`·`suspended`·`deleted` |
| `/api/ops/activity` | GET | ops | `limit`, `before_id`, `action` | `{ items[admin_actions + admin{nickname}] }`(id 내림차순) | — |
| `/api/ops/payouts/summary` | GET | money | — → `admin_seller_liability`(운영자 세션, A3) | `{ items[{ currency, balance, pending, users }] }` 미지급 합계 = balance + pending | — |
| `/api/ops/users/:id/ledger` | GET | money | — (A3) | `{ balances{KRW,JPY}(원장 합, 1000행씩 끝까지), recent[20] }` | — |
| `/api/ops/users/:id/ledger_adjust` | POST | money | `currency`(KRW\|JPY), `amount`(0 아닌 정수, 차감은 음수), `memo`(필수) → `admin_adjust_seller_ledger` (A3) | `{ result: seller_ledger 행 }` | **`<통화>:<지금 잔액>`**(예 `KRW:12000`) — 화면에서 본 잔액이 그사이 바뀌면 409 |
| `/api/ops/listings/:id/release` | POST | ops | `note`(필수) → `admin_release_listing_hold`(0041, 반송 확인 → 판매중 + 판매자 숨김, 판매자 알림 0044) (A3) | `{ result: listings 행 }` | listings.status(`held`) |

### 9.5 이벤트(tomo → 센터)

| 항목 | 값 |
|---|---|
| 보내는 곳 | env `OPS_HOOK_URL`(예정: `https://airship.click/api/site-hook/tomo`), 헤더 `authorization: Bearer <OPS_HOOK_TOKEN>`, `x-ops-version: 1`, `x-ops-site: tomo` |
| 꺼짐 | 둘 중 하나라도 없으면 보내지 않는다(outbox 에 쌓이고 24시간 뒤 포기). **2026-11-27 현재 둘 다 없음** — A1 이 받는 쪽을 만든 뒤 Coolify 에 넣는다 |
| 주기 | pg_cron `tomo_ops_outbox` 1분마다 → `POST /api/cron/ops-outbox`(x-cron-secret) → 한 번에 50건 |
| 성공 | 받는 쪽이 2xx. 그 밖은 실패 → 1·2·4·…분(최대 2시간) 뒤 다시. 첫 발생 24시간 뒤 포기(`dead_at`) |
| 중복 | 같은 `event_id` 가 두 번 갈 수 있다(타임아웃 뒤 재전송). 받는 쪽은 `(site_key, event_id)` 로 버린다 |
| 본문 | `{ api_version: 1, event_id, site_key: "tomo", type, code, amount, currency, url, occurred_at, target: { type, id } \| null }`. 개인정보 없음 |

| type | 언제 | code / amount | target.type |
|---|---|---|---|
| `order.paid` | 대행 주문(proxy_orders) 결제 완료. 주문당 한 번 | T 번호 / 주문 총액 | `proxy_order` |
| `order.cancel_requested` | 고객 취소 요청(cancel_requested_at 기록) | T 번호 / 견적 합계(없으면 null) | `proxy_request` |
| `dispute.opened` | 거래가 `disputed` 로 바뀜 | TX 번호 / 상품가 | `transaction` |
| `ticket.opened` | 문의 접수 | null | `support_ticket` |
| `refund.pending` | 환불 대기 행 생성 | TX·T 번호 / 환불액 | `refund` |
| `payout.requested` | 출금 신청 | null / 금액 | `payout` |
| `report.opened` | 신고 접수 | null | `report` |
| `errors.spike` | 서버 오류가 15분 안 5회 이상(시간당 한 번) | null / 횟수 | `error_events` |
| `cron.failed` | `cron_runs` 에 실패 기록 | 작업 이름 | `cron_run` |

### 9.6 검증(2026-11-27)

| 항목 | 결과 |
|---|---|
| 0043 리허설 | 운영 DB `begin … rollback` 2회: 이벤트 8종 트리거(errors.spike 는 미시험)·중복 방지·잘못된 종류가 업무 쓰기를 막지 않음·잡기/실패 1분·2분 뒤/재잡기/성공/24시간 포기·클라이언트 권한 없음·request_id 유일 확인. 되돌림 확인 후 적용 |
| 서명 | 틀린 서명 401, 시각 초과 401, 쉼표 쿼리 정규화(단위 테스트 + 실서버) |
| 운영자 | 연결 없는 운영자 403, ops scope 로 돈 경로 403, 소유자 아닌 운영자 money 403 |
| 멱등 | 시험 계정 문의에 같은 request_id 답변 2회 → 실행 1회(활동 기록 1건), 두 번째 `replayed: true`. 기대 상태 다름 409 |
| 1안 | 시험 운영자로 `admin_set_user`(시험 계정 정지·해제), 문의 답변 → 활동 기록 `admin_id` 가 그 운영자. RPC 수정 없음 |
| 훅 재전송 | SQL 리허설(실패 → 간격 → 재전송 → 성공) + 단위 테스트(5xx·네트워크 오류는 실패, 2xx 만 성공). 실제 받는 쪽은 A1 뒤 확인 |
| 운영(4d5a412) | 서명된 `GET /api/ops/meta`·`counts` 200, health 200(version 4d5a412), 틀린 서명 401, 연결 없는 운영자 403, 버전 헤더 없음 400, 크론 경로 비밀값 없음 401, pg_cron 호출 200 `skipped`(훅 env 없음). Actions server-image #23·db-tests #14·smoke #14 성공 |
