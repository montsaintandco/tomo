create type country_code as enum ('KR','JP');
create type currency_code as enum ('KRW','JPY');
create type listing_status as enum ('active','reserved','sold');
create type trade_method as enum ('direct','shipping','both');
create type center_code as enum ('SEOUL','NARITA');
create type tx_status as enum (
  'pending_payment','paid','shipped','shipped_to_center','center_received',
  'shipped_international','delivered','completed','cancelled','disputed');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  country country_code not null,
  region text not null,
  language text not null check (language in ('ko','ja')),
  trust_temp numeric(4,1) not null default 36.5,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references profiles(id),
  title text not null,
  description text not null,
  source_language text not null check (source_language in ('ko','ja')),
  price integer not null check (price > 0),
  currency currency_code not null,
  category text not null,
  status listing_status not null default 'active',
  trade_method trade_method not null,
  cross_border_enabled boolean not null default false,
  country country_code not null,
  region text not null,
  images text[] not null default '{}',
  reserved_at timestamptz,
  created_at timestamptz not null default now()
);
create index on listings (country, status, created_at desc);
create index on listings (cross_border_enabled, status);

create table listing_translations (
  listing_id uuid not null references listings(id) on delete cascade,
  language text not null check (language in ('ko','ja')),
  title text not null,
  description text not null,
  primary key (listing_id, language)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id),
  buyer_id uuid not null references profiles(id),
  seller_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (listing_id, buyer_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text not null,
  body_translated text,
  created_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id),
  buyer_id uuid not null references profiles(id),
  seller_id uuid not null references profiles(id),
  status tx_status not null default 'pending_payment',
  is_cross_border boolean not null,
  center center_code,
  stripe_payment_intent_id text unique,
  domestic_tracking text,
  intl_tracking text,
  item_price integer not null,
  intl_shipping_fee integer not null default 0,
  platform_fee integer not null default 0,
  currency currency_code not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint center_required_for_cross_border
    check (not is_cross_border or center is not null)
);
create index on transactions (buyer_id);
create index on transactions (seller_id);

create table exchange_rates (
  pair text primary key,
  rate numeric not null,
  updated_at timestamptz not null default now()
);
insert into exchange_rates (pair, rate) values ('JPY_KRW', 9.0), ('KRW_JPY', 0.111);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id),
  reviewer_id uuid not null references profiles(id),
  rating integer not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  unique (transaction_id, reviewer_id)
);
