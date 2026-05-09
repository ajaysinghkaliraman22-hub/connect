-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =========================================================================
-- 1. Profiles Table (extends auth.users)
-- =========================================================================

create type user_status as enum ('Offline', 'Available', 'Seeking Support');
create type user_role as enum ('Student', 'Admin');

create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  nickname text not null,
  role user_role default 'Student',
  status user_status default 'Offline',
  location text,
  credits integer default 0,
  -- Vouching system requirements
  invite_code text unique generated always as (substring(md5(id::text) from 1 for 8)) stored,
  invited_by uuid references public.profiles(id),
  is_verified boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Row Level Security (RLS) for profiles
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone."
  on profiles for select
  using ( true );

create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );

-- =========================================================================
-- 2. Matches Table (Support Sessions)
-- =========================================================================

create type match_status as enum ('Active', 'Completed', 'Cancelled');

create table public.matches (
  id uuid default uuid_generate_v4() primary key,
  requester_id uuid references public.profiles(id) not null,
  helper_id uuid references public.profiles(id) not null,
  location text not null,
  status match_status default 'Active',
  scheduled_end_time timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.matches enable row level security;

create policy "Users can view their own matches"
  on matches for select
  using (auth.uid() = requester_id or auth.uid() = helper_id);

create policy "Users can insert their own matches"
  on matches for insert
  with check (auth.uid() = requester_id or auth.uid() = helper_id);

-- =========================================================================
-- 3. Messages Table (Ghost Chat)
-- =========================================================================

create table public.messages (
  id uuid default uuid_generate_v4() primary key,
  match_id uuid references public.matches(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) not null,
  text text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.messages enable row level security;

create policy "Users can view messages of their matches"
  on messages for select
  using (
    exists (
      select 1 from public.matches
      where matches.id = messages.match_id
      and (matches.requester_id = auth.uid() or matches.helper_id = auth.uid())
    )
  );

create policy "Users can insert messages into their matches"
  on messages for insert
  with check (
    auth.uid() = sender_id and
    exists (
      select 1 from public.matches
      where matches.id = messages.match_id
      and (matches.requester_id = auth.uid() or matches.helper_id = auth.uid())
    )
  );

-- =========================================================================
-- 4. Triggers & Automation
-- =========================================================================

-- Function to handle profile creation automatically upon Supabase Auth signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, nickname)
  values (new.id, new.email, 'Ghost_' || substring(new.id::text from 1 for 6));
  return new;
end;
$$;

-- Trigger for new user creation
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================================
-- 5. Auto-destruct Ghost Chat (Requires pg_cron enabled in Supabase)
-- =========================================================================
-- To run this, go to Supabase Dashboard -> Database -> Extensions -> Enable "pg_cron".
-- It sweeps the DB every 15 minutes and permanently deletes messages from matches 
-- that concluded more than 30 minutes ago.

/*
select cron.schedule(
  'cleanup_ghost_messages',
  '*/15 * * * *',
  $$
    delete from public.messages
    where id in (
      select m.id from public.messages m
      join public.matches tm on m.match_id = tm.id
      where now() > (tm.scheduled_end_time + interval '30 minutes')
    )
  $$
);
*/
