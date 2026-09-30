-- Mosaics: one picture sliced into a grid of tiles that reassemble when pasted
-- together. Tiles are submitted and approved as a set, so they need to know
-- which set they belong to and where they sit in it.

ALTER TABLE bufos ADD COLUMN mosaic_id TEXT;
ALTER TABLE bufos ADD COLUMN mosaic_rows INTEGER;
ALTER TABLE bufos ADD COLUMN mosaic_cols INTEGER;
ALTER TABLE bufos ADD COLUMN mosaic_row INTEGER;
ALTER TABLE bufos ADD COLUMN mosaic_col INTEGER;

CREATE INDEX bufos_mosaic ON bufos (mosaic_id, mosaic_row, mosaic_col);

-- A mosaic legitimately repeats tiles: the empty corners of a picture are
-- byte-identical, and the original bigbufo has several. A global uniqueness
-- rule on the content hash would reject the second one and leave a hole in the
-- grid, so de-duplication now applies only to standalone bufos.
DROP INDEX bufos_sha256_unique;
CREATE UNIQUE INDEX bufos_sha256_unique ON bufos (sha256) WHERE mosaic_id IS NULL;
