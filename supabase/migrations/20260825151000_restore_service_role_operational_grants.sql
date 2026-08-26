begin;

-- Tables added after the base-schema grant must remain available to trusted
-- administrative jobs, Edge Functions and QA cleanup using service_role.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

commit;
