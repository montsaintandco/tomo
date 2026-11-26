# 06 마이그레이션 재생 기록 (T11, 2026-11-26)

## 결론

`supabase/migrations` 0001~0036(37파일)은 빈 Postgres 17에서 처음부터 재생된다. 막힌 파일은 없다.
적용된 마이그레이션 파일은 하나도 고치지 않았다.

## 시험 방법

이 PC에는 Docker가 없다. 그래서 `supabase start` 대신 PGlite(Postgres 17 WASM, 임시 폴더에만 받음, 저장소 의존성 아님)로 시험했다.

1. Supabase 기본 객체를 흉내 낸다: `anon`·`authenticated`·`service_role` 역할, `auth.users`·`auth.identities`·`auth.uid()`, `storage.buckets`·`storage.objects`·`storage.foldername()`, `supabase_realtime` 발행, `extensions.pgcrypto`.
2. 파일 이름을 C 정렬 순서로 하나씩 적용한다.
3. `supabase/seed.sql`을 넣는다.
4. 시험 계정으로 `start_transaction`(국경 간, NARITA, 배송비 900엔)과 `create_proxy_order`(서비스료 10%)를 불러 본다.

| 단계 | 결과 |
|---|---|
| 마이그레이션 37파일 | 37/37 성공 |
| 시드 | 성공. 계정 3, 프로필 3(center 관리자), 상품 2, 외부 상품 1, 인기 테마 KR 6·JP 5 |
| RPC 2개 | 성공. 테스트 기대값과 같다 |

PGlite는 함수 본문(plpgsql)을 부를 때만 검사한다. 부르지 않은 함수 안의 오류는 이 시험으로 못 잡는다. 실제 판정은 Actions의 `db-tests`가 한다.

## CI에서 고려한 점

| 위험 | 내용 | 처리 |
|---|---|---|
| 0013 번호 중복 | `0013_conversation_delete.sql`·`0013_storage_owner_delete.sql`의 버전이 둘 다 `0013`이다. `supabase start`가 직접 적용하면 기록 표(`supabase_migrations.schema_migrations`) 기본키가 겹친다 | 파일 이름을 바꾸지 않는다. CI는 `supabase/migrations`를 옮겨 둔 채 스택을 띄우고 psql로 하나씩 넣는다 |
| 0031 안의 `begin`·`commit` | 파일이 자기 트랜잭션을 연다 | psql을 파일 단위(`-1` 없이)로 돌린다 |
| storage 정책 | 0004·0005·0013·0017·0029가 `storage.objects`에 정책을 만든다. 표 주인은 `supabase_storage_admin`이다. 현재 Postgres 17 이미지는 supautils 설정으로 `postgres`의 정책 생성을 허용한다 | 운영과 같은 `postgres` 역할로 넣는다. 실패하면 CLI·이미지 버전을 먼저 의심한다 |
| 대시보드에서만 만든 객체 | 흉내 낸 Supabase 기본 객체 밖의 의존은 재생 중 나오지 않았다 | 함수 본문 안의 참조는 `db-tests`가 확인한다 |
| 확장 | `gen_random_uuid()`만 쓴다(Postgres 기본). 시드는 `extensions.crypt`를 쓴다 | 추가 확장 없음 |
| Postgres 버전 | `config.toml`은 17이다. 운영 버전은 확인하지 않았다 | 메인이 운영 버전을 확인해 다르면 `major_version`을 맞춘다 |

## 다시 막히면

막힌 파일·줄·오류를 이 문서 아래에 적는다. 적용된 마이그레이션 파일은 고치지 않는다(운영과 어긋난다).

## Actions 첫 실행 (T11b, 2026-11-26)

| 실행 | 결과 | 원인·처리 |
|---|---|---|
| server-image 45758960572(4760dbe) | db-tests 실패(배포는 진행) | 최신 CLI(3.4.0)가 config.toml `[inbucket]` 을 거부(`local_smtp` 로 바뀜). 그 절을 지웠다 |
| db-tests 45759478133 | 재생 37/37·시드 성공, 테스트 2파일 실패 | `notifications.test.ts`·`unit/pay-recheck.test.ts` 가 `supabase/migrations` 파일을 읽는데 치워 둔 상태였다. `supabase start` 직후 되돌린다 |
| db-tests 45759666726 | 성공. 테스트 파일 40/40 | CLI 를 3.4.0 으로 고정 |

DB 테스트는 배포 게이트와 분리된 `.github/workflows/db-tests.yml` 로 옮겼다(master·`aaa/**` 푸시, 수동 실행). 실패해도 이미지·배포·smoke 에 영향이 없다.
적용된 마이그레이션 파일 때문에 막힌 곳은 없었다.