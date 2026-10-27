begin;
do $patch$ declare d text; signature text; begin
 foreach signature in array array['public.set_role_permissions(uuid,text[])','public.set_system_template_permissions(uuid,text[])'] loop
  select pg_get_functiondef(signature::regprocedure) into d;
  d:=replace(d,'unnest(normalized) code left join public.permissions p on p.code=code',
   'unnest(normalized) requested(permission_code) left join public.permissions p on p.code=requested.permission_code');
  d:=replace(d,'unnest(next_codes) code left join public.permissions p on p.code=code',
   'unnest(next_codes) requested(permission_code) left join public.permissions p on p.code=requested.permission_code');
  execute d;
 end loop;
end $patch$;
commit;
