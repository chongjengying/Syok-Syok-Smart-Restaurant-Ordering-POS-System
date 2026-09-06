import { supabase } from '../../infrastructure/supabase/client';

export const listPromotions = () => supabase.from('promotions').select('*').order('priority', { ascending: false }).order('created_at', { ascending: false });
export const savePromotion = (promotion) => {
  const payload = { ...promotion, name: String(promotion.name || '').trim(), updated_at: new Date().toISOString() };
  return promotion.id ? supabase.from('promotions').update(payload).eq('id', promotion.id).select().single() : supabase.from('promotions').insert(payload).select().single();
};
export const setPromotionStatus = (id, status) => supabase.from('promotions').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
export const deletePromotion = (id) => supabase.rpc('archive_promotion_admin', { p_promotion_id: id });
