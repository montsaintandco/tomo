# 10. 구조화 데이터(JSON-LD)·hreflang 점검: tomo.airship.click

- 점검일: 2026-11-26 (KST)
- 방식: 읽기 전용. 코드와 사이트는 고치지 않았다. 커밋하지 않았다.
- 라이브 확인: 쿠키 없이 요청(PowerShell). Accept-Language ko/ja 각각, Googlebot UA로 확인.
- 검사 메모: 처음에는 hreflang이 없다고 잘못 읽었다. 정규식이 대소문자를 구분해 `hrefLang`을 놓쳤다. 재검사에서 모든 점검 페이지에 hreflang이 있음을 확인했다. 아래 결과는 재검사 기준이다.

## 요약

- 심각도 상: 없음.
- 심각도 중: 3건. ja 변형 메타가 한국어, 카테고리 구조화 데이터 부족, Accept-Language에 따라 같은 URL의 내용이 바뀜.
- hreflang, canonical, 사이트맵, JSON-LD 이스케이프는 대체로 맞다.
- 국내 상품 상세는 판매중 매물이 0개라 확인하지 못했다.

## 1. 문제 표

| 심각도 | URL | 증거 | 고칠 방향 | 관련 코드 파일 |
|---|---|---|---|---|
| 중 | /guide?lang=ja, /help?lang=ja, /categories?lang=ja, /categories/figure?lang=ja | 본문(h1)은 일본어인데 title·description이 한국어다. 예: /help?lang=ja description은 "구매대행 수수료, 배송 기간…" 한국어 그대로다. | pageMeta에 lang별 title·description을 넘긴다. 호출부의 한국어 문자열을 lang에 따라 고른다. ja 문구를 따로 쓴다. | lib/seo.ts, app/help/page.tsx, app/guide/page.tsx, app/categories/page.tsx, app/categories/[slug]/page.tsx |
| 중 | /categories, /categories/<slug> 21개 | JSON-LD가 WebSite·Organization뿐이다. BreadcrumbList가 없다. 화면에는 홈 › 카테고리 › 대분류 경로가 있다. /categories에 ItemList가 없다. | 대분류 페이지에 BreadcrumbList를 넣는다. /categories에 21개 대분류 URL을 담은 ItemList를 넣는다. | app/categories/[slug]/page.tsx, app/categories/page.tsx |
| 중 | / (쿠키 없음, Accept-Language: ja) | 같은 URL이 일본어 화면으로 나온다. html lang=ja, h1 일본어. 그런데 canonical과 hreflang은 ko 기준 그대로다. 리다이렉트는 없다(Googlebot UA로 200 확인). | 메타는 ?lang만 보고, 본문은 Accept-Language까지 본다. 둘을 맞춘다. 색인 대상 URL은 ?lang이나 쿠키로만 언어를 정하게 하는 안을 권한다. 기본 응답을 ko로 고정할지는 Ren이 정한다. | lib/locale.ts, proxy.ts (Vary: Accept-Language) |
| 하 | /guide | HowTo JSON-LD가 있다. 구글은 HowTo 리치결과를 2023-09-13에 중단했다(구글 문서 기준). | HowTo 블록을 지운다. FAQPage는 유지한다. | app/guide/page.tsx |
| 하 | 사이트 전체 (WebSite) | WebSite에 SearchAction이 없다. 사이트검색창 리치결과는 2024-11-21에 중단됐다(구글 블로그 2024-10-21 기준). | 추가하지 않는다. name·url은 유지한다. inLanguage는 배열 ["ko","ja"] 대신 기본값 "ko"로 두는 편이 스키마에 맞다. | lib/seo.ts (websiteJsonLd) |
| 하 | / (홈) | 홈 canonical과 ko hreflang은 `https://tomo.airship.click`(슬래시 없음)이다. 사이트맵 loc과 WebSite url은 `/`가 있다. Organization url은 슬래시가 없다. | 루트 주소를 한 형식으로 맞춘다(SITE_URL 기준). | lib/seo.ts, app/page.tsx, app/layout.tsx, app/sitemap.ts |
| 하 | /global/mercari/m27572338874 등 외부 상품 상세 | noindex,follow인데 robots.txt가 /global/을 Disallow한다. 그래서 크롤러가 noindex를 볼 수 없다. noindex 페이지에 hreflang도 붙어 있다(불필요). | 둘 중 하나를 고른다. 허용하고 noindex를 신뢰하거나, Disallow를 유지하고 noindex·hreflang을 뺀다. robots.ts 주석은 차단을 의도로 적었다. | app/robots.ts, app/global/[source]/[id]/page.tsx |
| 하 | /listings/00000000-0000-0000-0000-000000000000, /global/mercari/m00000000000000 | 없는 상품 주소가 HTTP 200으로 응답한다. 제목은 "TOMO", robots는 noindex다(소프트 404). | 없는 상품은 404 상태로 응답하게 한다. | app/listings/[id]/page.tsx (45행 notFound, 407행 generateMetadata), app/global/[source]/[id]/page.tsx |
| 하 | 판매중이 아닌 상품 상세 (sold·reserved) | Product JSON-LD를 상태와 관계없이 출력한다. availability는 SoldOut으로 찍힌다. 페이지는 noindex다. | active일 때만 Product를 출력한다. | app/listings/[id]/page.tsx (153~160행) |
| 하 | 상품 상세 전체 hreflang vs 사이트맵 | 상품 상세 HTML에는 ko·ja·x-default가 있다. 사이트맵 상품 항목에는 alternates가 없다. 방식이 다르다. 지금은 상품이 0개라 실영향이 없다. | 상품 URL이 생기면 사이트맵에도 같은 alternates를 넣는다. | app/sitemap.ts (listings map) |
| 하 | robots 테스트 | robots.ts 주석이 가리키는 tests/unit/seo-robots.test.ts가 없다. tests/unit/seo-rules.test.ts만 있다(내용은 확인하지 않았다). | 테스트 파일 경로를 맞추거나 주석을 고친다. | app/robots.ts, tests/unit/ |

확인하지 못한 것:
- 국내 상품 상세 JSON-LD: 판매중 매물이 0개다. 홈 국내 허브에 매물 링크가 0개이고, 사이트맵에도 상품 URL이 0개다. 코드만 읽었다. Product에 name, image(최대 5장), offers(price, priceCurrency, availability, url, seller)가 있다. 매물이 생기면 image 절대주소와 price 숫자 형식을 다시 확인한다.

## 2. 맞게 된 것

- hreflang: 점검한 모든 페이지에 ko, ja, x-default가 있고 서로 참조한다. 점검한 페이지는 /, /guide, /help, /categories, /categories/figure, /global 상품 상세다. 각 페이지의 ja canonical은 `?lang=ja` 자기 자신이다. 이 구조는 맞다.
- 사이트맵: 32개 URL(정적 11 + 카테고리 21), 각 URL에 xhtml:link 3개씩 96개다. HTML의 hreflang과 값이 같다. lastmod 2026-11-26은 오늘 날짜다.
- 언어 리다이렉트: 없다. Googlebot UA로 / 와 /guide가 200을 준다. 3xx 응답이 없다. 크롤러를 막지 않는다.
- JSON-LD 이스케이프: layout, help, guide, listings, global 모두 lib/json-ld.ts의 jsonLd()를 거친다. `</script>` 주입은 막힌다.
- 카테고리 21개: 전부 200이다. 사이트맵에 21개 모두 있다. title, ko description, h1, 자기 canonical이 있다. 세부 분류 링크가 20개, 해외 검색 링크가 58~70개다.
- 외부 상품 상세: noindex,follow다. BreadcrumbList가 있고 Product는 없다. 색인하지 않는 페이지라 맞다.
- /help FAQPage: 화면의 Q&A와 같은 원본(c.faq)에서 만든다.
- Organization: 사업자 정보가 채워졌을 때만 출력한다(lib/company.ts의 companyComplete). 날조 방지 규칙을 지킨다.

## 3. 질문에 대한 답

- FAQPage 유지 여부: 유지를 권한다. 구글 리치결과는 2026-05-07에 중단됐다(구글 업데이트 문서 기준). 그래도 FAQ 답변은 AI 답변 인용에 쓸모가 있고 해가 없다.
- WebSite SearchAction: 넣지 않는다. 사이트검색창 리치결과는 2024-11-21에 중단됐다.
- HowTo: 지운다(하).
- Product: 판매중 상품만 출력하도록 바꾼다(하). 국내 상품은 매물이 생긴 뒤 재확인한다.
- ItemList: /categories에 넣는다(중). 리치결과 목적이 아니라 구조 이해용이다.
- 사이트맵 alternates: 둔다. 지금은 HTML과 값이 같아 충돌이 없다. 상품 URL을 넣을 때 같은 방식으로 맞춘다.
- 언어 감지 리다이렉트: 크롤러를 막지 않는다. 다만 Accept-Language로 같은 URL의 내용이 바뀌는 문제는 남아 있다(중 3번).

## 4. 넣을 JSON-LD 예시

카테고리 대분류(/categories/figure)의 BreadcrumbList. ja 변형은 이름을 일본어로, 주소에 ?lang=ja를 붙인다.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "홈", "item": "https://tomo.airship.click/" },
    { "@type": "ListItem", "position": 2, "name": "카테고리", "item": "https://tomo.airship.click/categories" },
    { "@type": "ListItem", "position": 3, "name": "피규어·취미", "item": "https://tomo.airship.click/categories/figure" }
  ]
}
```

/categories의 ItemList. 대분류 21개를 모두 넣는다. 아래는 두 개만 보였다.

```json
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "카테고리",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "피규어·취미", "url": "https://tomo.airship.click/categories/figure" },
    { "@type": "ListItem", "position": 2, "name": "캐릭터·애니 굿즈", "url": "https://tomo.airship.click/categories/character" }
  ]
}
```

## 5. 점검 범위와 출처

- 라이브 페이지: /, /?lang=ja, /categories, /categories?lang=ja, /help, /help?lang=ja, /guide, /guide?lang=ja, /global?q=ポケモン(검색 결과), /global/mercari/m27572338874, 그 ?lang=ja, /categories/<21개>, /categories/figure?lang=ja, /categories/vintage?lang=ja, /robots.txt, /sitemap.xml.
- 코드: lib/seo.ts, lib/json-ld.ts, lib/site.ts, lib/company.ts, lib/locale.ts, proxy.ts, app/layout.tsx, app/page.tsx, app/help/page.tsx, app/guide/page.tsx, app/categories/page.tsx, app/categories/[slug]/page.tsx, app/listings/[id]/page.tsx, app/global/[source]/[id]/page.tsx, app/sitemap.ts, app/robots.ts.
- 구글 상태 출처: Search Central 블로그 2024-10-21(사이트검색창 중단), Search Central 블로그 2023-08-08(FAQ·HowTo 변경), Search Central 업데이트 문서(HowTo 제거, FAQ 2026-05-07 중단). 2차 자료는 보조로만 썼다.
- 미확인: 판매중 상품 상세, 실제 색인 상태(Search Console 기준), 다른 정적 페이지(/about, /notice, /travel, /terms, /privacy, /refund)의 라이브 HTML.
