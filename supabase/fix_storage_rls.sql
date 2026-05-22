-- =============================================================================
-- Fix: RLS manquantes — profiles (UPDATE) + Storage bucket avatars
-- À coller et exécuter dans Supabase Dashboard → SQL Editor
-- =============================================================================

-- 1. Profiles : permettre à chaque utilisateur de mettre à jour sa propre ligne
--    (nécessaire pour mettre à jour avatar_url, display_name, username…)

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profils lisibles par tous"   ON profiles;
DROP POLICY IF EXISTS "Profil : lecture publique"   ON profiles;
DROP POLICY IF EXISTS "Profil : modifier le sien"   ON profiles;
DROP POLICY IF EXISTS "Profil : créer le sien"      ON profiles;

CREATE POLICY "Profil : lecture publique"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Profil : modifier le sien"
  ON profiles FOR UPDATE
  USING      (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Profil : créer le sien"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);


-- 2. Storage bucket "avatars" — politiques sur storage.objects
--    Chaque utilisateur peut uploader/modifier uniquement dans son propre dossier
--    (chemin attendu : {user_id}/avatar.jpg)

-- Lecture publique (les avatars sont visibles par tous)
DROP POLICY IF EXISTS "Avatars : lecture publique"       ON storage.objects;
DROP POLICY IF EXISTS "Avatars : upload utilisateur"     ON storage.objects;
DROP POLICY IF EXISTS "Avatars : modifier utilisateur"   ON storage.objects;
DROP POLICY IF EXISTS "Avatars : supprimer utilisateur"  ON storage.objects;

CREATE POLICY "Avatars : lecture publique"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Avatars : upload utilisateur"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Avatars : modifier utilisateur"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Avatars : supprimer utilisateur"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- 3. Storage bucket "review-photos" — photos jointes aux avis utilisateurs
--    À créer d'abord dans Dashboard → Storage → New bucket → "review-photos", public: true

DROP POLICY IF EXISTS "Review photos : lecture publique"      ON storage.objects;
DROP POLICY IF EXISTS "Review photos : upload utilisateur"    ON storage.objects;
DROP POLICY IF EXISTS "Review photos : supprimer utilisateur" ON storage.objects;

CREATE POLICY "Review photos : lecture publique"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'review-photos');

CREATE POLICY "Review photos : upload utilisateur"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'review-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Review photos : supprimer utilisateur"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'review-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
