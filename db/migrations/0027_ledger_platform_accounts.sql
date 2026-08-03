-- C10 certification finding: UNIQUE (kind, business_id, currency) treats NULL
-- business_id as DISTINCT — every platform-level posting (psp_clearing,
-- platform_fees, psp_fee_expense) minted a NEW account row, fragmenting
-- balances across rows (entry sums stayed correct; L3 held per-row; the lie
-- was in reading any single row as "the" balance). Latent since C4.
--
-- Repair: consolidate fragments into the earliest row per (kind, currency),
-- then a partial unique index makes NULL-business accounts truly unique.

WITH canonical AS (
  SELECT DISTINCT ON (kind, currency) id AS keep_id, kind, currency
  FROM ledger_accounts WHERE business_id IS NULL ORDER BY kind, currency, id
),
dupes AS (
  SELECT a.id AS dupe_id, c.keep_id
  FROM ledger_accounts a JOIN canonical c ON c.kind = a.kind AND c.currency = a.currency
  WHERE a.business_id IS NULL AND a.id <> c.keep_id
)
UPDATE ledger_entries e SET account_id = d.keep_id
FROM dupes d WHERE e.account_id = d.dupe_id;

WITH canonical AS (
  SELECT DISTINCT ON (kind, currency) id AS keep_id, kind, currency
  FROM ledger_accounts WHERE business_id IS NULL ORDER BY kind, currency, id
)
DELETE FROM ledger_accounts a
USING canonical c
WHERE a.business_id IS NULL AND a.kind = c.kind AND a.currency = c.currency AND a.id <> c.keep_id;

-- recompute the survivors' cached balances from their (now complete) entries
UPDATE ledger_accounts a
SET balance_minor = COALESCE((SELECT sum(e.delta_minor) FROM ledger_entries e WHERE e.account_id = a.id), 0)
WHERE a.business_id IS NULL;

-- and never again: platform-level accounts are unique per (kind, currency)
CREATE UNIQUE INDEX uq_ledger_accounts_platform ON ledger_accounts (kind, currency)
  WHERE business_id IS NULL;
