-- Migration : coordonnées terrasse (open data Paris)
-- Ajoute les colonnes pour stocker la position exacte de la terrasse autorisée,
-- distincte du centroïde Google Places (souvent l'entrée du bâtiment).

ALTER TABLE places
  ADD COLUMN IF NOT EXISTS terrace_lat      FLOAT,
  ADD COLUMN IF NOT EXISTS terrace_lng      FLOAT,
  ADD COLUMN IF NOT EXISTS terrace_longueur FLOAT,
  ADD COLUMN IF NOT EXISTS terrace_largeur  FLOAT;

-- Index pour pouvoir filtrer/trier par présence de coordonnées terrasse
CREATE INDEX IF NOT EXISTS places_terrace_coords_idx
  ON places (terrace_lat, terrace_lng)
  WHERE terrace_lat IS NOT NULL;
