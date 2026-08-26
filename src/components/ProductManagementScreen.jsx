import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ImagePlus, PackagePlus, Pencil, Search, Trash2, X } from 'lucide-react';
import { useProductManagement } from '../hooks/useProductManagement';
import { hasPosCapability, POS_CAPABILITIES } from '../shared/permissions';
import { validateProductImage } from '../services/product-image.service';
import ProductImage from './products/ProductImage';

const emptyForm = { categoryId: '', name: '', description: '', unit: '', price: '', cost: '', isActive: true, isAvailable: true };

export default function ProductManagementScreen({ role, onBack, embedded = false, permissions = null }) {
  const manager = useProductManagement();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [fileError, setFileError] = useState('');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const canDelete = hasPosCapability(role, POS_CAPABILITIES.DELETE_PRODUCT_IMAGE);
  const canCreate = !permissions || permissions.includes('product.create');
  const canEdit = !permissions || permissions.includes('product.edit');
  const canManageImage = !permissions || permissions.includes('product.manage_image');
  const canDeactivate = !permissions || permissions.includes('product.deactivate');
  const visibleProducts = useMemo(() => manager.products.filter(product => (
    (!categoryFilter || product.categoryId === categoryFilter)
    && `${product.code} ${product.name}`.toLowerCase().includes(query.toLowerCase())
  )), [manager.products, categoryFilter, query]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const close = () => { setEditing(null); setForm(emptyForm); setFile(null); setPreview(''); setFileError(''); };
  const open = (product = {}) => {
    setEditing(product.id ? product : { isNew: true });
    setForm(product.id ? { categoryId: product.categoryId, name: product.name, description: product.description, unit: product.unit, price: String(product.price), cost: String(product.cost), isActive: product.isActive, isAvailable: product.isAvailable } : emptyForm);
    setFile(null); setPreview(''); setFileError('');
  };
  const chooseFile = (event) => {
    const next = event.target.files?.[0] || null;
    if (preview) URL.revokeObjectURL(preview);
    try { if (next) validateProductImage(next); setFile(next); setPreview(next ? URL.createObjectURL(next) : ''); setFileError(''); }
    catch (error) { setFile(null); setPreview(''); setFileError(error.message); }
  };
  const submit = async (event) => {
    event.preventDefault();
    const ok = await manager.save({ ...form, price: Number(form.price), cost: Number(form.cost) }, file, editing?.id ? editing : null, Boolean(editing?.id && !canEdit));
    if (ok) close();
  };

  return <div className={`${embedded ? '' : 'h-full overflow-y-auto bg-[#F8F9FA] p-6'} text-[#121212]`}>
    <header className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">{!embedded&&<button onClick={onBack} className="rounded-xl bg-white p-3 shadow"><ArrowLeft /></button>}<div><h1 className="text-2xl font-black">Product Management</h1><p className="text-sm text-gray-500">Images are stored securely in Supabase Storage.</p></div></div>
      {canCreate&&<button onClick={() => open()} className="flex items-center gap-2 rounded-xl bg-[#D4AF37] px-5 py-3 font-black"><PackagePlus size={18}/> Add Product</button>}
    </header>
    {manager.error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{manager.error}</div>}
    {manager.notice && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{manager.notice}</div>}
    <div className="mb-5 flex flex-wrap gap-3"><div className="relative min-w-64 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search code or product" className="w-full rounded-xl border bg-white py-2.5 pl-10"/></div><select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} className="rounded-xl border bg-white px-4"><option value="">All categories</option>{manager.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    {manager.isLoading ? <p>Loading products…</p> : visibleProducts.length === 0 ? <p className="rounded-xl bg-white p-8 text-center text-gray-400">No products found.</p> : <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleProducts.map(product => <article key={product.id} className="overflow-hidden rounded-2xl bg-white shadow">
      <div className="h-44 bg-gray-100"><ProductImage src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /></div>
      <div className="p-4"><div className="flex justify-between gap-3"><div><h2 className="font-black">{product.name}</h2><p className="text-xs text-gray-400">{product.code}</p></div><div className="text-right"><strong>RM {product.price.toFixed(2)}</strong><p className="text-[10px] text-gray-400">Cost RM {product.cost.toFixed(2)}</p></div></div>
      <p className={`mt-2 text-xs font-bold ${product.isAvailable ? 'text-emerald-600' : 'text-red-600'}`}>{product.isAvailable ? 'Available' : 'Sold Out'}</p>
      <p className="mt-1 text-[10px] text-gray-400">{product.isActive ? 'ACTIVE' : 'INACTIVE'} · Updated {product.updatedAt ? new Date(product.updatedAt).toLocaleDateString() : '-'}</p>
      <div className="mt-4 flex gap-2">{(canEdit||canManageImage)&&<button onClick={() => open(product)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#121212] p-2 text-sm font-bold text-white"><Pencil size={15}/> Edit / Replace</button>}
      {canDelete && product.imagePath && <button disabled={manager.isSaving} onClick={() => { if (window.confirm(`Delete the image for ${product.name}?`)) void manager.removeImage(product); }} aria-label="Delete product image" className="rounded-xl border border-red-200 p-2 text-red-600"><Trash2 size={17}/></button>}</div></div>
    </article>)}</div>}

    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={submit} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
      <div className="mb-5 flex justify-between"><h2 className="text-xl font-black">{editing.id ? 'Edit Product' : 'Add Product'}</h2><button type="button" onClick={close}><X/></button></div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-bold">Name<input disabled={Boolean(editing.id&&!canEdit)} required maxLength={150} value={form.name} onChange={e => setForm({...form, name:e.target.value})} className="mt-1 w-full rounded-xl border p-3 font-normal"/></label>
        <label className="text-sm font-bold">Category<select disabled={Boolean(editing.id&&!canEdit)} required value={form.categoryId} onChange={e => setForm({...form, categoryId:e.target.value})} className="mt-1 w-full rounded-xl border p-3 font-normal"><option value="">Select category</option>{manager.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="text-sm font-bold">Price (RM)<input disabled={Boolean(editing.id&&!canEdit)} required min="0" step="0.01" type="number" value={form.price} onChange={e => setForm({...form, price:e.target.value})} className="mt-1 w-full rounded-xl border p-3 font-normal"/></label>
        <label className="text-sm font-bold">Cost (RM)<input disabled={Boolean(editing.id&&!canEdit)} required min="0" step="0.01" type="number" value={form.cost} onChange={e => setForm({...form, cost:e.target.value})} className="mt-1 w-full rounded-xl border p-3 font-normal"/></label>
        <label className="text-sm font-bold">Unit<input disabled={Boolean(editing.id&&!canEdit)} maxLength={20} value={form.unit} onChange={e => setForm({...form, unit:e.target.value})} className="mt-1 w-full rounded-xl border p-3 font-normal"/></label>
      </div>
      <label className="mt-4 block text-sm font-bold">Description<textarea disabled={Boolean(editing.id&&!canEdit)} maxLength={1000} value={form.description} onChange={e => setForm({...form, description:e.target.value})} className="mt-1 w-full rounded-xl border p-3 font-normal"/></label>
      {canManageImage&&<div className="mt-4 rounded-xl border border-dashed p-4"><label className="flex cursor-pointer items-center gap-2 font-bold"><ImagePlus/> Select JPG, PNG or WEBP (max 5 MB)<input className="sr-only" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={chooseFile}/></label>
      {fileError && <p className="mt-2 text-sm text-red-600">{fileError}</p>}{(preview || editing.imageUrl) && <ProductImage src={preview || editing.imageUrl} alt="Image preview" className="mt-3 h-40 w-full rounded-xl object-cover"/>}</div>}
      <div className="mt-4 flex gap-6 text-sm"><label><input disabled={!canDeactivate} type="checkbox" checked={form.isActive} onChange={e => setForm({...form,isActive:e.target.checked})}/> Active</label><label><input disabled={!canEdit} type="checkbox" checked={form.isAvailable} onChange={e => setForm({...form,isAvailable:e.target.checked})}/> Available</label></div>
      <button disabled={manager.isSaving || Boolean(fileError) || Boolean(editing.id&&!canEdit&&!file)} className="mt-6 w-full rounded-xl bg-[#D4AF37] p-4 font-black disabled:opacity-50">{manager.isSaving ? 'Saving…' : 'Save Product'}</button>
    </form></div>}
  </div>;
}
