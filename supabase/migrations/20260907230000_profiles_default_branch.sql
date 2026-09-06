begin;
alter table public.profiles add column if not exists default_branch_id uuid references public.branches(id) on delete set null;
update public.profiles set default_branch_id=branch_id where default_branch_id is null and branch_id is not null;
create index if not exists profiles_default_branch_idx on public.profiles(default_branch_id);

create or replace function public.sync_profile_default_branch() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.default_branch_id is distinct from old.default_branch_id and new.branch_id is not distinct from old.branch_id then new.branch_id:=new.default_branch_id;
 elsif new.branch_id is distinct from old.branch_id and new.default_branch_id is not distinct from old.default_branch_id then new.default_branch_id:=new.branch_id;
 end if;
 return new;
end $$;
drop trigger if exists profiles_default_branch_sync on public.profiles;
create trigger profiles_default_branch_sync before insert or update of branch_id,default_branch_id on public.profiles for each row execute function public.sync_profile_default_branch();
commit;
