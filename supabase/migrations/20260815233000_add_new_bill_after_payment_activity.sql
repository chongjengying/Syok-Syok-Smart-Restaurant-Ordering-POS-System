alter table public.table_activity_logs
  drop constraint if exists table_activity_logs_action_check;

alter table public.table_activity_logs
  add constraint table_activity_logs_action_check check (action in (
    'TABLE_RESERVED', 'RESERVATION_RELEASED', 'TABLE_OCCUPIED',
    'NEW_BILL_AFTER_PAYMENT', 'ORDER_MOVED_IN', 'ORDER_MOVED_OUT',
    'ORDER_CANCELLED', 'PAYMENT_COMPLETED', 'CLEANING_STARTED',
    'CLEANING_COMPLETED', 'TABLE_OUT_OF_SERVICE', 'TABLE_RESTORED',
    'MANAGER_OVERRIDE'
  ));
