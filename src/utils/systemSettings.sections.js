const clone=value=>structuredClone(value);

export function isSettingsSectionDirty(saved,draft,fields){
 return Boolean(saved&&draft&&fields.some(field=>JSON.stringify(saved[field])!==JSON.stringify(draft[field])));
}

export function buildSettingsSectionRequest(saved,draft,fields){
 const request=clone(saved);
 for(const field of fields)request[field]=clone(draft[field]);
 return request;
}

export function reconcileSavedSettingsDraft(currentDraft,saved,fields){
 const next=clone(currentDraft);
 next.revision=saved.revision;
 next.canEdit=saved.canEdit;
 next.categories=clone(saved.categories);
 for(const field of fields)next[field]=clone(saved[field]);
 return next;
}

export function resetSettingsSection(currentDraft,saved,fields){
 const next=clone(currentDraft);
 for(const field of fields)next[field]=clone(saved[field]);
 return next;
}
