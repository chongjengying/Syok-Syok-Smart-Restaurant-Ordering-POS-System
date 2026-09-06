begin;
drop function if exists public.assign_user_branch(uuid,uuid);
grant execute on function public.assign_user_branch(uuid,uuid,boolean) to authenticated;
commit;
