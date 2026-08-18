-- Align the authoritative payment RPC with the canonical order model while
-- preserving its previously audited locking/idempotency transaction body.
do $$
declare
  definition text;
begin
  definition := pg_get_functiondef(
    'public.complete_payment(uuid,text,numeric,text,text,text)'::regprocedure
  );
  definition := replace(
    definition,
    '''ADMIN'', ''MANAGER'', ''WAITER'', ''CASHIER''',
    '''ADMIN'', ''MANAGER'', ''CASHIER'''
  );
  definition := replace(
    definition,
    '''DRAFT'', ''CANCELLED'', ''REFUNDED'', ''COMPLETED''',
    '''DRAFT'', ''CANCELLED'', ''COMPLETED'''
  );
  definition := replace(definition, '''ORDER_NOT_COLLECTED''', '''ORDER_NOT_SERVED''');
  execute definition;
end;
$$;

revoke all on function public.complete_payment(uuid, text, numeric, text, text, text)
from public, anon;
grant execute on function public.complete_payment(uuid, text, numeric, text, text, text)
to authenticated;

