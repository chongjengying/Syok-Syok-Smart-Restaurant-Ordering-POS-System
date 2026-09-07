begin;

-- Keep the current dashboard contract, which includes payment-provider
-- filtering. The older overload makes PostgREST reject otherwise valid calls
-- as ambiguous (PGRST203).
drop function if exists public.get_admin_dashboard(date, date, text, text, uuid, uuid, text);

commit;
