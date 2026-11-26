-- CI 임시 Supabase 전용 시드 (T11). 운영 DB에는 절대 돌리지 않는다.
-- .github/workflows/server-image.yml 의 db-tests 작업이 마이그레이션 0001~ 재생 뒤 psql 로 넣는다.
-- 비밀번호는 로컬 스택 전용이며 tests/*.test.ts 의 TEST_PASSWORD 기본값과 같다.
-- 시험 계정: alice(한국 판매자) · bob(일본 구매자, 국경 간 상품 1개) · center(관리자)
-- 테스트가 기대하는 데이터: bob 의 국경 간 active 상품, 최근 external_items 1개, trending_themes(0017 시드)

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('test-pass-1234', extensions.gen_salt('bf')), now(), '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
from (values
  ('a11ce000-0000-4000-8000-000000000001'::uuid, 'tomo.test.alice@gmail.com'),
  ('b0b00000-0000-4000-8000-000000000002'::uuid, 'tomo.test.bob@gmail.com'),
  ('cec00000-0000-4000-8000-000000000003'::uuid, 'tomo.test.center@gmail.com')
) as u(id, email);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now(), now()
from auth.users where email like 'tomo.test.%@gmail.com';

insert into profiles (id, nickname, country, region, language, is_admin) values
  ('a11ce000-0000-4000-8000-000000000001', 'alice', 'KR', '서울 마포구', 'ko', false),
  ('b0b00000-0000-4000-8000-000000000002', 'bob', 'JP', '東京 新宿区', 'ja', false),
  ('cec00000-0000-4000-8000-000000000003', 'center', 'KR', '서울 마포구', 'ko', true);

-- chat·escrow 가 빌리는 bob 의 국경 간 상품, chat 이 빌리는 alice 의 상품(다른 테스트가 만든 상품은 끝에 지워진다)
insert into listings (seller_id, title, description, source_language, price, currency, category,
  trade_method, cross_border_enabled, country, region)
values ('b0b00000-0000-4000-8000-000000000002', 'フィルムカメラ', '動作確認済み', 'ja', 12000, 'JPY', 'camera',
  'shipping', true, 'JP', '東京 新宿区'),
  ('a11ce000-0000-4000-8000-000000000001', '시드 필름카메라', '시험용', 'ko', 50000, 'KRW', 'camera',
  'shipping', true, 'KR', '서울 마포구');

-- cart-rls 가 빌리는 최근 외부 상품(15분 신선도 안에서 주문 테스트가 돈다)
insert into external_items (source, source_id, url, title, price, currency, images, seller_name, status, fetched_at)
values ('mercari', 'tomo-ci-seed-1', 'https://jp.mercari.com/item/tomo-ci-seed-1', 'TOMO CI seed item', 3000, 'JPY', '{}', '', 'active', now());
