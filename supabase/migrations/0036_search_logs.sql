-- 0036 검색 로그 + 캐시 번역 제목의 언어 (05-roadmap T2).
-- search_logs: 인기 검색어 집계용. 사용자 식별 값(user id·IP·세션)은 저장하지 않는다.
--   서버(app/global/page.tsx → lib/search-log.ts)가 서비스 롤로 insert, 관리자만 조회. 표가 없어도 검색은 동작한다(로그만 건너뜀).
-- external_items.title_translated_lang: title_translated 가 어느 언어인지('ko'|'ja'). 화면 언어와 같을 때만 번역 제목을 보인다.
create table if not exists search_logs (
  id bigint generated always as identity primary key,
  q text not null check (char_length(q) between 1 and 80),
  q_norm text not null,
  lang text not null check (lang in ('ko', 'ja')),
  source text not null,
  hits integer not null default 0 check (hits >= 0),
  created_at timestamptz not null default now()
);
create index if not exists search_logs_created_idx on search_logs (created_at desc);
create index if not exists search_logs_norm_idx on search_logs (q_norm, created_at desc);

alter table search_logs enable row level security;
-- insert 정책 없음: anon·authenticated 는 쓸 수 없고 서비스 롤(RLS 우회)만 쓴다
drop policy if exists "admin reads search logs" on search_logs;
create policy "admin reads search logs" on search_logs for select using (is_admin_user());

alter table external_items add column if not exists title_translated_lang text
  check (title_translated_lang is null or title_translated_lang in ('ko', 'ja'));
-- 기존 번역 제목은 글자로 언어를 채운다(한글 → ko, 가나 → ja). 둘 다 아니면 null 로 둔다(화면이 글자로 다시 판정)
update external_items set title_translated_lang = case
    when title_translated ~ '[가-힣]' then 'ko'
    when title_translated ~ '[ぁ-んァ-ヶ]' then 'ja'
  end
where title_translated is not null and title_translated_lang is null;

-- 되돌리기:
-- drop table if exists search_logs;
-- alter table external_items drop column if exists title_translated_lang;
