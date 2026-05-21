-- ─────────────────────────────────────────────────────────────────────────────
-- Migration v2 — social features : profiles, favorites, friendships, sun_votes
-- Exécuter dans Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Profiles (liés à auth.users, créés automatiquement à l'inscription)
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT        UNIQUE,
  display_name  TEXT,
  avatar_url    TEXT,
  bio           TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- 2. Favoris
CREATE TABLE IF NOT EXISTS favorites (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id   UUID        NOT NULL REFERENCES places(id)    ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, place_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user    ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_place   ON favorites(place_id);

-- 3. Amitiés
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

-- 4. Votes soleil (remplace sun_confirmations, user_id optionnel)
--    device_id est obligatoire pour les votes anonymes (déduplication côté client)
CREATE TABLE IF NOT EXISTS sun_votes (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  place_id   UUID        NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  device_id  TEXT        NOT NULL,
  is_sunny   BOOLEAN     NOT NULL,
  time_slot  TEXT,                 -- "14:00" — créneau horaire du vote
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sun_votes_place ON sun_votes(place_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sun_votes_user  ON sun_votes(user_id);

-- 5. Enrichir reviews avec user_id optionnel
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_id      UUID    REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT TRUE;

-- 6. Trigger : créer un profile automatiquement lors de l'inscription
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
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
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

-- 7. RLS sur les nouvelles tables
ALTER TABLE profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites   ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE sun_votes   ENABLE ROW LEVEL SECURITY;

-- Profiles : lecture publique, écriture réservée au propriétaire
CREATE POLICY "Profiles lisibles par tous"          ON profiles FOR SELECT USING (true);
CREATE POLICY "Profile modifiable par le propriétaire"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Favorites : visible par le propriétaire uniquement
CREATE POLICY "Favoris visibles par le propriétaire"
  ON favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Favoris insérables par le propriétaire"
  ON favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Favoris supprimables par le propriétaire"
  ON favorites FOR DELETE USING (auth.uid() = user_id);

-- Friendships : visible par les deux parties
CREATE POLICY "Amitiés visibles par les parties"
  ON friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
CREATE POLICY "Demande d'amitié insérables par le demandeur"
  ON friendships FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Amitié modifiable par l'une ou l'autre partie"
  ON friendships FOR UPDATE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Sun votes : lecture publique, insertion libre (anonymous + logged-in)
CREATE POLICY "Sun votes lisibles par tous"    ON sun_votes FOR SELECT USING (true);
CREATE POLICY "Sun votes insérables par tous"  ON sun_votes FOR INSERT WITH CHECK (true);
