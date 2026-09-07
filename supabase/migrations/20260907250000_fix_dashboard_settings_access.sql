begin;

-- The dashboard RPC is SECURITY INVOKER so branch-scoped tables continue to
-- obey RLS. It still reads these two non-secret operational values, therefore
-- expose only those rows to authenticated dashboard viewers.
grant select on public.pos_settings to authenticated;
drop policy if exists dashboard_read_operational_settings on public.pos_settings;
create policy dashboard_read_operational_settings
  on public.pos_settings for select to authenticated
  using (
    key in ('business.name', 'dashboard.delayed_order_minutes')
    and public.has_pos_permission('dashboard.view')
  );

commit;
