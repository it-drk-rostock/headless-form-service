-- The audit log's identity sequence got Supabase's default grants on new
-- sequences in `public`, which include anon. The anon role has no access to
-- anything of ours (ADR-0004), and nobody else needs the sequence either:
-- entries are written only by private.record_audit(), as the table owner.
revoke all on sequence public.audit_log_id_seq from anon, authenticated, service_role;
