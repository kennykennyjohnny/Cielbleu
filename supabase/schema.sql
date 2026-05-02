-- Extensions
create extension if not exists "uuid-ossp";

-- Lieux
create table if not exists places (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text not null,
  lat float not null,
  lng float not null,
  type text not null check (type in ('bar', 'restaurant', 'cafe', 'park')),
  google_place_id text unique,
  has_terrace boolean default null,
  terrace_probability float default 0.5,
  google_rating float,
  price_level integer,
  photos text[] default '{}',
  instagram_url text,
  google_maps_url text,
  opening_hours jsonb,
  arrondissement integer,
  created_at timestamptz default now()
);

create index if not exists idx_places_type on places(type);
create index if not exists idx_places_arrondissement on places(arrondissement);
create index if not exists idx_places_lat_lng on places(lat, lng);

-- Scores soleil pré-calculés
create table if not exists sun_scores (
  id uuid primary key default uuid_generate_v4(),
  place_id uuid references places(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  time_slot text not null, -- "14:00", "14:30"
  score integer not null check (score between 1 and 5),
  raw_data jsonb,
  updated_at timestamptz default now(),
  unique (place_id, month, time_slot)
);

create index if not exists idx_sun_scores_place on sun_scores(place_id);
create index if not exists idx_sun_scores_month_slot on sun_scores(month, time_slot);

-- Confirmations communauté (expire après 2h)
create table if not exists sun_confirmations (
  id uuid primary key default uuid_generate_v4(),
  place_id uuid references places(id) on delete cascade,
  device_id text not null,
  is_sunny boolean not null,
  created_at timestamptz default now()
);

create index if not exists idx_confirmations_place on sun_confirmations(place_id, created_at);

-- Avis
create table if not exists reviews (
  id uuid primary key default uuid_generate_v4(),
  place_id uuid references places(id) on delete cascade,
  device_id text not null,
  rating integer not null check (rating between 1 and 5),
  comment text,
  photos text[] default '{}',
  created_at timestamptz default now()
);

create index if not exists idx_reviews_place on reviews(place_id);

-- Présences "J'y suis" (expire après 3h)
create table if not exists presences (
  id uuid primary key default uuid_generate_v4(),
  place_id uuid references places(id) on delete cascade,
  device_id text not null,
  created_at timestamptz default now()
);

create index if not exists idx_presences_place on presences(place_id, created_at);

-- RLS : lecture publique
alter table places enable row level security;
alter table sun_scores enable row level security;
alter table sun_confirmations enable row level security;
alter table reviews enable row level security;
alter table presences enable row level security;

create policy "Places lisibles par tous" on places for select using (true);
create policy "Sun scores lisibles par tous" on sun_scores for select using (true);
create policy "Confirmations lisibles par tous" on sun_confirmations for select using (true);
create policy "Avis lisibles par tous" on reviews for select using (true);
create policy "Présences lisibles par tous" on presences for select using (true);

create policy "Confirmations insérables par tous" on sun_confirmations for insert with check (true);
create policy "Avis insérables par tous" on reviews for insert with check (true);
create policy "Présences insérables par tous" on presences for insert with check (true);

-- Bucket Supabase Storage pour les photos
-- À créer manuellement dans Supabase Dashboard → Storage → New bucket
-- Nom : "terrace-photos", public : true
