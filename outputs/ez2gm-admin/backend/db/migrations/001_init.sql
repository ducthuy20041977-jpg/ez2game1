create table if not exists users (
  id text primary key,
  account text not null unique,
  password_hash text not null,
  role text not null,
  status text not null default 'active',
  note text not null default '',
  supplier_code text,
  last_login_at timestamptz,
  failed_login_count integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists orders (
  id text primary key,
  order_no text not null unique,
  customer_email text not null,
  game text not null,
  project text not null,
  game_id_cipher text,
  account_cipher text,
  password_cipher text,
  encryption_version text not null default 'v1',
  status text not null,
  payment_status text not null,
  agent text,
  supplier text,
  profit text,
  assigned_service_id text references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists order_items (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  item_name text not null,
  server text,
  qty text,
  price text,
  supplier_price text,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists dispatches (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  mode text,
  service_account text,
  supplier_code text,
  deadline text,
  lock_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists chat_threads (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  owner_account text,
  unread_count integer not null default 0,
  customer_online boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists chat_messages (
  id text primary key,
  thread_id text not null references chat_threads(id) on delete cascade,
  sender_type text not null,
  body text not null,
  translated_body text,
  created_at timestamptz not null default now()
);

create table if not exists uploads (
  id text primary key,
  order_id text references orders(id) on delete set null,
  order_no text,
  file_type text not null,
  file_name text not null default '',
  storage_url text not null,
  uploaded_by text,
  created_at timestamptz not null default now()
);

create table if not exists payment_webhooks (
  id text primary key,
  order_id text references orders(id) on delete set null,
  platform text not null,
  amount text,
  event_id text not null unique,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists supplier_settlements (
  id text primary key,
  supplier text not null,
  supplier_code text not null,
  completed_count integer not null default 0,
  amount_cny numeric(12, 2) not null default 0,
  deduction_cny numeric(12, 2) not null default 0,
  payable_cny numeric(12, 2) not null default 0,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists game_projects (
  id text primary key,
  game text not null,
  project text not null,
  service_type text not null,
  frontend_price text,
  backend_price text,
  mode text not null,
  status text not null,
  image_url text,
  required_fields text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (game, project)
);

create table if not exists service_types (
  id text primary key,
  name text not null unique,
  dispatch text,
  status text not null default 'active'
);

create table if not exists pricing_rules (
  id text primary key,
  game text not null,
  project text not null,
  service_type text not null,
  region text,
  market_avg_usd numeric(12, 2),
  market_low_usd numeric(12, 2),
  market_high_usd numeric(12, 2),
  ez_price_usd numeric(12, 2),
  yesterday_ez_price_usd numeric(12, 2),
  target_gap_pct numeric(6, 2),
  daily_limit_pct numeric(6, 2),
  strategy text not null default 'market',
  mode text not null default 'manual',
  permission text not null default 'admin',
  source_count integer not null default 0,
  last_scan_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (game, project, service_type)
);

create table if not exists price_reviews (
  id text primary key,
  pricing_rule_id text references pricing_rules(id) on delete set null,
  scope_mode text not null default 'item',
  game text,
  service_type text,
  reason text,
  market_avg_usd numeric(12, 2),
  old_ez_price_usd numeric(12, 2),
  suggested_ez_price_usd numeric(12, 2),
  old_gap_pct numeric(6, 2),
  suggested_gap_pct numeric(6, 2),
  permission text not null,
  status text not null,
  approved_by text references users(id),
  created_at timestamptz not null default now()
);

create table if not exists market_price_sources (
  id text primary key,
  pricing_rule_id text references pricing_rules(id) on delete cascade,
  platform text not null,
  price_usd numeric(12, 2),
  stock_status text,
  collected_at timestamptz not null default now()
);

create table if not exists frontend_content (
  id text primary key,
  payload jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists media_drafts (
  id text primary key,
  payload jsonb not null,
  status text not null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists media_publish_logs (
  id text primary key,
  payload jsonb not null,
  actor text,
  created_at timestamptz not null default now()
);

create table if not exists analytics_events (
  id text primary key,
  page text not null,
  source text,
  action text,
  value text,
  user_code text,
  region text,
  game text,
  status text,
  service text,
  created_at timestamptz not null default now()
);

create table if not exists ai_tasks (
  id text primary key,
  employee text,
  type text not null,
  name text,
  target text,
  mode text,
  payload jsonb,
  status text not null,
  approved_by text references users(id),
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists ai_sales_opportunities (
  id text primary key,
  game text not null,
  genre text,
  trade_services text,
  demand_signal text,
  supplier_status text,
  trade_score numeric(6, 2),
  action text,
  status text not null default 'watching',
  created_at timestamptz not null default now()
);

create table if not exists upcoming_game_releases (
  id text primary key,
  release_date date,
  game text not null,
  platform text,
  trade_direction text,
  launch_action text,
  status text not null default 'watching',
  source_url text,
  created_at timestamptz not null default now()
);

create table if not exists ai_sales_launch_actions (
  id text primary key,
  opportunity_id text references ai_sales_opportunities(id) on delete set null,
  action text not null,
  target text,
  owner_role text,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists business_simulations (
  id text primary key,
  scenario text not null,
  assumptions jsonb not null,
  daily_profit_day integer,
  breakeven_day integer,
  final_cash_cny numeric(14, 2),
  loop_score integer,
  summary jsonb,
  created_by text references users(id),
  created_at timestamptz not null default now()
);

create table if not exists business_loop_checkpoints (
  id text primary key,
  step text not null,
  ability text,
  status text not null,
  owner_action text,
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id text primary key,
  actor text,
  role text,
  action text not null,
  target_type text,
  target_id text,
  meta jsonb,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_status_created_at on orders (status, created_at);
create index if not exists idx_order_items_order_id on order_items (order_id);
create index if not exists idx_dispatches_order_supplier_service on dispatches (order_id, supplier_code, service_account, lock_state);
create index if not exists idx_chat_threads_order_owner_unread on chat_threads (order_id, owner_account, unread_count);
create index if not exists idx_chat_messages_thread_created_at on chat_messages (thread_id, created_at);
create index if not exists idx_uploads_order_type_created_at on uploads (order_id, file_type, created_at);
create index if not exists idx_payment_webhooks_order_platform on payment_webhooks (order_id, platform);
create index if not exists idx_supplier_settlements_supplier_status on supplier_settlements (supplier_code, status, created_at);
create index if not exists idx_game_projects_game_service_status on game_projects (game, service_type, status);
create index if not exists idx_pricing_rules_game_project_service on pricing_rules (game, project, service_type, permission);
create index if not exists idx_price_reviews_status_permission on price_reviews (status, permission, created_at);
create index if not exists idx_market_price_sources_rule_platform on market_price_sources (pricing_rule_id, platform, collected_at);
create index if not exists idx_ai_sales_opportunities_score on ai_sales_opportunities (trade_score, status);
create index if not exists idx_upcoming_game_releases_date on upcoming_game_releases (release_date, status);
create index if not exists idx_business_simulations_created on business_simulations (scenario, created_at);
create index if not exists idx_audit_logs_actor_action_created_at on audit_logs (actor, action, created_at);
