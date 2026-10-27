begin;

-- An older staging deployment stored this function body with CRLF line endings.
-- The next migration replaces an exact authorization clause using LF text.
-- Normalize formatting only; CREATE OR REPLACE retains the function's grants.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.place_order(jsonb,text,text,text,text)'::regprocedure)
    into definition;
  if position(E'\r\n' in definition) > 0 then
    execute replace(definition, E'\r\n', E'\n');
  end if;
end $$;

commit;
