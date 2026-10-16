-- Savings target for the achievement forecast. 0 means the user has not set one.
alter table household_profiles add column if not exists savings_goal bigint not null default 0;
