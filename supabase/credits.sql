-- Run this in the Supabase SQL Editor

create table if not exists user_credits (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  balance    integer not null default 500,
  created_at timestamptz default now()
);

alter table user_credits enable row level security;

create policy "Users can read own credits"
  on user_credits for select
  using (auth.uid() = user_id);
