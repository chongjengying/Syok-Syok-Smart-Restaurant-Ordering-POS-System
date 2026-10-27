begin;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.code='payment.view'
where r.name='MANAGER' and r.is_builtin
  and p.scope='COMPANY_ASSIGNABLE' and p.is_active
on conflict do nothing;

commit;
