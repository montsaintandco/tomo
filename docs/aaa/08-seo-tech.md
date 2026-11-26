# TOMO SEO 기술 점검 (2026-11-23)

대상: https://tomo.airship.click (Next.js 16, 한국어 기본, 일본어는 `?lang=ja`)
방법: 읽기 전용. curl로 실제 응답(상태·헤더·HTML head)을 받아 판정. UA 3종: Googlebot, 일반 Chrome(Accept-Language ko-KR), 일반 Chrome(ja-JP). 코드·사이트는 수정하지 않았다. 커밋하지 않았다.

## 요약

- 상 1건, 중 5건, 하 5건.
- 가장 큰 문제: 일본어 페이지(`?lang=ja`)의 제목·설명·og 제목이 한국어다. 본문만 일본어다.
- 사이트맵·robots·canonical·hreflang·404 기본 동작·내부 링크는 대체로 맞다.

## 문제 표

| 심각도 | URL | 증거 | 고칠 방향 | 관련 코드 |
|---|---|---|---|---|
| 상 | `/guide?lang=ja`, `/global?lang=ja`, `/help?lang=ja`, `/categories/figure?lang=ja`, `/?lang=ja` | 본문 h1은 일본어(`韓国の商品を代わりに購入…`)인데 `<title>`·description·og:title이 한국어다. 예: `/guide?lang=ja` 제목 "일본 구매대행 · 메루카리·Yahoo!フリマ 대신 사서 검수 후 배송 \| TOMO". og:locale만 ja_JP. `/global`과 `/global?lang=ja`는 제목·설명이 같다. | `pageMeta`가 제목·설명을 한 벌만 받는다. 일본어 제목·설명 인자를 추가하고, 호출부 전부에 일본어 문구를 넣는다. 홈은 루트 layout 기본 제목·설명도 lang별로 나눈다. | lib/seo.ts, app/*/page.tsx의 pageMeta 호출부 12곳, app/categories/[slug]/page.tsx, app/layout.tsx, app/page.tsx |
| 중 | `/` (Accept-Language: ja-JP) | 같은 주소가 일본어 브라우저에서 ja 본문(`<html lang="ja">`)으로 응답한다. canonical·hreflang은 ko 주소를 가리킨다. Googlebot(en-US)과 ko-KR은 ko로 응답한다. | 주소에 `lang`이 없으면 Accept-Language로 언어를 바꾸지 않는다(쿠키 우선, 기본 ko). 일본어 전환은 `?lang=ja` 링크로만 한다. | lib/locale.ts `getRequestLang` |
| 중 | `/categories/nonexistent-slug`, `/listings/00000000-0000-0000-0000-000000000000`, `/listings/x1`, `/order/x1`, `/profile/x1` | 없는 주소인데 HTTP 200이다(soft 404). 앞 3개와 `/profile/x1`은 noindex로 막혀 있다. `/order/x1`은 noindex도 없다(robots 차단). 반면 `/zzz-not-a-page`는 진짜 404다. 코드에는 `notFound()`가 있으나 응답은 200이다. 원인은 추정: 본문이 스트리밍된 뒤 notFound가 불린다. | 없는 항목은 응답 상태 404로 바꾼다. 조회를 본문 렌더 전에 끝내고 notFound를 부른다. `/order/[id]`, `/profile/[id]`에는 noindex를 넣는다. | app/categories/[slug]/page.tsx, app/listings/[id]/page.tsx, app/order/[id]/page.tsx, app/profile/[id]/page.tsx |
| 중 | `/global/mercari/…`, `/global/yahoo_flea/…` (홈 링크 다수) | 상품 상세는 `robots: noindex, follow`인데 robots.txt가 `/global/`을 Disallow한다. Google이 noindex를 읽지 못한다. 홈에서 링크가 많아 URL만 색인될 수 있다(설명 없이 색인). | 추천: robots의 `/global/` 차단을 풀어 noindex가 작동하게 한다. 상품 상세는 noindex를 유지한다. robots 테스트도 같이 고친다. | app/robots.ts, app/global/[source]/[id]/page.tsx, tests/unit/seo-robots.test.ts |
| 중 | `/sitemap.xml` (상품 항목) | 상품 주소가 0개다(정적 32개만 있다). 익명 REST 조회도 공개 active 상품 0건(Content-Range `*/0`)이다. 홈·카테고리에도 `/listings/` 링크가 없다. 상품이 없는 건지 RLS로 막힌 건지 이 점검으로는 구분할 수 없다. | 운영 DB에서 공개 상품 수를 확인한다. 있는데 0으로 나오면 sitemap 쿼리와 listings RLS를 점검한다. 없으면 정상이다. | app/sitemap.ts, Supabase listings RLS |
| 중 | `/guide`, `/global`, `/travel`, `/about`, `/categories/*` (홈 제외) | og:image가 없다. 홈에만 og:image가 1개 있다. 카카오톡·X 공유 시 사진 없이 나온다. | 페이지별 대표 이미지를 지정한다. 정적 페이지는 기본 og 이미지 1장을 쓴다. | lib/seo.ts `pageMeta`, app/layout.tsx openGraph |
| 하 | `/login`, `/sell`, `/mypage/*`, `/chat`, `/listings/[id]/edit` | 제목 끝에 `\| TOMO`를 직접 넣어 템플릿과 겹친다("… \| TOMO \| TOMO"). `/listings/[id]/edit`는 noindex가 없다(비로그인은 로그인으로 보낸다). | 제목에서 "\| TOMO"를 지운다. edit에 noindex를 넣는다. | app/(auth)/login/page.tsx, app/sell/page.tsx, app/mypage/*/page.tsx, app/chat/page.tsx, app/listings/[id]/edit/page.tsx |
| 하 | `/robots.txt` | `Host: https://tomo.airship.click`이 있다. Host는 비표준 지시어이고 Google은 무시한다. 해가 없다. | 해당 줄을 지운다. | app/robots.ts |
| 하 | HTML 전체 (`/guide` 등) | `Cache-Control: private, no-cache, no-store`라 모든 요청이 원 서버로 간다. TTFB는 0.07~0.4초이고 1회 1.1초가 관측됐다. 지금은 빠르다. | 공개 페이지만 짧은 캐시를 검토한다. 로그인 상태에 따른 부분을 분리해야 해서 급하지 않다. | app/layout.tsx (쿠키 의존) |
| 하 | `tomo-delta.vercel.app` | 옛 도메인이 402(Vercel 결제 필요)로 응답하고 리다이렉트가 없다. 구글 확인 태그에 옛 속성이 남아 있다. | Search Console 옛 속성에서 주소 변경 도구 사용 여부와 옛 도메인 색인 잔여를 확인한다(이 점검에서는 확인 못 함). | app/layout.tsx `verification` |
| 하 | `www.tomo.airship.click` | DNS가 없다(curl 000). www 링크가 있으면 깨진다. | 쓰지 않으면 무시한다. 쓰려면 DNS와 리다이렉트를 건다. | (DNS) |

## 문제없음 확인 목록

- robots.txt 200. sitemap.xml 200. 사이트맵 주소 32개 전부 200(정적 11 + 카테고리 21 전수 확인). 중복 주소 없음. lastmod 있음(2026-11-25T15:00Z).
- 사이트맵 hreflang: `xmlns:xhtml` 있음. `xhtml:link` 96개(32주소 × ko·ja·x-default 3개).
- HTML head hreflang: `/`, `/guide`, `/global`, `/travel`, `/about`, `/help`, `/categories/figure`에서 ko·ja·x-default 세트가 맞다. `?lang=ja` 쪽도 ko 주소와 상호 참조한다.
- canonical: ko는 자기 주소, ja는 `?lang=ja` 자기 주소. `/global?q=test`는 `/global`로 모은다.
- UA 차이 없음: Googlebot과 일반 Chrome(ko)의 HTML 제목·설명·canonical이 같다. 숨은 UA 분기(클로킹)는 보이지 않는다.
- noindex 작동: `/login`, `/mypage`, `/cart`, `/order`, `/sell`, `/onboarding`(307 로그인). `/admin`, `/chat`, `/proxy`, `/transactions`는 로그인으로 307.
- 404: `/zzz-not-a-page`가 진짜 404 + noindex. `http://` → `https://` 301. 후행 슬래시 `/categories/figure/` → 308. 대소문자 다른 `/Categories/figure`는 404.
- 리다이렉트 체인: 1단계만 있다.
- 내부 링크: `/help`, `/categories`, `/guide`, `/global`, `/travel`, `/about`에서 나가는 고유 경로 50개 전부 200/307/308. 깨짐 0.
- 홈: 이미지 86개 전부 alt 있음. h1 1개. JSON-LD 블록 4개가 HTML에 들어 있다(SSR).
- 정적 페이지 32개(홈·정보 11·카테고리 21): 전부 200, h1 1개. ko 기준 제목 13~45자, 설명 35~107자(제목은 "| TOMO" 포함 길이).
- HSTS 있음. `<html lang>`은 ko/ja가 맞게 나온다.
- 파비콘·apple-touch-icon·manifest 링크 있음. 실제 파일도 전부 200(아래 표).
- 검색 소유 확인 태그(구글·네이버) 있음.
- 응답 속도: 대부분 0.1초 안팎.

## 확인 못 한 것

- 상품 상세 `/listings/[id]`: 익명으로 볼 상품이 0개라 실제 메타·canonical·og·구조화 데이터를 확인하지 못했다.
- Search Console·색인 상태: 접근 권한이 없어 확인하지 못했다. `site:` 검색도 할 수 없다.
- 상품 구조화 데이터(Product): 상품 샘플이 없어 확인하지 못했다.
- LCP·CLS: Lighthouse를 돌리지 않았다.
- 수정 후 `?lang=ja` 제목·설명, 404 상태, og:image는 재점검이 필요하다.

## 정적 파일 응답 (Googlebot UA)

| 주소 | 상태 |
|---|---|
| /robots.txt | 200 |
| /sitemap.xml | 200 |
| /manifest.webmanifest | 200 |
| /icon.svg | 200 |
| /icon-192.png | 200 |
| /apple-touch-icon.png | 200 |
| /favicon.ico | 200 |
