-- The six-argument implementation is now a private transactional worker.
-- Authenticated clients must use the tender-aware seven-argument boundary.
revoke all on function public.complete_payment(uuid, text, numeric, text, text, text)
from public, anon, authenticated;

revoke all on function public.complete_payment(uuid, text, numeric, text, text, text, numeric)
from public, anon;
grant execute on function public.complete_payment(uuid, text, numeric, text, text, text, numeric)
to authenticated;

