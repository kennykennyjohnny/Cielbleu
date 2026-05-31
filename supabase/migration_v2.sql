-- ═══════════════════════════════════════════════════════════════════════════
-- HopSoleil — Migration v2
-- Colle dans Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. PROFILES ────────────────────────────────────────────────────────────
-- Un profil = un compte Supabase Auth. Créé automatiquement à l'inscription.

create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz default now()
);

alter table profiles enable row level security;

drop policy if exists "Profils lisibles par tous"                    on profiles;
drop policy if exists "Profils insérables par leur propriétaire"     on profiles;
drop policy if exists "Profils modifiables par leur propriétaire"    on profiles;

create policy "Profils lisibles par tous"
  on profiles for select using (true);

create policy "Profils insérables par leur propriétaire"
  on profiles for insert with check (auth.uid() = id);

create policy "Profils modifiables par leur propriétaire"
  on profiles for update using (auth.uid() = id);

-- Trigger : crée le profil dès l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── 2. FAVORITES ───────────────────────────────────────────────────────────

create table if not exists favorites (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  place_id   uuid not null references places(id)     on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, place_id)
);

create index if not exists idx_favorites_user  on favorites(user_id);
create index if not exists idx_favorites_place on favorites(place_id);

alter table favorites enable row level security;

drop policy if exists "Favoris lisibles par tous"                    on favorites;
drop policy if exists "Favoris insérables par leur propriétaire"     on favorites;
drop policy if exists "Favoris supprimables par leur propriétaire"   on favorites;

-- Lecture publique (nécessaire pour la vue place_like_counts ci-dessous)
create policy "Favoris lisibles par tous"
  on favorites for select using (true);

create policy "Favoris insérables par leur propriétaire"
  on favorites for insert with check (auth.uid() = user_id);

create policy "Favoris supprimables par leur propriétaire"
  on favorites for delete using (auth.uid() = user_id);


-- ── 3. PLACE_LIKE_COUNTS (vue publique) ────────────────────────────────────
-- Compte les favoris par lieu. Pas de RLS car c'est une vue, la table
-- favorites est déjà publiquement lisible.

create or replace view place_like_counts as
  select place_id, count(*)::int as like_count
  from   favorites
  group  by place_id;


-- ── 4. SUN_VOTES ───────────────────────────────────────────────────────────
-- Vote communautaire "☀️ au soleil / 🌑 à l'ombre" sur une terrasse.
-- Utilisé en temps réel pour calibrer le score calculé.

create table if not exists sun_votes (
  id         uuid primary key default uuid_generate_v4(),
  place_id   uuid not null references places(id) on delete cascade,
  user_id    uuid          references auth.users(id) on delete set null,
  device_id  text not null,
  is_sunny   boolean not null,
  time_slot  text,            -- ex. "14:30" (créneau horaire du vote)
  created_at timestamptz default now()
);

create index if not exists idx_sun_votes_place  on sun_votes(place_id, created_at);
create index if not exists idx_sun_votes_device on sun_votes(device_id, place_id);

alter table sun_votes enable row level security;

drop policy if exists "Votes soleil lisibles par tous"    on sun_votes;
drop policy if exists "Votes soleil insérables par tous"  on sun_votes;

create policy "Votes soleil lisibles par tous"
  on sun_votes for select using (true);

create policy "Votes soleil insérables par tous"
  on sun_votes for insert with check (true);


-- ── 5. FRIENDSHIPS ─────────────────────────────────────────────────────────

create table if not exists friendships (
  id           uuid primary key default uuid_generate_v4(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'rejected')),
  created_at   timestamptz default now(),
  unique (requester_id, addressee_id)
);

create index if not exists idx_friendships_requester on friendships(requester_id);
create index if not exists idx_friendships_addressee on friendships(addressee_id);

alter table friendships enable row level security;

drop policy if exists "Amitiés lisibles si impliqué"           on friendships;
drop policy if exists "Amitiés insérables par le demandeur"    on friendships;
drop policy if exists "Amitiés modifiables si impliqué"        on friendships;
drop policy if exists "Amitiés supprimables si impliqué"       on friendships;

create policy "Amitiés lisibles si impliqué"
  on friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Amitiés insérables par le demandeur"
  on friendships for insert
  with check (auth.uid() = requester_id);

create policy "Amitiés modifiables si impliqué"
  on friendships for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Amitiés supprimables si impliqué"
  on friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);


-- ── 6. REVIEWS — colonnes manquantes ───────────────────────────────────────
-- La table existe déjà, on ajoute user_id + is_anonymous.

alter table reviews
  add column if not exists user_id      uuid references auth.users(id) on delete set null,
  add column if not exists is_anonymous boolean default false;

-- Politique de suppression par l'auteur (via user_id)
drop policy if exists "Avis supprimables par leur auteur" on reviews;
create policy "Avis supprimables par leur auteur"
  on reviews for delete
  using (auth.uid() = user_id);


-- ── 7. STORAGE — bucket avatars ────────────────────────────────────────────
-- Crée le bucket si absent, puis les policies d'accès.

insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

drop policy if exists "Avatars lisibles par tous"                   on storage.objects;
drop policy if exists "Avatars uploadables par leur propriétaire"   on storage.objects;
drop policy if exists "Avatars modifiables par leur propriétaire"   on storage.objects;

create policy "Avatars lisibles par tous"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Avatars uploadables par leur propriétaire"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Avatars modifiables par leur propriétaire"
  on storage.objects for update
  using (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );
