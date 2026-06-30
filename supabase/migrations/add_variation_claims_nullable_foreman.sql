-- Management lump-sum lines may be unassigned (any foreman on site can claim).

ALTER TABLE variation_claims
  ALTER COLUMN foreman_id DROP NOT NULL;
