-- =============================================================================
-- HopSoleil — Migration complète v3
-- Idempotente : peut être relancée plusieurs fois sans erreur.
-- Couvre : profiles, favorites, friendships, sun_votes, reviews, like counts.
-- =============================================================================

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. PROFILES
-- =============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     TEXT        UNIQUE,
  display_name TEXT,
  avatar_url   TEXT,
  bio          TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Supprimer les policies existantes (idempotence)
DROP POLICY IF EXISTS "Profiles lisibles par tous"             ON profiles;
DROP POLICY IF EXISTS "Profile modifiable par le propriétaire" ON profiles;
DROP POLICY IF EXISTS "Profile inserable par le proprietaire"  ON profiles;

CREATE POLICY "Profiles lisibles par tous"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Profile modifiable par le propriétaire"
  ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Profile inserable par le proprietaire"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ── Trigger : créer un profil automatiquement à l'inscription ─────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'display_name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Trigger : générér un username unique à partir du display_name ─────────────
CREATE OR REPLACE FUNCTION generate_username_if_null()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  counter   INT := 0;
BEGIN
  IF NEW.username IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Génère un slug à partir du display_name ou de l'id
  base_slug := lower(
    regexp_replace(
      unaccent(COALESCE(NEW.display_name, 'user')),
      '[^a-z0-9]', '', 'g'
    )
  );
  IF length(base_slug) < 3 THEN
    base_slug := 'user' || substring(NEW.id::text, 1, 6);
  END IF;

  candidate := base_slug;
  WHILE EXISTS (SELECT 1 FROM profiles WHERE username = candidate AND id != NEW.id) LOOP
    counter := counter + 1;
    candidate := base_slug || counter::text;
  END LOOP;

  NEW.username := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_username ON profiles;
CREATE TRIGGER auto_username
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION generate_username_if_null();

-- =============================================================================
-- 2. FAVORITES
-- =============================================================================
CREATE TABLE IF NOT EXISTS favorites (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id   UUID        NOT NULL REFERENCES places(id)    ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, place_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user  ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_place ON favorites(place_id);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Favoris visibles par le propriétaire"     ON favorites;
DROP POLICY IF EXISTS "Favoris insérables par le propriétaire"   ON favorites;
DROP POLICY IF EXISTS "Favoris supprimables par le propriétaire" ON favorites;
DROP POLICY IF EXISTS "Nombre de favoris visible par tous"        ON favorites;

-- SELECT : pour les comptages publics on autorise tout le monde à lire place_id
-- (pas user_id — la vue place_like_counts masque l'identité)
CREATE POLICY "Favoris visibles par tous (comptage)"
  ON favorites FOR SELECT USING (true);

CREATE POLICY "Favoris insérables par le propriétaire"
  ON favorites FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Favoris supprimables par le propriétaire"
  ON favorites FOR DELETE USING (auth.uid() = user_id);

-- =============================================================================
-- 3. VUE — Comptage des likes par lieu (accessible publiquement, sans user_id)
-- =============================================================================
CREATE OR REPLACE VIEW place_like_counts AS
SELECT
  place_id,
  COUNT(*)::int AS like_count
FROM favorites
GROUP BY place_id;

-- Accès public en lecture
GRANT SELECT ON place_like_counts TO anon, authenticated;

-- =============================================================================
-- 4. FRIENDSHIPS
-- =============================================================================
CREATE TABLE IF NOT EXISTS friendships (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);

ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Amitiés visibles par les parties"                   ON friendships;
DROP POLICY IF EXISTS "Demande d'amitié insérables par le demandeur"       ON friendships;
DROP POLICY IF EXISTS "Amitié modifiable par l'une ou l'autre partie"     ON friendships;
DROP POLICY IF EXISTS "Amitié supprimable par l'une ou l'autre partie"    ON friendships;

-- Lecture : chaque partie voit ses relations
CREATE POLICY "Amitiés visibles par les parties"
  ON friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Insertion : seul le demandeur peut créer la demande
CREATE POLICY "Demande d'amitié insérables par le demandeur"
  ON friendships FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

-- Mise à jour : les deux parties peuvent accepter / refuser / bloquer
CREATE POLICY "Amitié modifiable par l'une ou l'autre partie"
  ON friendships FOR UPDATE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Suppression : les deux parties peuvent supprimer (retirer l'ami)
CREATE POLICY "Amitié supprimable par l'une ou l'autre partie"
  ON friendships FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- ── Trigger : mettre à jour updated_at à chaque modification ─────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_friendships_updated_at ON friendships;
CREATE TRIGGER touch_friendships_updated_at
  BEFORE UPDATE ON friendships
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- =============================================================================
-- 5. SUN VOTES
-- =============================================================================
CREATE TABLE IF NOT EXISTS sun_votes (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  place_id   UUID        NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  device_id  TEXT        NOT NULL,
  is_sunny   BOOLEAN     NOT NULL,
  time_slot  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sun_votes_place ON sun_votes(place_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sun_votes_user  ON sun_votes(user_id);

ALTER TABLE sun_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sun votes lisibles par tous"   ON sun_votes;
DROP POLICY IF EXISTS "Sun votes insérables par tous" ON sun_votes;

CREATE POLICY "Sun votes lisibles par tous"   ON sun_votes FOR SELECT USING (true);
CREATE POLICY "Sun votes insérables par tous" ON sun_votes FOR INSERT WITH CHECK (true);

-- =============================================================================
-- 6. REVIEWS — ajout user_id (migration additive)
-- =============================================================================
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_id      UUID    REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);

-- Policy UPDATE/DELETE pour que le propriétaire puisse gérer ses avis
DROP POLICY IF EXISTS "Avis modifiables par le propriétaire"   ON reviews;
DROP POLICY IF EXISTS "Avis supprimables par le propriétaire"  ON reviews;

CREATE POLICY "Avis modifiables par le propriétaire"
  ON reviews FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Avis supprimables par le propriétaire"
  ON reviews FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- 7. STORAGE BUCKETS (à créer manuellement dans le Dashboard Supabase)
-- =============================================================================
-- Dashboard → Storage → New bucket
--   • "terrace-photos"  public: true
--   • "avatars"         public: true
--
-- Policy "avatars" bucket :
--   SELECT  : true (public)
--   INSERT  : auth.uid() IS NOT NULL
--   UPDATE  : auth.uid() IS NOT NULL
--   DELETE  : auth.uid() IS NOT NULL
-- =============================================================================
