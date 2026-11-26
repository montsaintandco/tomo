# TOMO GEO 점검 (2026-11-23)

대상: https://tomo.airship.click
코드: C:\dev\tomo (읽기 전용 점검, 코드·사이트 수정 없음, 커밋 없음)

## 결론

- AI 크롤러는 막혀 있지 않다. 검사한 AI 봇 모두 UA 기준 200 응답이다.
- 주요 페이지 본문은 서버 렌더 HTML에 있다. JS 없이 읽힌다.
- 수수료 정보가 페이지마다 다르다. 직거래 판매 수수료 10%는 공개 페이지에 없다.
- 운영사(몽상앤코)와 AirShip의 관계를 TOMO 본문이 설명하지 않는다.
- AI 검색에서 TOMO 노출 근거는 찾지 못했다.
- GEO 준비도 약 55/100 (추정, 공식 점수 아님).

## 1. AI 크롤러 접근

| 봇 | 역할 | robots.txt | UA 실측 (GET /) | 판정 |
|---|---|---|---|---|
| GPTBot | OpenAI 학습 | 명시 규칙 없음, 기본 허용 | 200 | 허용 |
| OAI-SearchBot | ChatGPT 검색 인용 | 명시 규칙 없음, 기본 허용 | 200 | 허용 |
| ChatGPT-User | 사용자 요청 브라우징 | robots 적용 대상 아님 | 200 | 허용 |
| ClaudeBot | Anthropic 학습 | 명시 규칙 없음, 기본 허용 | 200 | 허용 |
| Claude-SearchBot | Claude 검색 인용 | 명시 규칙 없음, 기본 허용 | 200 | 허용 |
| PerplexityBot | Perplexity 검색 | 명시 규칙 없음, 기본 허용 | 200 | 허용 |
| Googlebot | Google 검색·AI Overviews | 명시 규칙 없음, 기본 허용 | 200 | 허용 |
| Bingbot | Bing·Copilot | 명시 규칙 없음, 기본 허용 | 200 | 허용 |
| Google-Extended | Gemini 학습·그라운딩 (검색 아님) | 명시 규칙 없음 | UA 요청 대상 아님 | 기본 허용으로 보임 |
| Applebot-Extended, CCBot, Bytespider | 학습용 | 명시 규칙 없음 | 미실측 | 기본 허용으로 보임 |

- robots.txt는 `User-agent: *` 규칙 하나다 (app/robots.ts).
- 차단 경로: /admin, /mypage, /chat, /api, /order, /transactions, /cart, /login, /onboarding, /sell, /proxy, /profile, /global/, /*?q=, /*&q=.
- 실측 방법: 봇 UA 문자열만 바꿔 요청했다. 실제 봇 IP 검증은 하지 않았다.
- 응답 본문에 Cloudflare 챌린지 문자열은 없었다.
- 응답 헤더 Server 값이 `System.String[]`로 찍힌다 (하, 관찰만).

| # | 심각도 | 위치 | 증거 | 고칠 방향 | 관련 코드 |
|---|---|---|---|---|---|
| C-1 | 중 | robots.txt의 /global/ 차단 | 해외 마켓 상품 상세(/global/[source]/[id])가 모든 봇에 막힘. 코드 주석은 「외부 상품은 항상 동적·품절 변동」이 이유다. | 상품 상세 SSR을 허용할지 Ren이 정한다. 허용하면 대표 상품을 sitemap에 넣는 방식을 검토한다. | app/robots.ts |

## 2. llms.txt

- 있음: /llms.txt (app/llms.txt/route.ts, 하루 캐시). 운영사·사업자번호·주소·메일은 환경변수에서 채운다.
- 없음: /llms-full.txt (404). 선택 사항이라 필수는 아니다.
- 실측 내용은 푸터·사업자 정보와 일치한다 (몽상앤코, 762-25-00775, help@airship.click).
- 옛 흔적은 없다. 토스·Vercel·이든에이치·tomo-delta는 렌더된 본문에 0건이다. Stripe는 /terms, /privacy에만 나온다.
- Google 검색은 llms.txt를 쓰지 않는다. 이 파일은 비구글 AI 시스템용 보조 자료로만 본다.

| # | 심각도 | 위치 | 증거 | 고칠 방향 | 관련 코드 |
|---|---|---|---|---|---|
| L-1 | 중 | llms.txt 「결제 항목은 세 가지」 | /help에는 「현지 유통비」 항목이 붙을 수 있다고 적혀 있다. llms.txt와 /guide는 세 가지로만 말한다. | 「일부 판매처는 현지 유통비가 따로 붙는다」 한 줄을 추가한다. | app/llms.txt/route.ts, lib/help-faq.ts |
| L-2 | 하 | llms.txt 「Fees (as of 2026-09)」 | 날짜 표기가 오래됐다. | 날짜를 갱신하거나 날짜 표기를 지운다. | app/llms.txt/route.ts |

## 3. 인용 가능성과 서버 렌더링

- 서버 렌더 HTML에 본문이 있다 (JS 없이 확인): /, /guide, /about, /help, /refund, /terms, /privacy, /notice, /travel, /categories/figure, /global. 본문 900~3,300자 범위다.
- 미확인: 상품 상세(/listings/[id], /global/[source]/[id])의 본문 SSR 여부.
- 숫자가 있는 질문-답: /guide, /help FAQ에 「10~18일」, 「면세 한도 약 20만원 / 1만엔」, 「상품가의 10%」, 「결제는 1회」가 있다. 양호.
- /about: 첫 문장에 정의가 있다 (「TOMO는 한국과 일본의 중고마켓을 한 곳에서 보고…」). 숫자·조건은 없다.

| # | 심각도 | 위치 | 증거 | 고칠 방향 | 관련 코드 |
|---|---|---|---|---|---|
| I-1 | 중 | /about | 본문 1,295자. 운영사 설명 문장이 본문에 없다 (푸터에만 있다). 「서비스 소개 · サービス紹介」 제목에 검색 키워드가 없다. | 본문에 운영사 한 문장과 질문형 소제목을 넣는다. 제목에 「한일 중고거래」 키워드를 넣는다. | app/about/page.tsx |
| I-2 | 하 | /travel (900자), /notice (925자) | 본문이 얇다. | 여행 직거래 절차를 질문-답으로 보강한다. | app/travel/page.tsx, app/notice/page.tsx |
| I-3 | 하 | /guide와 /help FAQ | 「결제 1회」「배송 10~18일」「관세」 답이 같은 문장으로 두 곳에 있다. | 한 곳을 정본으로 두고 다른 쪽은 링크로 연결한다. | lib/guide-content.ts, lib/help-faq.ts |
| I-4 | 하 | 관세 공식 표현 | /guide는 「세금 + 5%」, /help는 「관세 8%·부가세 10%에 5%를 더해」, llms.txt는 「세금 + 5%」다. 뜻은 같지만 문장이 다르다. | lib/fees.ts 상수에서 문장을 한 번만 만든다. | lib/fees.ts, lib/guide-content.ts, lib/help-faq.ts, app/llms.txt/route.ts |

## 4. 엔티티 신호와 구조화 데이터

확인된 구조화 데이터:

| 페이지 | 타입 | 상태 |
|---|---|---|
| 전체 | WebSite, Organization (name, legalName 몽상앤코, url, logo, address, contactPoint 이메일) | 있음. logo /icon-512.png 200 확인 |
| 전체 hreflang | 홈에 ko, ja, x-default | 있음 |
| /guide | FAQPage, HowTo (4단계) | 있음 |
| /help | FAQPage (12개 질문) | 있음 |
| 상품 상세 (/listings/[id]) | Product, BreadcrumbList | 있음 (코드 확인, 실제 렌더는 미확인) |
| 기타 정보 페이지 | BreadcrumbList | 확인 못 함 |

| # | 심각도 | 위치 | 증거 | 고칠 방향 | 관련 코드 |
|---|---|---|---|---|---|
| E-1 | 중 | Organization JSON-LD | sameAs가 없다. 공식 SNS·블로그 링크가 없다. telephone도 없다 (전화는 env가 비어 있다). | 운영 SNS·블로그 URL을 sameAs에 넣는다 (소유 확인 후). 전화 env를 채운다. | app/layout.tsx:85-91 |
| E-2 | 중 | 운영사 관계 | 같은 운영사(몽상앤코)·같은 사업자번호·같은 메일 도메인(airship.click)이 AirShip 페이지에도 있다. 검색 결과에서 AirShip 페이지에 같은 사업자 정보가 나왔다. TOMO 본문은 AirShip과의 관계를 밝히지 않는다. | /about에 「TOMO는 몽상앤코가 운영하며, 에어쉽(AirShip)은 같은 회사의 다른 서비스다」를 쓴다. TOMO 전용 연락처 메일을 쓸지 Ren이 정한다. | app/about/page.tsx, components/SiteFooter.tsx, app/layout.tsx |
| E-3 | 하 | HowTo, FAQPage | Google 리치결과 표시가 줄어든 상태다 (HowTo는 2023년 이후 표시가 중단됐고 FAQ는 제한됐다). AI 파서용 참고로만 가치가 있다. | 유지해도 된다. 우선순위는 낮다. | app/guide/page.tsx, app/help/page.tsx |
| E-4 | 하 | app/layout.tsx:40 주석 | 「tomo.airship.click 사이트(2026-11-26 등록)」라고 적혀 있다. 오늘(11-23)보다 뒤 날짜다. | 주석 날짜를 확인하고 고친다. | app/layout.tsx |

## 5. 페이지 메타와 다국어

| # | 심각도 | 위치 | 증거 | 고칠 방향 | 관련 코드 |
|---|---|---|---|---|---|
| M-1 | 중 | ?lang=ja 변형 메타 | /guide?lang=ja, /about?lang=ja, /help?lang=ja의 description이 한국어 그대로다. /guide?lang=ja의 title도 한국어 본문과 같다. | 메타 description을 lang별로 나눈다. | lib/seo.ts (pageMeta), app/guide/page.tsx, app/about/page.tsx, app/help/page.tsx |
| M-2 | 하 | /about 제목 | 「서비스 소개 · サービス紹介 | TOMO」에 키워드가 없다. | 「한일 중고거래 TOMO 소개」 같은 제목으로 바꾼다. | app/about/page.tsx |

양호: 홈·가이드·소개의 canonical과 hreflang이 맞다. sitemap은 32개 URL과 ko/ja/x-default 대체 링크를 담는다.

## 6. 노출 점검 (실측 한계 포함)

- 방법: 웹 검색 1회, 질의 3개 (「tomo 한일 중고거래」 계열, 「メルカリ 韓国 代行 tomo」).
- 결과: tomo.airship.click 0건.
- 대신 나온 결과: airship.click(에어쉽, 같은 운영사) 여러 페이지, tokyo-buy.com(이든에이치 운영).
- ChatGPT, Perplexity, Claude의 실제 답변은 이 도구로 확인할 수 없다. 측정 못 함.
- 판정: TOMO가 검색 결과에 잡히는 근거는 없다. 원인은 추정이다 (신규 도메인, 외부 언급 부족, 브랜드 검색이 적음).

| # | 심각도 | 위치 | 증거 | 고칠 방향 | 관련 |
|---|---|---|---|---|---|
| X-1 | 중 | 외부 언급 | AI 인용은 외부 언급 신호에 더 크게 의존한다 (스킬 기준). TOMO 이름이 외부 글에 거의 없다. | 블로그·X·Threads 등 외부 언급 계획을 Ren이 승인한다. 코드 밖 작업이다. | 코드 외 |

## 7. 수수료 정보 누락 (가장 중요)

| # | 심각도 | 위치 | 증거 | 고칠 방향 | 관련 코드 |
|---|---|---|---|---|---|
| F-1 | 상 | 직거래 판매 수수료 | lib/fees.ts에 PLATFORM_FEE_RATE = 0.1, sellerPayout = 판매가 - 10%가 있다. 거래 화면(app/transactions/[id]/page.tsx:138, 150)과 AI 상담(lib/support-ai.server.ts:53)에는 10%가 나온다. 공개 페이지(/guide, /help)와 llms.txt에는 없다. llms.txt는 「별도 대행 수수료 항목 없음」이라고만 말한다. | 직거래 판매 수수료 10%와 정산 시점을 /help, /guide, llms.txt에 같은 문장으로 쓴다. 정책 확정은 Ren이 한다. | app/llms.txt/route.ts, lib/guide-content.ts, lib/help-faq.ts, lib/fees.ts |

채널마다 수수료 설명이 다르다. 거래 화면과 AI 상담은 10%를 말하고, 공개 페이지는 말하지 않는다. AI 검색 답변도 공개 페이지 기준으로 잘못 답할 수 있다.

## 8. 질문에 답하는 페이지가 없는 주제 (보강 제안)

| 사용자 질문 | 현재 상태 | 제안 |
|---|---|---|
| 직거래 수수료는 얼마인가요? 판매자 정산은 언제 되나요? | 공개 페이지에 없음 | 직거래 FAQ 또는 전용 페이지 (정책 확정 후) |
| 일본 사용자는 당근·중고나라 상품을 어떻게 받나요? | llms.txt에 한 줄만 있음. 절차 가이드 없음 | 일본어 포함 「당근·중고나라 구매 흐름」 가이드 |
| TOMO는 어떤 회사가 운영하나요? AirShip과 관계는? | 푸터에만 있음 | /about에 운영사 섹션, FAQ 한 개 |
| 메루카리 1건을 사면 총액이 얼마인가요? | 공식 계산 예시 없음 | /guide에 예시 표 (예: 상품가 1만엔 기준). 운임은 「추정」으로 표기 |
| 여행 직거래는 어떻게 하나요? | /travel 본문 900자 | 절차 질문-답 3~4개 |
| 개인통관고유부호는 어디서 받고 어떻게 입력하나요? | 입력 안내는 있으나 발급 안내 없음 | 질문-답 한 개 |
| 검수에서 무엇을 확인하나요? | /guide에 일부만 있음 | 검수 항목 목록 (사진·수량·파손) |

### TOP 5 보강 (우선순위)

1. 직거래 수수료와 정산 질문-답 (F-1과 연결, 상)
2. 일본 사용자용 당근·중고나라 구매 가이드 (llms.txt와 실제 페이지 차이 해소)
3. 운영사와 AirShip 관계 설명 (E-2, I-1)
4. 메루카리 1건 총액 예시 표 (추정 운임 표기)
5. 해외 상품 상세 노출 방식 결정 (C-1, Ren 결정)

## 9. 요약 표

| 영역 | 상태 | 비고 |
|---|---|---|
| AI 크롤러 접근 | 양호 | 명시 차단 없음, UA 실측 200 |
| llms.txt | 보통 | 있음. 수수료 문장 누락 |
| 서버 렌더 본문 | 양호 | 주요 페이지 확인 |
| 질문-답 구조 | 보통 | /guide, /help 양호. /about 얇음 |
| 구조화 데이터 | 보통 | Organization 빈약, sameAs 없음 |
| 엔티티 명확성 | 약함 | AirShip 관계 설명 없음 |
| 수수료 정확성 | 약함 | 직거래 10% 누락 |
| 노출 | 근거 없음 | 측정 한계 있음 |

## 10. 측정 한계

- UA 문자열 실측이다. 실제 봇 IP 검증은 하지 않았다.
- AI 답변 실측은 웹 검색 1회로 대신했다.
- 상품 상세 SSR, Applebot, CCBot, Google-Extended 실제 요청은 확인하지 않았다.
- 코드는 로컬 C:\dev\tomo 기준이다. 배포본과 차이가 있을 수 있다. 다만 llms.txt 실측은 코드와 일치했다.

## 11. Ren 결정 필요

1. 직거래 판매 수수료 10%를 공개 페이지에 쓸지, 문구는 어떻게 할지 (F-1)
2. 해외 상품 상세를 AI 크롤러에 열지 (C-1)
3. TOMO 전용 연락처 메일을 쓸지 (E-2)
4. 외부 언급(블로그·SNS) 계획 승인 (X-1)
