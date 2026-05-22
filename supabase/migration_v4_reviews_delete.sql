-- ─────────────────────────────────────────────────────────────────────────────
-- Migration v4 — Permettre à l'auteur de supprimer son propre avis
-- Exécuter dans Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Permet à l'utilisateur connecté de supprimer ses propres avis
CREATE POLICY "Avis supprimables par l'auteur"
  ON reviews FOR DELETE
  USING (auth.uid() = user_id);
