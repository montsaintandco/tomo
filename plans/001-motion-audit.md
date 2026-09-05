# 모션 감사 + 실행 계획 (improve-animations · apple-design)

commit: 79189f5 · 2026-09-05 · 기준: Emil Kowalski AUDIT.md + Apple *Designing Fluid Interfaces*

## Recon

- 스택: Next 16 + Tailwind 3.4 + 순수 CSS. 모션 라이브러리 없음. 제스처 코드 없음(갤러리는 scroll-snap).
- 모션이 사는 곳: `app/globals.css` (`.btn` `.press` `.card` `.skeleton` `.heartbeat`, `--squish`, reduced-motion 블록), Tailwind `transition-colors/transform`, 네이티브 `<dialog>` 바텀시트 3개(`CostInfo` `PreorderCheck` `ProxyRequestButton`), `<details>` 아코디언(고객센터·어드민).
- 성격: 카와이 브랜드의 소비자 마켓 + Linear식 어드민. DESIGN.md가 `--squish` 오버슈트와 워드마크 하트비트를 "의도된 시그니처"로 기록.
- 빈도 지도: `.press`는 피드 행·탭·칩·내비 전부(하루 수백 번) / 바텀시트·분쟁·제안 패널은 가끔 / 찜·제안 수락은 드묾.

## Findings (검증 완료, 레버리지 순)

| # | 심각도 | 범주 | 위치 | 발견 | 수정 |
|---|---|---|---|---|---|
| 1 | HIGH | 이징·빈도 | `globals.css:22,65,73,80` | 모든 탭 요소의 프레스 피드백이 오버슈트 커브 `cubic-bezier(0.34,1.56,0.64,1)` 180–200ms. 하루 수백 번 보는 동작에 바운스 — Apple: 모멘텀 없는 UI는 임계감쇠(damping 1.0) | `transform 160ms cubic-bezier(0.23,1,0.32,1)`, `:active scale(0.97)`(카드 0.98). `--squish` 제거, `--ease-out` 토큰 |
| 2 | HIGH | 접근성 | `globals.css:135-141` | reduced-motion이 모든 transition/animation을 0.01ms로 전멸 — 색·불투명도 피드백까지 사라짐 | 이동·변형만 제거, opacity/color 150ms 유지, 시트는 크로스페이드 |
| 3 | HIGH | 물리성·공간 | `CostInfo.tsx:12` `PreorderCheck.tsx:16` `ProxyRequestButton.tsx:56` | 바텀시트 `<dialog>`가 순간이동으로 나타나고 사라짐. 아래에서 온다는 공간 관계 없음, 백드롭도 즉시 | `@starting-style` + `transition-behavior: allow-discrete`: 모바일 `translateY(100%)→0` 320ms `cubic-bezier(0.32,0.72,0,1)`(iOS 드로어), 데스크톱 `scale(.97)+opacity` 240ms ease-out, 퇴장은 같은 경로 미러, 백드롭 페이드 |
| 4 | MEDIUM | 접근성·이징 | `ExternalItemCard.tsx:27` `ListingRow.tsx:47` | 썸네일 hover scale이 터치에서도 발동(ExternalItemCard 게이트 없음), 300ms | `@media (hover:hover) and (pointer:fine)` 변형(`fine:`)으로 게이트, 200ms ease-out |
| 5 | MEDIUM | 이징 | `globals.css:66` | `a.card:hover` 리프트가 오버슈트 커브 + 터치에서도 발동 | hover는 `ease` 150ms, fine 포인터에서만 |
| 6 | MEDIUM | 목적·빈도 | `globals.css:115` `Brand.tsx` | 워드마크 하트비트가 모든 페이지 헤더에서 무한 반복(2.6s, ≈0.38Hz 느린 진동 — Apple 전정 주의 항목). 브랜드 시그니처로 기록돼 있어 삭제 대신 절제 | 로드 후 2박만 뛰고 정지(`animation-iteration-count: 2`), reduced-motion 없음 |
| 7 | MEDIUM | 놓친 기회 | `OfferButton.tsx:83` `TxActions.tsx:88,104` `help/page.tsx` 아코디언, 어드민 `<details>` | 펼침 패널이 즉시 튀어나옴 — 상태 변화가 점프 | `.reveal` 유틸: `@starting-style` opacity 0 + translateY(-4px) → 160ms ease-out |
| 8 | LOW | 토큰 | `globals.css` 전반 | 220/200/180/160/300ms, `ease`/`--squish` 손타이핑 혼재 | `--ease-out` `--ease-in-out` `--ease-drawer` `--dur-fast(160)` `--dur-base(220)` `--dur-sheet(320)` |

**설정된 결정 존중**: DESIGN.md의 `--squish`·하트비트는 문서화된 선택이었으나 사용자가 Apple 기준 적용을 지시 → 1·6은 기준에 맞춰 변경하고 DESIGN.md를 갱신한다.

## 놓친 기회 (추가)

- 찜 토글: 하트가 채워질 때 반응 없음 → 220ms ease-out 팝(1→1.25→1). 드문 순간, 딜라이트 예산 안.
- "제안 수락됨"/"끌어올렸어요" 상태 문구 즉시 등장 → `.reveal`.
- 채팅 새 말풍선 등장 — 초기 목록 전체가 동시에 움직이면 안 되므로 **새 메시지에만** 6px 슬라이드. (이번엔 미적용, 다음 후보)
- 상단 헤더 하드 헤어라인 → Apple §12 스크롤 에지 효과. (JS 필요, 미적용)

## Apple 기준 추가 적용

- §14 `prefers-reduced-transparency`: 반투명 크롬(GNB·탭바)을 불투명으로.
- §1 응답: `:active`(pointer-down) 피드백 유지, 160ms.
- §15 타이포: 제목 -0.02em·본문 0은 이미 충족. 변경 없음.

## 상태

| 계획 | 상태 |
|---|---|
| 1 프레스 커브 교체 | DONE |
| 2 reduced-motion 재작성 | DONE |
| 3 바텀시트 진입·퇴장 | DONE |
| 4·5 hover 게이트 | DONE |
| 6 하트비트 2박 | DONE |
| 7 `.reveal` 펼침 | DONE |
| 8 토큰 통합 | DONE |
| 찜 팝 | DONE |
| 채팅 새 말풍선 / 스크롤 에지 | TODO |

검증(느낌 체크): 배포본에서 피드 행을 눌러 바운스가 없는지, 대행 신청 시트가 아래에서 320ms에 올라오고 닫힐 때 같은 길로 내려가는지, OS 접근성에서 동작 줄이기 켜고 시트가 크로스페이드로 바뀌는지.
