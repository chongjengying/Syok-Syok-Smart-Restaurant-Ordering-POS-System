import { supabase } from '../infrastructure/supabase/client';
export function fetchManualQrSettings() { return supabase.rpc('get_manual_qr_payment_settings'); }
export function updateManualQrSettings(form: Record<string, unknown>) { return supabase.rpc('update_manual_qr_payment_settings', { p_enabled: form.enabled, p_image_url: form.imageUrl, p_display_name: form.displayName, p_merchant_name: form.merchantName, p_settlement_bank: form.settlementBank, p_reference_required: form.referenceRequired }); }
export async function uploadManualQrImage(path: string, file: File) {
  const result=await supabase.storage.from('payment-qr').upload(path,file,{upsert:false,contentType:file.type});
  if(result.error)return {data:null,error:result.error};
  return {data:supabase.storage.from('payment-qr').getPublicUrl(path).data.publicUrl,error:null};
}
