import {supabase} from '../infrastructure/supabase/client';
export const fetchSystemSettings=()=>supabase.rpc('get_system_administration');
export const persistSystemSettings=(payload:Record<string,unknown>,revision:number)=>supabase.rpc('save_system_administration',{p_payload:payload,p_expected_revision:revision});
export async function uploadRestaurantLogo(file:File){const extension=file.type==='image/jpeg'?'jpg':file.type.split('/')[1];const path=`branding/logo-${crypto.randomUUID()}.${extension}`;const result=await supabase.storage.from('restaurant-assets').upload(path,file,{upsert:false,contentType:file.type});if(result.error)return{data:null,error:result.error};return{data:{path,url:supabase.storage.from('restaurant-assets').getPublicUrl(path).data.publicUrl},error:null};}
export const getRestaurantLogoUrl=(path:string)=>path?supabase.storage.from('restaurant-assets').getPublicUrl(path).data.publicUrl:'';
