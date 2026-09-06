import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';
const s=getLocalSupabaseStatus();
const suffix=crypto.randomUUID().slice(0,8),email=`ui-${suffix}@example.com`,password=`Ui-Test-${suffix}!`;
async function api(path,body,token=s.SERVICE_ROLE_KEY,method='POST') {
 const r=await fetch(`${s.API_URL}${path}`,{method,headers:{apikey:s.ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();const data=text?JSON.parse(text):null;assert.ok(r.ok,JSON.stringify(data));return data;
}
const auth=await api('/auth/v1/signup',{email,password});
const [branch]=await api('/rest/v1/branches?code=eq.MAIN&select=id',undefined,s.SERVICE_ROLE_KEY,'GET');
await api(`/rest/v1/profiles?id=eq.${auth.user.id}`,{role_name:'ADMIN',status:'ACTIVE',branch_id:branch.id},s.SERVICE_ROLE_KEY,'PATCH');
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5175');
 await page.locator('#current-email').fill(email);await page.locator('#current-password').fill(password);await page.getByRole('button',{name:/sign in/i}).last().click();
 await page.getByRole('button',{name:'Company',exact:true}).waitFor({timeout:20000});
 await page.getByRole('button',{name:'Company',exact:true}).click();
 await page.getByRole('heading',{name:'Company',exact:true}).waitFor();
 await page.getByLabel('Business registration no.').waitFor();
 await page.screenshot({path:'/tmp/pos-company.png',fullPage:true});
 await page.getByRole('button',{name:'Branches',exact:true}).click();
 await page.getByRole('button',{name:'Manage branch',exact:true}).first().click();
 await page.getByText('Active terminals',{exact:true}).waitFor();
 await page.screenshot({path:'/tmp/pos-branch-overview.png',fullPage:true});
 await page.getByRole('button',{name:'POS & payment',exact:true}).click();
 await page.getByText('Physical QR',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Terminals',exact:true}).last().click();
 await page.getByLabel('Terminal code',{exact:true}).fill(`UI-${suffix.toUpperCase()}`);
 await page.getByLabel('Name',{exact:true}).fill('UI verification counter');
 await page.getByRole('button',{name:'Create terminal',exact:true}).click();
 await page.getByRole('button',{name:'Register this browser',exact:true}).last().click();
 await page.getByRole('button',{name:'Activate',exact:true}).last().click();
 await page.getByRole('button',{name:'Switch Staff',exact:true}).last().click();
 await page.getByText(/select.*staff|staff.*select|choose.*staff/i).first().waitFor({timeout:15000});
 await page.screenshot({path:'/tmp/pos-staff-selector.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS organization UI: admin password login without PIN, company form, branch overview/settings/terminals, registration and staff selector');
} finally {await browser.close();}
