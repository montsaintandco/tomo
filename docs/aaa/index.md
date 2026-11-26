# tomo AAA 업데이트 위키 (2026-11-26 시작, 세션 FhEt358C4xc4mOcC)

Ren 지시(2026-11-26): 「키라팝·에어쉽 참조해서 트리플A급으로 모든 역량을 다해 업데이트」.

| 문서 | 내용 |
|---|---|
| [01-tomo-inventory.md](01-tomo-inventory.md) | tomo 현황·품질 격차 TOP 15 |
| [02-airship-reference.md](02-airship-reference.md) | 에어쉽에서 가져올 것 |
| [03-kirapop-reference.md](03-kirapop-reference.md) | 키라팝에서 가져올 것 |
| [04-ux-audit.md](04-ux-audit.md) | 화면 검수·경쟁사 비교 TOP 12 (캡처 shots/) |
| 05-roadmap.md | 설계(트랙·순서·파일 소유) — deep 작성 예정 |

## 결정 기록
- 2026-11-26: JSON-LD XSS 즉시 수정(tomo@1478408).
- 2026-11-26: Ren 결정 기본값 적용(로드맵 9절) — 직거래 국제배송비는 서버 계산(lib/fees.ts directShippingFee, tomo@4854ec8), 표시 통화는 거주국 기준. 운영 실결제 1회 시험은 Ren 확인 대기.
- 2026-11-26: 1차 웨이브 T0~T5 병합·배포(tomo@e27ae7c..4854ec8), DB 0032~0036 적용(한 트랜잭션 되돌림 시험 → 적용), DB 테스트 5파일 33개 통과, 운영 /api/health version 4854ec8·스모크 success.
- 2026-11-26 사고: 1차 worktree 정리 때 `cmd /c rmdir <junction>` 뒤 `git worktree remove --force` 가 메인 `node_modules` 내용을 지웠다(junction 해제 실패로 추정). `npm install` 로 복구, 단위 테스트 155개 재통과. 다음부터: junction 은 `[IO.Directory]::Delete(path,$false)` 로 지우고 `Test-Path` 로 사라진 것을 확인한 뒤 worktree 를 지운다.
- 2026-11-26: 2차 준비 lib/seo langAlternates(tomo@c501cd8). 2차 웨이브 T6~T11 시작.- 2026-11-26 사고 원인 확정(2회째 재발 후): worktree 에서 `next build --webpack` 을 돌리면 `.next/standalone/node_modules` 가 메인 `C:\dev\tomo\node_modules` 를 가리키는 junction 으로 생긴다. `git worktree remove --force` 가 이 중첩 junction 을 따라가 메인 패키지를 지웠다. 정리 절차: `Get-ChildItem <wt> -Recurse -Force -Attributes ReparsePoint` 로 모든 링크를 찾아 `[IO.Directory]::Delete(path,$false)` 로 끊고, 남은 링크 0개를 확인한 뒤 worktree 를 지운다(2026-11-26 T7~T11 정리에 적용, 메인 무사). 두 번 모두 `npm install` 로 복구.
- 2026-11-26: 2차 웨이브 T6~T11 병합·배포(tomo@fa5bdf9..b60b3b1, 연결 커밋 4760dbe), DB 0037 적용, DB 테스트 29개 통과, 단위 테스트 218개, 운영 version 4760dbe·스모크 success. CI db-tests 첫 실행 실패(허용) → 수정 진행.
- 2026-11-26: QA 07(04 TOP12: 고침 4·일부 8·안 고침 0) → 일본어 화면 수정(tomo@9d35791: ₩ 표기·카드 번역 제목 규칙·상세 라벨). db-tests 분리·초록(099823e). 운영 ja 홈 「원」 0개 확인.
