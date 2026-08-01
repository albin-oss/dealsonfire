-- C10 Slice 2 — Payment Element client confirmation. The intent's birth in
-- requires_action (created at checkout, confirmed by the BUYER's browser) is a
-- state change and P3 demands its fact: 'created'.
ALTER TABLE payment_facts DROP CONSTRAINT payment_facts_kind_check;
ALTER TABLE payment_facts ADD CONSTRAINT payment_facts_kind_check
  CHECK (kind IN ('created','authorized','declined','captured','voided','refunded','webhook'));
