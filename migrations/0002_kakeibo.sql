-- Kakeibo household-budget schema. user_id is TEXT (Better Auth / preview 'dev-user').

create table if not exists household_profiles (
  id text primary key,
  user_id text not null unique,
  locale text not null check (locale in ('ja', 'en')),
  currency text not null check (currency in ('JPY', 'MYR')),
  net_income bigint not null,
  household_size integer not null check (household_size between 1 and 20),
  housing_type text not null check (housing_type in ('rent', 'own')),
  has_car boolean not null,
  housing_actual bigint not null,
  insurance_actual bigint not null,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists monthly_budgets (
  id text primary key,
  user_id text not null,
  year_month char(7) not null,
  net_income_snapshot bigint not null,
  shortage bigint not null default 0,
  closed boolean not null default false,
  system_txn_status text not null default 'none'
    check (system_txn_status in ('none', 'active', 'user_deleted')),
  generated_at timestamptz not null default now(),
  unique (user_id, year_month)
);
create index if not exists monthly_budgets_user_idx on monthly_budgets (user_id);

create table if not exists monthly_budget_lines (
  id text primary key,
  monthly_budget_id text not null references monthly_budgets (id) on delete cascade,
  category_code text not null,
  ratio_pct integer not null,
  budget_amount bigint not null,
  compressed boolean not null default false,
  mandatory_override boolean not null default false,
  unique (monthly_budget_id, category_code)
);
create index if not exists monthly_budget_lines_budget_idx on monthly_budget_lines (monthly_budget_id);

create table if not exists transactions (
  id text primary key,
  user_id text not null,
  category_code text not null,
  amount bigint not null,
  txn_date date not null,
  memo text,
  source text not null check (source in ('user', 'system')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists transactions_user_date_idx on transactions (user_id, txn_date);

create table if not exists email_verifications (
  id text primary key,
  user_id text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists email_verifications_user_idx on email_verifications (user_id);

create table if not exists password_reset_tokens (
  id text primary key,
  user_id text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists password_reset_tokens_hash_idx on password_reset_tokens (token_hash);

create table if not exists login_lockouts (
  email text primary key,
  failed_count integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
