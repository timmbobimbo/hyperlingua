-- Run this in the Supabase SQL Editor

create table if not exists user_credits (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  balance    integer not null default 500,
  is_admin   boolean not null default false,
  created_at timestamptz default now()
);

alter table user_credits enable row level security;

create policy "Users can read own credits"
  on user_credits for select
  using (auth.uid() = user_id);

-- Add is_admin column to existing table (run if table already exists):
-- alter table user_credits add column if not exists is_admin boolean not null default false;

-- Grant admin to a user (replace with your actual user_id from auth.users):
-- update user_credits set is_admin = true where user_id = '<deine-user-id>';
