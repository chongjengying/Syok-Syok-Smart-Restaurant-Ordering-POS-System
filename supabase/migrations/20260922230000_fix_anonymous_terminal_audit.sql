begin;

do $body$
declare definition text;
begin
  select pg_get_functiondef('public.attribute_pos_audit()'::regprocedure) into definition;
  definition := replace(
    definition,
    'new.actor_auth_user_id:=coalesce(s.actor_auth_user_id,auth.uid(),new.actor_id); new.actor_staff_id:=coalesce(s.staff_id,new.actor_staff_id);',
    'new.actor_id:=coalesce((select p.id from public.profiles p where p.id=auth.uid()),(select p.id from public.profiles p where p.id=new.actor_id)); new.actor_auth_user_id:=coalesce(s.actor_auth_user_id,(select p.id from public.profiles p where p.id=auth.uid()),(select p.id from public.profiles p where p.id=new.actor_id)); new.actor_staff_id:=coalesce(s.staff_id,new.actor_staff_id);'
  );
  execute definition;
end $body$;

commit;
