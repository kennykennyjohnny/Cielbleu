-- =============================================================
-- Seed CielBleu v2 -- 80 lieux iconiques terrasses Paris
-- Couvre les 20 arrondissements + parcs + péniches
-- Idempotent : ON CONFLICT DO NOTHING sur google_place_id
-- =============================================================

INSERT INTO places (
  google_place_id, name, address, lat, lng, type,
  google_rating, price_level, has_terrace, terrace_probability,
  arrondissement, google_maps_url
) VALUES

-- 1er
('seed_101','Café Marly','93 Rue de Rivoli, 75001 Paris',48.8613,2.3344,'cafe',4.0,4,true,0.99,1,'https://maps.google.com/?q=Cafe+Marly+Paris'),
('seed_102','Le Fumoir','6 Rue de l''Amiral de Coligny, 75001 Paris',48.8608,2.3448,'bar',4.3,3,true,0.90,1,'https://maps.google.com/?q=Le+Fumoir+Paris'),
('seed_103','Café Kitsune Palais Royal','51 Galerie de Montpensier, 75001 Paris',48.8641,2.3370,'cafe',4.4,2,true,0.95,1,'https://maps.google.com/?q=Cafe+Kitsune+Palais+Royal'),
('seed_104','Kong','1 Rue du Pont Neuf, 75001 Paris',48.8596,2.3458,'restaurant',3.9,4,true,0.80,1,'https://maps.google.com/?q=Kong+Paris'),

-- 2e
('seed_201','Experimental Cocktail Club','37 Rue Saint-Sauveur, 75002 Paris',48.8662,2.3527,'bar',4.4,3,true,0.75,2,'https://maps.google.com/?q=Experimental+Cocktail+Club+Paris'),

-- 3e
('seed_301','Le Mary Celeste','1 Rue Commines, 75003 Paris',48.8590,2.3601,'bar',4.4,2,true,0.70,3,'https://maps.google.com/?q=Le+Mary+Celeste+Paris'),
('seed_302','Café des Musées','49 Rue de Turenne, 75003 Paris',48.8589,2.3621,'cafe',4.3,2,true,0.80,3,'https://maps.google.com/?q=Café+des+Musées+Paris'),

-- 4e
('seed_401','La Perle','78 Rue Vieille du Temple, 75004 Paris',48.8602,2.3590,'bar',4.2,2,true,0.90,4,'https://maps.google.com/?q=La+Perle+Paris'),
('seed_402','Le Trésor','7 Rue du Trésor, 75004 Paris',48.8561,2.3548,'bar',4.3,2,true,0.85,4,'https://maps.google.com/?q=Le+Tresor+Paris'),
('seed_403','Café des Phares','7 Place de la Bastille, 75004 Paris',48.8534,2.3691,'cafe',3.9,2,true,0.85,4,'https://maps.google.com/?q=Café+des+Phares+Paris'),
('seed_404','Place des Vosges côté café','6 Place des Vosges, 75004 Paris',48.8543,2.3664,'cafe',4.5,3,true,0.99,4,'https://maps.google.com/?q=Place+des+Vosges+Paris'),

-- 5e
('seed_501','Café de la Nouvelle Mairie','19 Rue des Fossés Saint-Jacques, 75005 Paris',48.8479,2.3474,'cafe',4.5,2,true,0.95,5,'https://maps.google.com/?q=Café+Nouvelle+Mairie+Paris'),
('seed_502','La Bûcherie','41 Rue de la Bûcherie, 75005 Paris',48.8521,2.3479,'restaurant',4.1,3,true,0.90,5,'https://maps.google.com/?q=La+Bucherie+Paris'),

-- 6e
('seed_601','Le Comptoir du Relais','9 Carrefour de l''Odéon, 75006 Paris',48.8526,2.3384,'restaurant',4.3,3,true,0.95,6,'https://maps.google.com/?q=Le+Comptoir+du+Relais+Paris'),
('seed_602','Café de Flore','172 Boulevard Saint-Germain, 75006 Paris',48.8539,2.3330,'cafe',4.1,3,true,0.99,6,'https://maps.google.com/?q=Café+de+Flore+Paris'),
('seed_603','Les Deux Magots','6 Place Saint-Germain des Prés, 75006 Paris',48.8540,2.3333,'cafe',4.0,4,true,0.99,6,'https://maps.google.com/?q=Les+Deux+Magots+Paris'),
('seed_604','Brasserie Lipp','151 Boulevard Saint-Germain, 75006 Paris',48.8533,2.3335,'restaurant',4.1,4,true,0.90,6,'https://maps.google.com/?q=Brasserie+Lipp+Paris'),
('seed_605','Café de la Mairie','8 Place Saint-Sulpice, 75006 Paris',48.8513,2.3326,'cafe',4.0,2,true,0.95,6,'https://maps.google.com/?q=Café+de+la+Mairie+Saint-Sulpice'),

-- 7e
('seed_701','Rosa Bonheur sur Seine','Port des Invalides, 75007 Paris',48.8618,2.3118,'bar',4.2,2,true,0.95,7,'https://maps.google.com/?q=Rosa+Bonheur+sur+Seine+Paris'),
('seed_702','Café du Marché','38 Rue Cler, 75007 Paris',48.8568,2.3034,'cafe',4.0,2,true,0.90,7,'https://maps.google.com/?q=Café+du+Marché+Rue+Cler+Paris'),
('seed_703','Café Constant','139 Rue Saint-Dominique, 75007 Paris',48.8573,2.3018,'cafe',4.3,2,true,0.85,7,'https://maps.google.com/?q=Café+Constant+Paris'),

-- 8e
('seed_801','Le Fouquets','99 Avenue des Champs-Élysées, 75008 Paris',48.8737,2.3020,'restaurant',3.8,4,true,0.99,8,'https://maps.google.com/?q=Le+Fouquets+Paris'),
('seed_802','Hôtel Costes','239 Rue Saint-Honoré, 75001 Paris',48.8668,2.3311,'restaurant',3.9,4,true,0.95,1,'https://maps.google.com/?q=Hotel+Costes+Paris'),
('seed_803','Laurent Paris','41 Avenue Gabriel, 75008 Paris',48.8684,2.3134,'restaurant',4.4,4,true,0.99,8,'https://maps.google.com/?q=Restaurant+Laurent+Paris'),

-- 9e
('seed_901','Café de la Paix','5 Place de l''Opéra, 75009 Paris',48.8707,2.3316,'cafe',4.2,4,true,0.85,9,'https://maps.google.com/?q=Café+de+la+Paix+Paris'),
('seed_902','Glass Paris','7 Rue Frochot, 75009 Paris',48.8804,2.3393,'bar',4.1,2,true,0.70,9,'https://maps.google.com/?q=Glass+Paris'),
('seed_903','Le Pigalle','9 Rue Frochot, 75009 Paris',48.8802,2.3386,'bar',4.2,3,true,0.75,9,'https://maps.google.com/?q=Le+Pigalle+Hotel+Paris'),
('seed_904','Hotel Amour Terrace','8 Rue de Navarin, 75009 Paris',48.8798,2.3375,'bar',4.3,3,true,0.90,9,'https://maps.google.com/?q=Hotel+Amour+Paris'),

-- 10e
('seed_1001','Chez Prune','71 Quai de Valmy, 75010 Paris',48.8731,2.3667,'cafe',4.1,2,true,0.95,10,'https://maps.google.com/?q=Chez+Prune+Paris'),
('seed_1002','Hôtel du Nord','102 Quai de Jemmapes, 75010 Paris',48.8726,2.3659,'restaurant',4.1,2,true,0.90,10,'https://maps.google.com/?q=Hotel+du+Nord+Paris'),
('seed_1003','Le Petit Cambodge','20 Rue Alibert, 75010 Paris',48.8704,2.3680,'restaurant',4.4,2,true,0.80,10,'https://maps.google.com/?q=Le+Petit+Cambodge+Paris'),
('seed_1004','Ten Belles','10 Rue de la Grange aux Belles, 75010 Paris',48.8717,2.3669,'cafe',4.5,1,true,0.70,10,'https://maps.google.com/?q=Ten+Belles+Paris'),

-- 11e
('seed_1101','Le Pure Café','14 Rue Jean Macé, 75011 Paris',48.8538,2.3832,'cafe',4.0,2,true,0.80,11,'https://maps.google.com/?q=Le+Pure+Café+Paris'),
('seed_1102','Bambino','19 Rue Oberkampf, 75011 Paris',48.8644,2.3739,'bar',4.5,1,true,0.70,11,'https://maps.google.com/?q=Bambino+Paris'),
('seed_1103','Le Perchoir','14 Rue Crespin du Gast, 75011 Paris',48.8641,2.3810,'bar',4.3,2,true,0.90,11,'https://maps.google.com/?q=Le+Perchoir+Paris'),
('seed_1104','Septime','80 Rue de Charonne, 75011 Paris',48.8522,2.3796,'restaurant',4.8,3,true,0.75,11,'https://maps.google.com/?q=Septime+Paris'),
('seed_1105','Café Charbon','109 Rue Oberkampf, 75011 Paris',48.8658,2.3778,'bar',4.2,2,true,0.80,11,'https://maps.google.com/?q=Café+Charbon+Paris'),
('seed_1106','Aux Deux Amis','45 Rue Oberkampf, 75011 Paris',48.8638,2.3744,'bar',4.5,2,true,0.85,11,'https://maps.google.com/?q=Aux+Deux+Amis+Paris'),

-- 12e
('seed_1201','Le Baron Rouge','1 Rue Théophile Roussel, 75012 Paris',48.8495,2.3784,'bar',4.4,1,true,0.85,12,'https://maps.google.com/?q=Le+Baron+Rouge+Paris'),
('seed_1202','Bofinger','5 Rue de la Bastille, 75004 Paris',48.8530,2.3685,'restaurant',4.1,3,true,0.90,4,'https://maps.google.com/?q=Bofinger+Paris'),

-- 13e
('seed_1301','Le Merle Moqueur','11 Rue de la Butte aux Cailles, 75013 Paris',48.8275,2.3508,'bar',4.3,1,true,0.90,13,'https://maps.google.com/?q=Le+Merle+Moqueur+Paris'),
('seed_1302','Le Petit Bain','Port de la Gare, 75013 Paris',48.8318,2.3733,'bar',4.2,2,true,0.95,13,'https://maps.google.com/?q=Le+Petit+Bain+Paris'),
('seed_1303','Les Cailloux','58 Rue des Cinq Diamants, 75013 Paris',48.8282,2.3513,'restaurant',4.2,2,true,0.85,13,'https://maps.google.com/?q=Les+Cailloux+Paris'),

-- 14e
('seed_1401','La Coupole','102 Boulevard du Montparnasse, 75014 Paris',48.8432,2.3265,'restaurant',4.0,3,true,0.90,14,'https://maps.google.com/?q=La+Coupole+Paris'),
('seed_1402','Le Dôme','108 Boulevard du Montparnasse, 75014 Paris',48.8429,2.3263,'restaurant',4.2,4,true,0.95,14,'https://maps.google.com/?q=Le+Dome+Paris'),
('seed_1403','Le Select','99 Boulevard du Montparnasse, 75006 Paris',48.8434,2.3271,'cafe',4.1,3,true,0.90,6,'https://maps.google.com/?q=Le+Select+Montparnasse'),

-- 15e
('seed_1501','Le Beurre Noisette','68 Rue Vasco de Gama, 75015 Paris',48.8436,2.2940,'restaurant',4.6,2,true,0.75,15,'https://maps.google.com/?q=Le+Beurre+Noisette+Paris'),

-- 16e
('seed_1601','Le Frank Fondation Vuitton','Fondation Louis Vuitton, 75016 Paris',48.8784,2.2664,'restaurant',4.3,4,true,0.98,16,'https://maps.google.com/?q=Le+Frank+Fondation+Vuitton'),
('seed_1602','Café du Trocadéro','26 Place du Trocadéro, 75016 Paris',48.8636,2.2888,'cafe',3.8,3,true,0.95,16,'https://maps.google.com/?q=Trocadero+Paris+café'),

-- 17e
('seed_1701','Café Pleyel','252 Rue du Faubourg Saint-Honoré, 75008 Paris',48.8800,2.3102,'cafe',4.2,3,true,0.75,8,'https://maps.google.com/?q=Salle+Pleyel+café+Paris'),

-- 18e
('seed_1801','Hardware Société','10 Rue Lamarck, 75018 Paris',48.8870,2.3411,'cafe',4.3,2,true,0.75,18,'https://maps.google.com/?q=Hardware+Société+Paris'),
('seed_1802','Le Très Particulier','23 Avenue Junot, 75018 Paris',48.8875,2.3351,'bar',4.4,3,true,0.95,18,'https://maps.google.com/?q=Hotel+Particulier+Montmartre+Paris'),
('seed_1803','La Fourmi','74 Rue des Martyrs, 75018 Paris',48.8832,2.3416,'bar',4.1,1,true,0.85,18,'https://maps.google.com/?q=La+Fourmi+Paris'),
('seed_1804','Terrass Hotel Rooftop','12 Rue Joseph de Maistre, 75018 Paris',48.8845,2.3338,'bar',4.4,3,true,0.98,18,'https://maps.google.com/?q=Terrass+Hotel+Paris'),

-- 19e
('seed_1901','Rosa Bonheur Buttes-Chaumont','2 Allée de la Cascade, 75019 Paris',48.8786,2.3852,'bar',4.2,2,true,0.98,19,'https://maps.google.com/?q=Rosa+Bonheur+Buttes-Chaumont'),
('seed_1902','Pavillon des Canaux','39 Quai de la Loire, 75019 Paris',48.8873,2.3746,'cafe',4.4,2,true,0.90,19,'https://maps.google.com/?q=Pavillon+des+Canaux+Paris'),
('seed_1903','Les Grandes Tables du 104','5 Rue Curial, 75019 Paris',48.8861,2.3711,'restaurant',4.2,2,true,0.85,19,'https://maps.google.com/?q=Les+Grandes+Tables+104+Paris'),

-- 20e
('seed_2001','La Bellevilloise','19-21 Rue Boyer, 75020 Paris',48.8689,2.3908,'bar',4.2,2,true,0.95,20,'https://maps.google.com/?q=La+Bellevilloise+Paris'),
('seed_2002','Mama Shelter Rooftop','109 Rue de Bagnolet, 75020 Paris',48.8674,2.4027,'bar',4.3,2,true,0.90,20,'https://maps.google.com/?q=Mama+Shelter+Paris'),

-- Parcs
('seed_p01','Square du Vert-Galant','Île de la Cité, 75001 Paris',48.8567,2.3414,'park',4.6,0,true,1.00,1,'https://maps.google.com/?q=Square+du+Vert-Galant+Paris'),
('seed_p02','Jardin du Palais-Royal','Place du Palais Royal, 75001 Paris',48.8641,2.3370,'park',4.7,0,true,1.00,1,'https://maps.google.com/?q=Jardin+Palais-Royal+Paris'),
('seed_p03','Jardin du Luxembourg','75006 Paris',48.8465,2.3373,'park',4.7,0,true,1.00,6,'https://maps.google.com/?q=Jardin+du+Luxembourg+Paris'),
('seed_p04','Jardin des Tuileries','Terrasse du Bord de l''eau, 75001 Paris',48.8620,2.3268,'park',4.6,0,true,1.00,1,'https://maps.google.com/?q=Jardin+des+Tuileries+Paris'),
('seed_p05','Parc Monceau','35 Boulevard de Courcelles, 75008 Paris',48.8796,2.3096,'park',4.6,0,true,1.00,8,'https://maps.google.com/?q=Parc+Monceau+Paris'),
('seed_p06','Parc des Buttes-Chaumont','1 Rue Botzaris, 75019 Paris',48.8809,2.3826,'park',4.6,0,true,1.00,19,'https://maps.google.com/?q=Parc+Buttes-Chaumont+Paris'),
('seed_p07','Parc Montsouris','2 Rue Gazan, 75014 Paris',48.8213,2.3377,'park',4.5,0,true,1.00,14,'https://maps.google.com/?q=Parc+Montsouris+Paris'),
('seed_p08','Promenade Plantée','1 Avenue Daumesnil, 75012 Paris',48.8487,2.3706,'park',4.5,0,true,0.90,12,'https://maps.google.com/?q=Promenade+Plantée+Paris')

ON CONFLICT (google_place_id) DO NOTHING;

-- =============================================================
-- Scores soleil réalistes — tous les lieux seed, tous les mois
-- varies selon type de lieu, mois, heure
-- =============================================================
INSERT INTO sun_scores (place_id, month, time_slot, score)
SELECT
  p.id,
  m.month,
  to_char(make_time(h, mi, 0), 'HH24:MI') AS time_slot,
  CASE
    WHEN h < 7  OR h >= 22 THEN 0
    WHEN h = 7  OR h = 21  THEN 1
    WHEN m.month IN (11,12,1,2) AND (h < 10 OR h >= 18) THEN 1
    WHEN m.month IN (3,10)      AND (h < 9  OR h >= 19) THEN 1
    WHEN p.type = 'park' AND h BETWEEN 9 AND 18 THEN
      CASE WHEN m.month IN (5,6,7,8) THEN 5
           WHEN m.month IN (4,9)     THEN 4
           ELSE 3 END
    WHEN m.month IN (5,6,7,8) AND h BETWEEN 11 AND 17 THEN
      CASE
        WHEN p.terrace_probability >= 0.95 THEN 5
        WHEN p.terrace_probability >= 0.80 THEN 4
        WHEN p.terrace_probability >= 0.70 THEN 4
        ELSE 3
      END
    WHEN m.month IN (3,4,9,10) AND h BETWEEN 11 AND 16 THEN
      CASE
        WHEN p.terrace_probability >= 0.90 THEN 4
        WHEN p.terrace_probability >= 0.75 THEN 3
        ELSE 2
      END
    WHEN m.month IN (11,12,1,2) AND h BETWEEN 12 AND 14 THEN 2
    ELSE 2
  END AS score
FROM places p
CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12)) AS m(month)
CROSS JOIN generate_series(0, 23) AS h
CROSS JOIN (VALUES (0),(30)) AS mi(mi)
WHERE p.google_place_id LIKE 'seed_%'
ON CONFLICT (place_id, month, time_slot) DO NOTHING;