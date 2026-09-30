-- How a mosaic's tile names map onto the grid.
--
-- There is no single convention in the collection: bigbufo is named
-- row-then-column, while bufo-blank-stare is column-then-row. Assembling with
-- the wrong one transposes the picture, so the orientation is recorded per
-- mosaic. Anything absent from this table is treated as row-col.
CREATE TABLE mosaic_layouts (
  base        TEXT PRIMARY KEY,
  orientation TEXT NOT NULL CHECK (orientation IN ('row-col', 'col-row')),
  updated_at  INTEGER NOT NULL
);
