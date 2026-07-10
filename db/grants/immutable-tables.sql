-- ADR-004 C4 (rules 6/15): append-only tables are immutable at the GRANT level, not by
-- convention. The application role may INSERT and SELECT; UPDATE/DELETE/TRUNCATE are revoked.
-- {{APP_ROLE}} is substituted by db/apply-grants.ts.
--
-- IMPORTANT (D-21): grant-level immutability requires the application to connect as a role
-- that does NOT own these tables. Migrations run as the owner role; the app runs as
-- {{APP_ROLE}}. An owner or superuser connection bypasses these protections by definition.

GRANT USAGE ON SCHEMA public TO {{APP_ROLE}};

GRANT SELECT, INSERT ON audit_logs, domain_events, commerce_audit_logs, commerce_domain_events, operations_audit_logs, operations_domain_events, identity_audit_logs, identity_domain_events TO {{APP_ROLE}};
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs, domain_events, commerce_audit_logs, commerce_domain_events, operations_audit_logs, operations_domain_events, identity_audit_logs, identity_domain_events FROM {{APP_ROLE}};

-- audit_logs partitions: direct partition access must carry the same protections.
DO $$
DECLARE part regclass;
BEGIN
  FOR part IN SELECT inhrelid::regclass FROM pg_inherits
    WHERE inhparent IN ('audit_logs'::regclass, 'commerce_audit_logs'::regclass, 'operations_audit_logs'::regclass, 'identity_audit_logs'::regclass)
  LOOP
    EXECUTE format('GRANT SELECT, INSERT ON %s TO {{APP_ROLE}}', part);
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %s FROM {{APP_ROLE}}', part);
  END LOOP;
END $$;
