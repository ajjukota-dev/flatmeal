create index agent_events_agent_run_idx on public.agent_events (agent_run_id);
create index agent_events_cart_session_idx on public.agent_events (cart_session_id);
create index agent_events_message_event_idx on public.agent_events (message_event_id);
create index agent_events_order_idx on public.agent_events (order_id);
create index agent_events_telegram_chat_idx on public.agent_events (telegram_chat_id);

create index agent_runs_message_event_idx on public.agent_runs (message_event_id);

create index cart_sessions_approved_by_member_idx on public.cart_sessions (approved_by_member_id);
create index cart_sessions_swiggy_connection_idx on public.cart_sessions (swiggy_connection_id);

create index household_members_telegram_user_idx on public.household_members (telegram_user_id);

create index message_events_telegram_chat_idx on public.message_events (telegram_chat_id);
create index message_events_telegram_user_idx on public.message_events (telegram_user_id);

create index oauth_sessions_household_idx on public.oauth_sessions (household_id);
create index oauth_sessions_owner_member_idx on public.oauth_sessions (owner_member_id);

create index orders_cart_session_idx on public.orders (cart_session_id);
create index orders_swiggy_connection_idx on public.orders (swiggy_connection_id);

create index swiggy_connections_owner_member_idx on public.swiggy_connections (owner_member_id);

create index voice_assets_message_event_idx on public.voice_assets (message_event_id);
