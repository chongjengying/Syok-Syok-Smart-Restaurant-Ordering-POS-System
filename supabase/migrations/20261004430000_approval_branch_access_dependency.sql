begin;
do $$ declare definition text; begin
 select pg_get_functiondef('public.profile_has_company_permission(uuid,uuid,uuid,text)'::regprocedure) into definition;
 if strpos(definition,'p.branch_id=b.id')=0 then raise exception 'APPROVAL_BRANCH_PATCH_TARGET_MISSING'; end if;
 -- Company administrators have company-wide branch access; other approvers
 -- must retain an active assignment, even if their primary branch is stale.
 definition:=replace(definition,'p.branch_id=b.id','r.name=''ADMIN''');
 execute definition;
end $$;
commit;
