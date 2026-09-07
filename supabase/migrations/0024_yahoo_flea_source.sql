-- Yahoo!フリマ(paypayfleamarket.yahoo.co.jp)를 야후옥션과 별개 소스로 추가
alter table external_items drop constraint if exists external_items_source_check;
alter table external_items add constraint external_items_source_check
  check (source in ('mercari','yahoo_auction','yahoo_flea','daangn','joongna'));
