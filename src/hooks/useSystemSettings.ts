import {useCallback,useEffect,useMemo,useState} from 'react';
import {getSystemSettings,saveSystemSettings,uploadSystemLogo} from '../services/systemSettings.service';
import type {SystemSettings} from '../types/systemSettings';

type SettingField=keyof SystemSettings;
const clone=<T,>(value:T):T=>structuredClone(value);

export function useSystemSettings(){
 const[data,setData]=useState<SystemSettings|null>(null);
 const[draft,setDraft]=useState<SystemSettings|null>(null);
 const[loading,setLoading]=useState(true);
 const[saving,setSaving]=useState(false);
 const[error,setError]=useState('');
 const[message,setMessage]=useState('');
 const dirty=useMemo(()=>Boolean(data&&draft&&JSON.stringify(data)!==JSON.stringify(draft)),[data,draft]);
 const isDirty=useCallback((fields:readonly SettingField[])=>Boolean(data&&draft&&fields.some(field=>JSON.stringify(data[field])!==JSON.stringify(draft[field]))),[data,draft]);

 const load=useCallback(async()=>{setLoading(true);const result=await getSystemSettings();setLoading(false);if(result.error||!result.data){setError(result.error?.message||'Unable to load settings.');return;}setData(result.data);setDraft(clone(result.data));setError('');},[]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};const navigate=(e:Event)=>{if(dirty&&!window.confirm('You have unsaved changes. Discard changes?'))e.preventDefault();};window.addEventListener('beforeunload',before);window.addEventListener('before-admin-navigate',navigate);return()=>{window.removeEventListener('beforeunload',before);window.removeEventListener('before-admin-navigate',navigate);};},[dirty]);

 const save=async(fields:readonly SettingField[],label='Settings')=>{
  if(!draft||!data||!fields.length||!isDirty(fields))return;
  if(!window.confirm(`Save changes in ${label}?`))return;
  const request=clone(data);
  for(const field of fields)(request[field] as unknown)=clone(draft[field]);
  setSaving(true);setError('');setMessage('');
  const result=await saveSystemSettings(request);
  setSaving(false);
  if(result.error||!result.data){setError(result.error?.message||`Unable to save ${label} settings.`);return;}
  const saved=result.data;
  setData(saved);
  setDraft(current=>{if(!current)return clone(saved);const next=clone(current);next.revision=saved.revision;next.canEdit=saved.canEdit;next.categories=clone(saved.categories);for(const field of fields)(next[field] as unknown)=clone(saved[field]);return next;});
  setMessage(`${label} settings saved successfully.`);
 };
 const reset=(fields?:readonly SettingField[])=>{if(!data)return;setDraft(current=>{if(!current||!fields)return clone(data);const next=clone(current);for(const field of fields)(next[field] as unknown)=clone(data[field]);return next;});setError('');setMessage('');};
 const uploadLogo=async(file:File)=>{const result=await uploadSystemLogo(file);if(result.error||!result.data){setError(result.error?.message||'Logo upload failed.');return;}setDraft(current=>current?{...current,logoPath:result.data.path,logoUrl:result.data.url}:current);};
 return{data,draft,setDraft,loading,saving,error,message,dirty,isDirty,load,save,uploadLogo,reset};
}
