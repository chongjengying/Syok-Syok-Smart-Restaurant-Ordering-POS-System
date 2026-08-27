export const LOGO_MAX_BYTES=5*1024*1024;
export const LOGO_MIME_TYPES=Object.freeze(['image/png','image/jpeg','image/webp']);
export function validateLogoFile(file){if(!file)return'Choose a logo file.';if(!LOGO_MIME_TYPES.includes(file.type))return'Logo must be PNG, JPEG, or WebP.';if(file.size>LOGO_MAX_BYTES)return'Logo must not exceed 5 MB.';return'';}
export function validateSystemSettings(value){
 const errors=[];const info=value?.restaurantInfo||{};
 if(!String(info.restaurantName||'').trim())errors.push('Restaurant name is required.');
 if(info.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.email))errors.push('Email address is invalid.');
 if(!/^[A-Z0-9_-]{2,12}$/i.test(String(info.branchCode||'')))errors.push('Branch code must contain 2–12 letters, numbers, underscores, or hyphens.');
 for(const [label,rate] of [['Tax',value?.taxRate],['Service charge',value?.serviceChargeRate]])if(!Number.isFinite(Number(rate))||Number(rate)<0||Number(rate)>100)errors.push(`${label} rate must be between 0 and 100.`);
 if(!/^[A-Z]{3}$/.test(String(value?.currencyCode||'')))errors.push('Currency must be a three-letter ISO code.');
 if(!String(value?.timezone||'').includes('/'))errors.push('Timezone must be an IANA identifier.');
 if(!value?.enabledLanguages?.includes(value?.defaultLanguage))errors.push('Default language must be enabled.');
 if(value?.receiptConfig?.copies<1||value?.receiptConfig?.copies>9)errors.push('Receipt copies must be between 1 and 9.');
 const assigned=new Set();for(const station of value?.stations||[])for(const category of station.categoryIds||[]){if(assigned.has(category))errors.push('A category can only be assigned to one kitchen station.');assigned.add(category);}
 for(const printer of value?.printers||[])if(printer.connectionType==='NETWORK'&&(!printer.ipAddress||Number(printer.port)<1||Number(printer.port)>65535))errors.push(`${printer.name||'Network printer'} requires a valid IP address and port.`);
 return [...new Set(errors)];
}
export function formatConfiguredCurrency(amount,{currencyCode='MYR',decimalPlaces=2}={}){try{return new Intl.NumberFormat('en-MY',{style:'currency',currency:currencyCode,minimumFractionDigits:decimalPlaces,maximumFractionDigits:decimalPlaces}).format(Number(amount||0));}catch{return `${currencyCode} ${Number(amount||0).toFixed(decimalPlaces)}`;}}
