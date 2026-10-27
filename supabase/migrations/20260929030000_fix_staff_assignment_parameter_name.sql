begin;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.admin_update_staff_record(uuid,text,text,uuid,boolean,uuid[])'::regprocedure) into definition;
  definition:=replace(definition,'branch_id uuid; staff_profile_id','assignment_branch_id uuid; staff_profile_id');
  definition:=replace(definition,'foreach branch_id in array','foreach assignment_branch_id in array');
  definition:=replace(definition,'if branch_id=p_branch_id','if assignment_branch_id=p_branch_id');
  definition:=replace(definition,'id=branch_id and company_id=actor.company_id','id=assignment_branch_id and company_id=actor.company_id');
  definition:=replace(definition,'values(staff_profile_id,branch_id,false','values(staff_profile_id,assignment_branch_id,false');
  execute definition;
end $$;

commit;
