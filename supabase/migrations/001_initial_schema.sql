-- Profiles table: stores extracted resume data
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  extracted_data jsonb not null default '{}',
  source_file_name text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- RLS: users can only access their own profiles
alter table profiles enable row level security;
create policy "Users can read own profiles" on profiles for select using (auth.uid() = user_id);
create policy "Users can insert own profiles" on profiles for insert with check (auth.uid() = user_id);
create policy "Users can update own profiles" on profiles for update using (auth.uid() = user_id);
create policy "Users can delete own profiles" on profiles for delete using (auth.uid() = user_id);

-- Index for fast user lookups
create index idx_profiles_user_id on profiles(user_id);

-- Resumes table: stores generated resume metadata
create table resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  profile_id uuid references profiles(id) on delete cascade not null,
  jd_text text not null,
  jd_title text,
  jd_requirements jsonb not null default '[]',
  matched_experiences jsonb not null default '[]',
  match_score real not null default 0,
  language text not null default 'en' check (language in ('en', 'zh')),
  template text not null default 'classic' check (template in ('classic', 'modern')),
  created_at timestamptz default now() not null
);

alter table resumes enable row level security;
create policy "Users can read own resumes" on resumes for select using (auth.uid() = user_id);
create policy "Users can insert own resumes" on resumes for insert with check (auth.uid() = user_id);
create policy "Users can update own resumes" on resumes for update using (auth.uid() = user_id);
create policy "Users can delete own resumes" on resumes for delete using (auth.uid() = user_id);

create index idx_resumes_user_id on resumes(user_id);

-- Cover letters table
create table cover_letters (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid references resumes(id) on delete cascade not null,
  content text not null,
  language text not null default 'en' check (language in ('en', 'zh')),
  created_at timestamptz default now() not null
);

alter table cover_letters enable row level security;
create policy "Users can access own cover letters" on cover_letters
  for all using (
    resume_id in (select id from resumes where user_id = auth.uid())
  );

-- Waitlist table
create table waitlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  email text not null,
  price_shown text default '$5/mo',
  created_at timestamptz default now() not null
);

alter table waitlist enable row level security;
create policy "Users can insert own waitlist" on waitlist for insert with check (auth.uid() = user_id);
create policy "Users can read own waitlist" on waitlist for select using (auth.uid() = user_id);
