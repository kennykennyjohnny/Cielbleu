-- ─────────────────────────────────────────────────────────────────────────────
-- migration_v5_performance.sql
-- Optimise le chargement initial de la carte :
--  1. Fonction get_map_places → 1 seul appel SQL au lieu de 3 aller-retours
--  2. Index composites pour accélérer la jointure places ↔ sun_scores
-- À exécuter dans Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Fonction de chargement carte ──────────────────────────────────────────
-- Retourne toutes les places avec leur score soleil en une seule requête.
-- Colonnes slim : pas de photos, pas d'opening_hours, pas d'instagram_url.
-- (Ces données lourdes sont chargées à la demande au clic sur un lieu.)

CREATE OR REPLACE FUNCTION get_map_places(p_month int, p_slot text)
RETURNS TABLE (
  id              uuid,
  name            text,
  address         text,
  lat             float,
  lng             float,
  type            text,
  arrondissement  integer,
  has_terrace     boolean,
  google_rating   float,
  price_level     integer,
  google_place_id text,
  current_score   integer
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    p.id,
    p.name,
    p.address,
    p.lat,
    p.lng,
    p.type,
    p.arrondissement,
    p.has_terrace,
    p.google_rating,
    p.price_level,
    p.google_place_id,
    COALESCE(s.score, 3)::integer AS current_score
  FROM places p
  LEFT JOIN sun_scores s
    ON  s.place_id  = p.id
    AND s.month     = p_month
    AND s.time_slot = p_slot
  WHERE p.lat IS NOT NULL
    AND p.lng IS NOT NULL
$$;

-- Accès pour les utilisateurs anonymes et connectés
GRANT EXECUTE ON FUNCTION get_map_places(int, text) TO anon, authenticated;

-- ── 2. Index pour la jointure places ↔ sun_scores ────────────────────────────
-- L'index INCLUDE(score) évite un second accès heap pour récupérer le score.

CREATE INDEX IF NOT EXISTS idx_sun_scores_lookup
  ON sun_scores(month, time_slot, place_id) INCLUDE (score);

-- ── 3. Index partiel sur places (coordonnées non nulles) ─────────────────────
-- Accélère le WHERE lat IS NOT NULL AND lng IS NOT NULL

CREATE INDEX IF NOT EXISTS idx_places_coords
  ON places(id)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- ── Résumé ────────────────────────────────────────────────────────────────────
-- Avant : 3 aller-retours réseau (2× paginate places + 1× scores) ≈ 8-12 s
-- Après : 1 appel RPC via /api/places + cache CDN 30 s               ≈ <1 s
