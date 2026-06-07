-- Orientation de la terrasse : bearing (deg, 0=N) de la façade la plus proche.
-- Précalculé offline depuis volumesbatisparis.geojson → alignement réaliste
-- sans coût client. La terrasse court PARALLÈLEMENT à cette façade.

ALTER TABLE places
  ADD COLUMN IF NOT EXISTS terrace_bearing FLOAT;
