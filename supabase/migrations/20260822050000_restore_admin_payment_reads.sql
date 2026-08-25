begin;
drop policy if exists finance_staff_read_payments on public.payments;
create policy finance_staff_read_payments
on public.payments for select to authenticated
using (public.current_pos_role() in ('ADMIN', 'MANAGER', 'CASHIER'));
commit;
