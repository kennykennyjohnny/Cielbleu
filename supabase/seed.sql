-- Seed CielBleu : 10 lieux iconiques de Paris pour tester la carte
-- Exécuter dans le SQL Editor Supabase APRES schema.sql
-- Idempotent : ON CONFLICT pour pouvoir relancer

INSERT INTO places (google_place_id, name, address, lat, lng, type, google_rating, price_level, has_terrace, terrace_probability, arrondissement) VALUES
  ('seed_001', 'Le Comptoir du Relais', '9 Carrefour de l''Odéon, 75006 Paris', 48.8526, 2.3384, 'restaurant', 4.3, 3, true, 0.95, 6),
  ('seed_002', 'Café de Flore', '172 Boulevard Saint-Germain, 75006 Paris', 48.8539, 2.3330, 'cafe', 4.1, 3, true, 0.99, 6),
  ('seed_003', 'Le Baron Rouge', '1 Rue Théophile Roussel, 75012 Paris', 48.8495, 2.3784, 'bar', 4.4, 1, true, 0.85, 12),
  ('seed_004', 'Rosa Bonheur sur Seine', 'Port des Invalides, 75007 Paris', 48.8618, 2.3118, 'bar', 4.2, 2, true, 0.95, 7),
  ('seed_005', 'Le Pure Café', '14 Rue Jean Macé, 75011 Paris', 48.8538, 2.3832, 'cafe', 4.0, 2, true, 0.80, 11),
  ('seed_006', 'Bambino', '19 Rue Oberkampf, 75011 Paris', 48.8644, 2.3739, 'bar', 4.5, 1, true, 0.70, 11),
  ('seed_007', 'Le Perchoir', '14 Rue Crespin du Gast, 75011 Paris', 48.8641, 2.3810, 'bar', 4.3, 2, true, 0.90, 11),
  ('seed_008', 'Les Deux Magots', '6 Place Saint-Germain des Prés, 75006 Paris', 48.8540, 2.3333, 'cafe', 4.0, 4, true, 0.99, 6),
  ('seed_009', 'Café de la Paix', '5 Place de l''Opéra, 75009 Paris', 48.8707, 2.3316, 'cafe', 4.2, 4, true, 0.85, 9),
  ('seed_010', 'Le Mary Celeste', '1 Rue Commines, 75003 Paris', 48.8588, 2.3601, 'bar', 4.4, 2, true, 0.65, 3),
  ('seed_011', 'Square du Vert-Galant', 'Pl. du Pont Neuf, 75001 Paris', 48.8567, 2.3414, 'park', 4.6, 0, true, 1.00, 1),
  ('seed_012', 'Parc des Buttes-Chaumont', '1 Rue Botzaris, 75019 Paris', 48.8809, 2.3826, 'park', 4.6, 0, true, 1.00, 19),
  ('seed_013', 'Hardware Société', '10 Rue Lamarck, 75018 Paris', 48.8870, 2.3411, 'cafe', 4.3, 2, true, 0.75, 18),
  ('seed_014', 'Le Petit Cambodge', '20 Rue Alibert, 75010 Paris', 48.8704, 2.3680, 'restaurant', 4.4, 2, true, 0.80, 10),
  ('seed_015', 'Caffè Stern', '47 Passage des Panoramas, 75002 Paris', 48.8714, 2.3422, 'cafe', 4.5, 3, false, 0.10, 2)
ON CONFLICT (google_place_id) DO NOTHING;

-- Score soleil de fallback : 3 (mi-soleil) pour le mois courant, tous créneaux 30min
-- Permet à la carte d'afficher des pins même sans précalcul SunCalc
INSERT INTO sun_scores (place_id, month, time_slot, score)
SELECT
  p.id,
  EXTRACT(MONTH FROM NOW())::int AS month,
  to_char(make_time(h, m, 0), 'HH24:MI') AS time_slot,
  CASE
    WHEN h < 7 OR h >= 22 THEN 0      -- nuit
    WHEN h < 10 OR h >= 19 THEN 2     -- aube/crépuscule
    WHEN h BETWEEN 12 AND 16 THEN 4   -- pic d'ensoleillement
    ELSE 3
  END AS score
FROM places p
CROSS JOIN generate_series(0, 23) AS h
CROSS JOIN (VALUES (0), (30)) AS t(m)
WHERE p.google_place_id LIKE 'seed_%'
ON CONFLICT (place_id, month, time_slot) DO NOTHING;
