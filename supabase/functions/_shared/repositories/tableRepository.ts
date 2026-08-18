import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const tableColumns = 'id, table_number, table_name, capacity, status, area, qr_code, is_active, created_at, updated_at, orders(id, order_number, status, payment_status, total, created_at, order_items(item_status))';
const visibleOrderStatuses = ['DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'];

export class TableRepository {
  constructor(private readonly client: SupabaseClient) {}

  list(status?: string | null, includeInactive = false) {
    let query = this.client
      .from('restaurant_tables')
      .select(tableColumns)
      .in('orders.status', visibleOrderStatuses)
      .order('area')
      .order('table_number');
    if (!includeInactive) query = query.eq('is_active', true);
    if (status) query = query.eq('status', status);
    return query;
  }

  getById(tableId: string) {
    return this.client
      .from('restaurant_tables')
      .select(tableColumns)
      .in('orders.status', visibleOrderStatuses)
      .eq('id', tableId)
      .maybeSingle();
  }

  create(values: Record<string, unknown>) {
    return this.client.from('restaurant_tables').insert(values).select(tableColumns).single();
  }

  update(tableId: string, values: Record<string, unknown>) {
    return this.client
      .from('restaurant_tables')
      .update(values)
      .eq('id', tableId)
      .select(tableColumns)
      .maybeSingle();
  }

  delete(tableId: string) {
    return this.client
      .from('restaurant_tables')
      .delete()
      .eq('id', tableId)
      .select('id')
      .maybeSingle();
  }
}
