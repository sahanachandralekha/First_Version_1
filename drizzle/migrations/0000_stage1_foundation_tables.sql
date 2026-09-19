create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accessibility_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  profile jsonb not null default '{"visual":true,"hearing":true,"speech":false}'::jsonb,
  prefs jsonb not null default '{}'::jsonb,
  inai jsonb not null default '{}'::jsonb,
  onboarded boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.inai_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.assistance_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  severity text not null default 'info',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.emergency_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.sign_phrases (
  id uuid primary key default gen_random_uuid(),
  phrase text not null unique,
  category text not null default 'general',
  description text,
  video_url text,
  status text not null default 'validated',
  created_at timestamptz not null default now()
);

create table public.saved_phrases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phrase_id uuid not null references public.sign_phrases(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, phrase_id)
);

create table public.transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  language text not null default 'en-IN',
  created_at timestamptz not null default now()
);

create table public.accessible_places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'campus',
  latitude double precision,
  longitude double precision,
  accessibility jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.profiles, public.accessibility_preferences, public.inai_settings, public.assistance_events, public.emergency_events, public.saved_phrases, public.transcripts to authenticated;
grant select on public.sign_phrases, public.accessible_places to anon, authenticated;
grant all on public.profiles, public.accessibility_preferences, public.inai_settings, public.assistance_events, public.emergency_events, public.saved_phrases, public.transcripts, public.sign_phrases, public.accessible_places to service_role;

alter table public.profiles enable row level security;
alter table public.accessibility_preferences enable row level security;
alter table public.inai_settings enable row level security;
alter table public.assistance_events enable row level security;
alter table public.emergency_events enable row level security;
alter table public.sign_phrases enable row level security;
alter table public.saved_phrases enable row level security;
alter table public.transcripts enable row level security;
alter table public.accessible_places enable row level security;

create policy "Users manage own profile" on public.profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own preferences" on public.accessibility_preferences for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own INAI settings" on public.inai_settings for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own assistance events" on public.assistance_events for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own emergency events" on public.emergency_events for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own saved phrases" on public.saved_phrases for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own transcripts" on public.transcripts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Public read sign phrases" on public.sign_phrases for select to anon, authenticated using (true);
create policy "Public read accessible places" on public.accessible_places for select to anon, authenticated using (true);