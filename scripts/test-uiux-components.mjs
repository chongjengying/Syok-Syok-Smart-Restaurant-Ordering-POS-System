import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../test-results/uiux-modernization/', import.meta.url);
await mkdir(root, { recursive: true });
const html = new URL('harness.html', root), jsx = new URL('harness.jsx', root);
await writeFile(html, '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="./harness.jsx?run='+Date.now()+'"></script></body></html>');
await writeFile(jsx, `import React from 'react';
import {createRoot} from 'react-dom/client';
import '/src/index.css';
import CustomizationModal from '/src/components/CustomizationModal.jsx';
import AccessibleDialog from '/src/components/admin/AccessibleDialog.jsx';
function Test(){const[open,setOpen]=React.useState(false);const[count,setCount]=React.useState(0);return <><button onClick={()=>setOpen(true)}>Open modifiers</button><button onClick={()=>setCount(count+1)}>Background {count}</button>{open&&<CustomizationModal dish={{id:'test',name:'Test restaurant dish with a long name',price:12,description:'Kitchen instructions remain available on smaller screens.',optionGroups:[{id:'size',name:'Portion',isRequired:true,minSelection:1,maxSelection:1,selectionType:'SINGLE',options:[{id:'regular',name:'Regular',priceAdjustment:0},{id:'large',name:'Large',priceAdjustment:3}]},{id:'extras',name:'Extras',isRequired:false,minSelection:0,maxSelection:2,selectionType:'MULTIPLE',options:[{id:'egg',name:'Extra egg',priceAdjustment:2}]}]}} lang="en" diningMode="dine-in" onClose={()=>setOpen(false)} onSave={(item)=>{window.savedItem=item;setOpen(false)}}/>}</>};createRoot(document.getElementById('root')).render(<Test/>);`);
const browser=await chromium.launch();const results=[];
try {
 for(const [width,height] of [[1920,1080],[1366,768],[1024,768],[768,1024],[390,844]]) {
  const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/test-results/uiux-modernization/harness.html');
  await page.getByRole('button',{name:'Open modifiers'}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  const bounds=await dialog.boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1);
  for(let i=0;i<30;i++){await page.keyboard.press(i<15?'Tab':'Shift+Tab');assert(await dialog.evaluate(n=>n.contains(document.activeElement)));}
  await page.getByRole('button',{name:/Large/}).click();
  await page.getByRole('button',{name:/Extra egg/}).click();
  await page.getByLabel('Increase quantity').click();
  await page.getByRole('textbox').fill('No salt');
  assert.equal(await page.getByRole('textbox').inputValue(),'No salt');
  assert(await dialog.evaluate(n=>n.contains(document.activeElement)));
  const save=page.getByRole('button',{name:/Add to Cart/i});await save.scrollIntoViewIfNeeded();
  const sb=await save.boundingBox();assert(sb.x>=0&&sb.x+sb.width<=width+1&&sb.y+sb.height<=height+1);
  await page.screenshot({path:fileURLToPath(new URL('modifier-after-'+width+'.png',root))});
  await save.click();
  const saved=await page.evaluate(()=>window.savedItem);
  assert.equal(saved.quantity,2);assert.equal(saved.finalPrice,17);assert.equal(saved.specialRequest,'No salt');assert.equal(saved.selectedOptions.length,2);
  assert(await page.getByRole('button',{name:'Open modifiers'}).evaluate(n=>n===document.activeElement));
  await page.getByRole('button',{name:'Open modifiers'}).click();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);results.push({viewport:[width,height],verification:'VERIFIED PASS',checks:'viewport fit; forward/reverse focus; selection; notes; quantity; payload; save reachability; Escape; focus return; no JS errors'});await page.close();
 }
 await writeFile(new URL('component-results.json',root),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();await rm(html,{force:true});await rm(jsx,{force:true});}
