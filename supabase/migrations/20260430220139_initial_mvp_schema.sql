create extension if not exists pgcrypto with schema extensions;

create type public.household_member_role as enum ('owner', 'cook', 'flatmate');
create type public.cart_session_status as enum ('building', 'upsell_open', 'approval_pending', 'approved', 'checked_out', 'expired', 'failed');
create type public.swiggy_connection_mode as enum ('fake', 'real');
create type public.swiggy_connection_status as enum ('pending', 'connected', 'expired', 'revoked');
create type public.agent_run_status as enum ('started', 'succeeded', 'failed');
create type public.order_status as enum ('created', 'confirmed', 'tracking', 'delivered', 'failed');

create table public.households (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active',
  operational_mode text not null default 'telegram_mvp',
  default_language text not null default 'hinglish',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.telegram_chats (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  telegram_chat_id text not null unique,
  title text,
  type text not null default 'group',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.telegram_users (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id text not null unique,
  username text,
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  telegram_user_id uuid not null references public.telegram_users(id) on delete cascade,
  role public.household_member_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, telegram_user_id)
);

create unique index household_single_owner_idx
  on public.household_members (household_id)
  where role = 'owner';

create table public.cook_profiles (
  id uuid primary key default gen_random_uuid(),
  household_member_id uuid not null unique references public.household_members(id) on delete cascade,
  preferred_language text not null default 'hinglish',
  tts_voice text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.swiggy_connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null unique references public.households(id) on delete cascade,
  owner_member_id uuid not null references public.household_members(id) on delete restrict,
  mode public.swiggy_connection_mode not null default 'fake',
  status public.swiggy_connection_status not null default 'pending',
  encrypted_access_token text,
  token_expires_at timestamptz,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.oauth_sessions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_member_id uuid not null references public.household_members(id) on delete cascade,
  state_hash text not null unique,
  code_verifier_hash text not null,
  code_hash text unique,
  redirect_uri text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.message_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  telegram_chat_id uuid references public.telegram_chats(id) on delete cascade,
  telegram_user_id uuid references public.telegram_users(id) on delete set null,
  telegram_update_id text not null unique,
  telegram_message_id text,
  message_kind text not null,
  sanitized_text text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.voice_assets (
  id uuid primary key default gen_random_uuid(),
  message_event_id uuid not null references public.message_events(id) on delete cascade,
  telegram_file_id text not null,
  provider text not null default 'sarvam',
  stt_status text not null default 'pending',
  transcript text,
  transcript_language text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  message_event_id uuid references public.message_events(id) on delete set null,
  agent_name text not null,
  intent text,
  status public.agent_run_status not null default 'started',
  trace_id text,
  model text,
  sanitized_input jsonb not null default '{}'::jsonb,
  sanitized_output jsonb not null default '{}'::jsonb,
  error_summary text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.cart_sessions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  swiggy_connection_id uuid references public.swiggy_connections(id) on delete set null,
  status public.cart_session_status not null default 'building',
  revision integer not null default 1,
  selected_address_id text,
  approval_message_id text,
  approved_by_member_id uuid references public.household_members(id) on delete set null,
  approved_revision integer,
  approved_at timestamptz,
  upsell_opened_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_revision_positive check (revision > 0),
  constraint approved_revision_matches check (approved_revision is null or approved_revision = revision)
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_session_id uuid not null references public.cart_sessions(id) on delete cascade,
  revision integer not null,
  requested_name text not null,
  selected_product_name text,
  spin_id text not null,
  quantity integer not null,
  unit text,
  price_minor integer,
  created_at timestamptz not null default now(),
  constraint cart_item_quantity_positive check (quantity > 0)
);

create index cart_items_session_revision_idx
  on public.cart_items (cart_session_id, revision);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  cart_session_id uuid not null references public.cart_sessions(id) on delete restrict,
  swiggy_connection_id uuid references public.swiggy_connections(id) on delete set null,
  local_order_id text not null unique,
  swiggy_order_id text,
  status public.order_status not null default 'created',
  total_minor integer,
  tracking_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  telegram_chat_id uuid references public.telegram_chats(id) on delete set null,
  message_event_id uuid references public.message_events(id) on delete set null,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  cart_session_id uuid references public.cart_sessions(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  event_type text not null,
  status text not null default 'ok',
  user_safe_message text,
  sanitized_payload jsonb not null default '{}'::jsonb,
  retryable boolean,
  created_at timestamptz not null default now()
);

create index telegram_chats_household_idx on public.telegram_chats (household_id);
create index household_members_household_role_idx on public.household_members (household_id, role);
create index message_events_household_created_idx on public.message_events (household_id, created_at desc);
create index agent_runs_household_started_idx on public.agent_runs (household_id, started_at desc);
create index cart_sessions_household_status_idx on public.cart_sessions (household_id, status);
create index orders_household_created_idx on public.orders (household_id, created_at desc);
create index agent_events_household_created_idx on public.agent_events (household_id, created_at desc);

alter table public.households enable row level security;
alter table public.telegram_chats enable row level security;
alter table public.telegram_users enable row level security;
alter table public.household_members enable row level security;
alter table public.cook_profiles enable row level security;
alter table public.swiggy_connections enable row level security;
alter table public.oauth_sessions enable row level security;
alter table public.message_events enable row level security;
alter table public.voice_assets enable row level security;
alter table public.agent_runs enable row level security;
alter table public.cart_sessions enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.agent_events enable row level security;

comment on table public.swiggy_connections is 'Backend-only Swiggy OAuth connection state. Store encrypted tokens only; never store OTPs or passwords.';
comment on table public.agent_events is 'Sanitized product timeline events. Do not store raw tokens, full addresses, payment details, or sensitive transcripts.';
