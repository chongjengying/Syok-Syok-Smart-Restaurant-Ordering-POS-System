-- Make the array initializer explicit so PL/pgSQL validation does not rely on
-- an implicit text-to-uuid[] assignment cast.
do $$
declare
  definition text;
  old_initializer constant text := 'assigned_ids uuid[] := ''{}'';';
  new_initializer constant text := 'assigned_ids uuid[] := ''{}''::uuid[];';
begin
  select pg_get_functiondef(
    'public.create_pos_bill_split(uuid,text,integer,jsonb)'::regprocedure
  ) into definition;

  if position(new_initializer in definition) > 0 then
    return;
  end if;

  if position(old_initializer in definition) = 0 then
    raise exception 'EXPECTED_SPLIT_BILL_ARRAY_INITIALIZER_NOT_FOUND';
  end if;

  execute replace(definition, old_initializer, new_initializer);
end;
$$;
