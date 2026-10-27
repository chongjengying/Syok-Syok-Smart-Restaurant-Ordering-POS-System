begin;

alter table public.pos_terminals replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.pos_terminals;
exception
  when duplicate_object then null;
end $$;

commit;
