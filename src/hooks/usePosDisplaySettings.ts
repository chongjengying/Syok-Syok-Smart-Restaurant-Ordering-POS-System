import {useCallback,useEffect,useState} from 'react';
import {supabase} from '../infrastructure/supabase/client';

export function usePosDisplaySettings(enabled=true){
 const[settings,setSettings]=useState<Record<string,unknown>|null>(null);
 const load=useCallback(async()=>{
  if(!enabled){setSettings(null);return;}
  const{data}=await supabase.rpc('get_pos_display_settings');
  if(!data)return;
  const row=data as Record<string,unknown>;
  const path=String(row.logoPath||'');
  setSettings({...row,logoUrl:path?supabase.storage.from('restaurant-assets').getPublicUrl(path).data.publicUrl:''});
 },[enabled]);
 useEffect(()=>{let active=true;const refresh=()=>{if(active)void load();};refresh();window.addEventListener('pos-settings-updated',refresh);return()=>{active=false;window.removeEventListener('pos-settings-updated',refresh);};},[load]);
 return settings;
}
