-- Payday cycles, receipt splits, irregular income, and subscription watches.
-- Existing calendar budgets stay keyed as YYYY-MM. Payday periods use YYYY-MM-DD.

alter table household_profiles add column if not exists cycle_mode text not null default 'calendar';
alter table household_profiles add column if not exists payday smallint not null default 25;
alter table household_profiles add column if not exists rollover boolean not null default true;

alter table monthly_budgets alter column year_month type text;

alter table transactions add column if not exists merchant text;
alter table transactions add column if not exists receipt_id text;
alter table transactions add column if not exists recurring boolean not null default false;
alter table transactions add column if not exists kind text not null default 'expense';
alter table transactions add column if not exists income_allocation text;

create index if not exists transactions_user_merchant_idx on transactions (user_id, merchant);

create table if not exists watch_dismissals (
  user_id text not null,
  merchant_key text not null,
  kind text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, merchant_key, kind)
);
