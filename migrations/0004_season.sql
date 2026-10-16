-- Extra category budget that applies only in one season. Savings is never stored here.

create table if not exists seasonal_adjustments (
  user_id text not null,
  season text not null,
  category_code text not null,
  extra_amount integer not null,
  primary key (user_id, season, category_code)
);
