import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';
const local=getLocalSupabaseStatus();
assert.equal(new URL(local.API_URL).hostname,'127.0.0.1');
// This test provisions an ephemeral administrator. Run in the disposable project.
assert.equal(new URL(local.API_URL).port,'56321','Use the isolated UI/UX test environment');
const output=new URL('../test-results/uiux-admin/',import.meta.url);await mkdir(output,{recursive:true});
async function api(path,method='GET',body){const r=await fetch(local.API_URL+path,{method,headers:{apikey:local.ANON_KEY,Authorization:`Bearer ${local.SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});assert(r.ok,`${method} ${path}: ${r.status}`);return r.status===204?null:r.json();}
const email=`uiux-${crypto.randomUUID()}@example.invalid`,password=crypto.randomUUID()+crypto.randomUUID();
let user,browser;const results=[];
try{
 user=await api('/auth/v1/admin/users','POST',{email,password,email_confirm:true});
 const [branch]=await api('/rest/v1/branches?status=eq.ACTIVE&select=id,company_id&limit=1');
 const [role]=await api(`/rest/v1/roles?company_id=eq.${branch.company_id}&name=eq.ADMIN&select=id`);
 await api(`/rest/v1/profiles?id=eq.${user.id}`,'PATCH',{name:'UIUX test administrator',company_id:branch.company_id,branch_id:branch.id,role_id:role.id,role_name:'ADMIN',status:'ACTIVE'});
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1366,height:768}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5183');await page.locator('#current-email').fill(email);await page.locator('#current-password').fill(password);await page.getByRole('button',{name:/sign in/i}).last().click();await page.locator('.admin-shell').waitFor({timeout:30000});
 const sections=['dashboard','company','branches','terminals','users','roles','orders','payments','receipts','cash-shifts','tables','products','categories','inventory','promotions','vouchers','reports','discount-activity','audit','system-administration','system-health','qr-settings','payment-providers','einvoice'];
 for(const section of sections){await page.goto(`http://127.0.0.1:5183/#admin/${section}`);await page.locator('.admin-content').waitFor();await page.waitForTimeout(1000);assert((await page.locator('.admin-content').innerText()).trim().length>20);if(['orders','payments','receipts','audit','payment-providers'].includes(section)) {
    const missing=await page.locator('.admin-content input, .admin-content select').evaluateAll(nodes=>nodes.filter(n=>!n.getAttribute('aria-label')&&!n.getAttribute('aria-labelledby')&&!n.labels?.length).map(n=>n.type));
    assert.deepEqual(missing,[],section+' has unnamed form controls');
  }
  if(section==='audit'&&await page.locator('.admin-content details').count()) {const detail=page.locator('.admin-content details').first();await detail.locator('summary').click();assert(await detail.getAttribute('open')!==null);assert((await detail.innerText()).includes('Record:'));}
  await page.screenshot({path:fileURLToPath(new URL(`admin-${section}-1366.png`,output))});results.push({section,verification:'VERIFIED PASS',coverage:'Authenticated render and screenshot; not all actions'});}
 for(const [width,height] of [[1920,1080],[1024,768],[768,1024],[390,844]]){
  await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:5183/#admin/dashboard');await page.locator('.admin-content h1').waitFor();await page.waitForTimeout(700);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:fileURLToPath(new URL(`admin-dashboard-${width}.png`,output))});
  if(width<1024){const menu=page.getByRole('button',{name:/Admin Menu/i});await menu.click();const dialog=page.getByRole('dialog',{name:'Admin navigation'});await dialog.waitFor();for(let i=0;i<50;i++){await page.keyboard.press(i<25?'Tab':'Shift+Tab');assert(await dialog.evaluate(n=>n.contains(document.activeElement)));}await page.screenshot({path:fileURLToPath(new URL(`admin-navigation-${width}.png`,output))});await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert(await menu.evaluate(n=>n===document.activeElement));await menu.click();await dialog.getByRole('button',{name:'Orders',exact:true}).click();await dialog.waitFor({state:'hidden'});assert(page.url().includes('#admin/orders'));}
  results.push({viewport:[width,height],verification:'VERIFIED PASS',coverage:'No document overflow; screenshot; mobile drawer focus, Escape, restoration and navigation where present'});
 }
 assert.deepEqual(errors,[]);results.push({verification:'VERIFIED PASS',coverage:'No browser JavaScript errors'});
 await writeFile(new URL('results.json',output),JSON.stringify(results,null,2));console.log(JSON.stringify({verification:'VERIFIED PASS',checks:results.length}));
}finally{await browser?.close();if(user?.id)await api('/auth/v1/admin/users/'+user.id,'DELETE');}
