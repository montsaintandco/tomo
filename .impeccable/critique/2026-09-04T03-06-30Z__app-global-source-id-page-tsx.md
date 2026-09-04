---
target: external item detail (app/global/[source]/[id]/page.tsx)
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:C:\\dev\\tomo\\app\\global\\[source]\\[id]\\page.tsx"
target_fingerprint: "sha256:67a270c1ea501b65ccc8698768d51f909098d3f35d85748e0d1622ba503998ff"
target_path: "C:\\dev\\tomo\\app\\global\\[source]\\[id]\\page.tsx"
timestamp: 2026-09-04T03-06-30Z
slug: app-global-source-id-page-tsx
---
# 외부 상품 상세 크리틱 — 21/40 (첫 스냅샷, 수정 전 기준)

Method: dual-agent. P0 결정 스택 역전(사진 벽→정가→예상총액→먼 CTA) / P0 역방향(JP 뷰어·KRW 상품) 견적 부재·국내 상품에 대행 CTA / P1 고정 바 오버플로(요청란이 바 안) / P1 TOMO 신뢰 신호 0 / P2 "원본에서 더 보기" 중복·뒤로가기 숨김 / P2 경매 현재가를 확정가처럼.
디텍터: 11px 본문 2줄, ink-faint 본문, 카드 소스 배지 navy/60 대비 3.4:1.
→ 같은 세션 일괄 수정: 가로 갤러리+N장 필, 예상 총액 히어로+정가 서브라인, 양방향 proxyEstimate, 국내 상품은 원본 직거래 링크, 고정 바=총액+버튼, 신청은 <dialog> 확인 단계(경매 최대 입찰가), 진행 4단계 안내, 판매자 카드 국가칩+검수 문구, 중복 링크 제거, 모바일 뒤로가기 상시, 대비/크기 정리.
