-- =============================================================================
-- Fix: supprime la dépendance à unaccent() dans generate_username_if_null
-- + force le bypass RLS sur handle_new_user
-- À coller et exécuter dans Supabase Dashboard → SQL Editor
-- =============================================================================

-- 1. Recréer generate_username_if_null sans unaccent()
CREATE OR REPLACE FUNCTION generate_username_if_null()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  counter   INT := 0;
BEGIN
  -- Rien à faire si username déjà défini
  IF NEW.username IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Slug depuis display_name : on passe en minuscules et on enlève tout ce
  -- qui n'est pas une lettre ASCII ou un chiffre (accent, espace, tiret…)
  base_slug := lower(
    regexp_replace(
      COALESCE(NEW.display_name, 'user'),
      '[^a-zA-Z0-9]', '', 'g'
    )
  );

  -- Slug trop court → préfixe user + début de l'UUID
  IF length(base_slug) < 2 THEN
    base_slug := 'user' || substring(NEW.id::text, 1, 6);
  END IF;

  -- Déduplication : ajoute un compteur si le slug est déjà pris
  candidate := base_slug;
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM profiles WHERE username = candidate AND id != NEW.id
    );
    counter   := counter + 1;
    candidate := base_slug || counter::text;
    EXIT WHEN counter > 999;
  END LOOP;

  NEW.username := CASE
    WHEN counter > 999 THEN 'user' || substring(NEW.id::text, 1, 8)
    ELSE candidate
  END;

  RETURN NEW;
END;
$$;

-- 2. S'assurer que handle_new_user contourne bien le RLS
--    (SECURITY DEFINER + SET row_security = off)
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

-- Réassigner le trigger (au cas où)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
