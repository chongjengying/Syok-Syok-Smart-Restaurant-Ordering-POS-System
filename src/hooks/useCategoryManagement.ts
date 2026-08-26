import { useCallback, useEffect, useState } from 'react';
import { getManagedCategories, saveManagedCategory } from '../services/category-management.service';
import type { CategoryManagementInput, ManagedCategory } from '../types/category';

export function useCategoryManagement() {
  const [categories,setCategories]=useState<ManagedCategory[]>([]); const [isLoading,setIsLoading]=useState(true); const [isSaving,setIsSaving]=useState(false); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
  const refresh=useCallback(async()=>{setIsLoading(true);const r=await getManagedCategories();setCategories(r.data||[]);setError(r.error?.message||'');setIsLoading(false);},[]);
  useEffect(()=>{void refresh();},[refresh]);
  const save=async(id:string|null,input:CategoryManagementInput)=>{setIsSaving(true);setError('');setNotice('');const r=await saveManagedCategory(id,input);setIsSaving(false);if(r.error){setError(r.error.message);return false;}setNotice('Category saved.');await refresh();return true;};
  return {categories,isLoading,isSaving,error,notice,refresh,save};
}
