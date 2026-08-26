-- Menu clients need immediate availability and category updates. RLS remains
-- active for Realtime subscribers; only rows readable by the authenticated
-- staff session are delivered.
do $$
begin
  begin
    alter publication supabase_realtime add table public.categories;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.products;
  exception when duplicate_object then null;
  end;
end;
$$;
