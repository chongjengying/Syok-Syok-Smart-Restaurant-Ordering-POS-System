import { useEffect, useState } from 'react';
import { Search, Save } from 'lucide-react';
import { fetchTerminalAccessConfiguration, listBranchTerminalStaff, saveTerminalAccessConfiguration } from '../../services/organization.service';

export default function TerminalStaffAccessEditor({ terminalId, branchId, onChange, onSaved, readOnly = false }) {
  const [mode, setMode] = useState('ALL_BRANCH_STAFF');
  const [staff, setStaff] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [loadedKey, setLoadedKey] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const key = `${terminalId || 'new'}:${branchId}`;
  useEffect(() => {
    let active = true;
    setLoadedKey(''); setStaff([]); setSelected([]); setError(''); setSearch('');
    onChange?.(null);
    const load = async () => {
      try {
        const result = terminalId ? await fetchTerminalAccessConfiguration(terminalId) : await listBranchTerminalStaff(branchId);
        if (!active) return;
        if (result.error) throw result.error;
        const people = terminalId ? result.data.staff : result.data;
        const nextMode = terminalId ? result.data.accessMode : 'ALL_BRANCH_STAFF';
        const ids = people.filter(person => person.selected).map(person => person.id);
        setStaff(people); setMode(nextMode); setSelected(ids); setLoadedKey(key);
        onChange?.({ accessMode: nextMode, staffIds: ids });
      } catch (cause) { if (active) setError(cause.message || 'Unable to load branch staff.'); }
    };
    if (branchId) void load();
    return () => { active = false; };
    // Loading belongs to the branch/terminal identity, not the parent's callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId, branchId, key]);
  const change = (nextMode, ids) => {
    setMode(nextMode); setSelected(ids);
    onChange?.({ accessMode: nextMode, staffIds: nextMode === 'SELECTED_STAFF' ? ids : [] });
  };
  const save = async () => {
    if (readOnly || saving || loadedKey !== key) return;
    setSaving(true); setError('');
    try {
      const result = await saveTerminalAccessConfiguration(terminalId, mode, [], mode === 'SELECTED_STAFF' ? selected : []);
      if (result.error) throw result.error;
      onSaved?.(result.data);
    } catch (cause) { setError(cause.message || 'Unable to save terminal staff access.'); }
    finally { setSaving(false); }
  };
  const people = staff.filter(person => `${person.name} ${person.staffCode} ${person.role} ${person.branch}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <section className="mt-4 min-w-0 border-t border-slate-200 pt-4">
    <h4 className="font-bold">Staff Access</h4>
    {error && <p role="alert" className="my-3 text-sm text-red-700">{error}</p>}
    {loadedKey !== key ? <p className="mt-3 text-sm text-slate-500">{error ? 'Staff access is unavailable.' : 'Loading branch staff...'}</p> : <fieldset disabled={saving || readOnly} className="mt-3 min-w-0 space-y-3">
      <label className="flex items-start gap-2 text-sm"><input type="radio" name={`access-${key}`} checked={mode === 'ALL_BRANCH_STAFF'} onChange={() => change('ALL_BRANCH_STAFF', selected)} className="mt-1"/><span><strong>All Branch Staff</strong><span className="block text-xs text-slate-500">All active staff assigned to this branch can use this terminal.</span></span></label>
      <label className="flex items-start gap-2 text-sm"><input type="radio" name={`access-${key}`} checked={mode === 'SELECTED_STAFF'} onChange={() => change('SELECTED_STAFF', selected)} className="mt-1"/><span><strong>Selected Staff</strong><span className="block text-xs text-slate-500">Only selected staff from this branch can use this terminal.</span></span></label>
      {mode === 'SELECTED_STAFF' && <>
        <label className="flex items-center gap-2 border border-slate-200 p-2"><Search size={16}/><input aria-label="Search terminal staff" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search staff" className="min-w-0 flex-1 text-sm outline-none"/></label>
        <div className="max-h-64 overflow-auto"><table className="w-full text-left text-xs"><thead><tr>{['Select','Staff Name','Employee ID','Role','Branch','Status'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{people.map(person => <tr key={person.id} className="border-t"><td className="p-2"><input type="checkbox" aria-label={`Allow ${person.name}`} checked={selected.includes(person.id)} onChange={event => change(mode, event.target.checked ? [...selected, person.id] : selected.filter(id => id !== person.id))}/></td><td className="p-2">{person.name}</td><td className="p-2">{person.staffCode}</td><td className="p-2">{person.role}</td><td className="p-2">{person.branch}</td><td className="p-2">Active</td></tr>)}</tbody></table>{!people.length && <p className="p-3 text-sm text-slate-500">No active branch staff match.</p>}</div>
        {!selected.length && <p className="text-xs text-red-700">Select at least one staff member.</p>}
      </>}
      {!onChange && !readOnly && <button type="button" disabled={saving || (mode === 'SELECTED_STAFF' && !selected.length)} onClick={() => void save()} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"><Save size={16}/>{saving ? 'Saving...' : 'Save staff access'}</button>}
    </fieldset>}
  </section>;
}
