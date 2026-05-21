-- Migration v3 : Avis sur fontaines & sanisettes
-- Rend place_id nullable et ajoute une clé texte pour les aménités (fontaines, sanisettes)

ALTER TABLE reviews ALTER COLUMN place_id DROP NOT NULL;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS amenite_key text;

CREATE INDEX IF NOT EXISTS idx_reviews_amenite_key ON reviews(amenite_key);
