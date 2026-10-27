import {chromium} from '@playwright/test';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const output=new URL('../test-results/uiux-modernization/',import.meta.url);await mkdir(output,{recursive:true});
const html=new URL('operations.html',output),jsx=new URL('operations.jsx',output);
await writeFile(html,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="./operations.jsx?run='+Date.now()+'"></script></body></html>');
await writeFile(jsx,`import React from 'react';import{createRoot}from'react-dom/client';import'/src/index.css';import Shell from '/src/components/IpadShell.jsx';import Welcome from '/src/components/WelcomeScreen.jsx';import Menu from '/src/components/MenuHomeScreen.jsx';import Kitchen from '/src/components/KitchenScreen.jsx';import Ready from '/src/components/ReadyToServeScreen.jsx';import Receipt from '/src/components/ReceiptPreview.jsx';
function Test(){const[lang,setLang]=React.useState('en');const[query,setQuery]=React.useState('');const[category,setCategory]=React.useState(null);const screen=new URLSearchParams(location.search).get('screen');const hit=()=>{window.action=true};return <Shell isOnline={true} lang={lang} setLang={setLang}>{screen==='welcome'?<Welcome canStartOrder canAccessCashShift canAccessUnpaidOrders canAccessTables lang={lang} setLang={setLang} onStartOrder={hit}/>:screen==='menu'?<Menu selectedCategory={category} setSelectedCategory={setCategory} searchQuery={query} setSearchQuery={setQuery} cart={[{dish:{id:'cart',name:'Test cart item',price:12},quantity:1,finalPrice:12,selectedOptions:[]}]} diningMode="dine-in" selectedTable="A1" lang={lang} setLang={setLang} onOpenCustomization={hit} onCheckout={hit} onDashboard={hit} onChangeTable={hit}/>:screen==='kitchen'?<Kitchen role="KITCHEN" onBack={hit} lang={lang}/>:screen==='ready'?<Ready onBack={hit} lang={lang}/>:<Receipt company={{name:'Test Restaurant'}} tax={{enabled:false}}/>}</Shell>};createRoot(document.getElementById('root')).render(<Test/>);`);
const item={id:'item',name:'Noodles with extra vegetables',quantity:2,itemStatus:'SUBMITTED',options:[{id:'option',groupName:'Spice',name:'Mild'}],specialRequest:'No peanuts',serviceMode:'DINE_IN'};
const ticket={id:'ticket',orderId:'order',orderNumber:'TEST-001',tableNumber:'A1',diningMode:'dine-in',createdAt:'2026-10-13T12:00:00Z',status:'PENDING',items:[item],takeawayPackaging:[],batchNo:1};
const products=[{id:'product',name:'Noodles with extra vegetables',price:12,description:'Freshly prepared noodles',isAvailable:true,isActive:true,optionGroups:[]}];
const browser=await chromium.launch();const results=[];
try{
 for(const [width,height] of [[1920,1080],[1366,768],[1024,768],[768,1024],[390,844]]){
 const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const mock=async(path,name,data)=>page.route('**/src/hooks/'+path+'*',r=>r.fulfill({contentType:'application/javascript',body:`export function ${name}(){const state=new URLSearchParams(location.search).get('state');return {...${JSON.stringify(data)},...(state==='empty'?{orders:[],products:[]}:{}),...(state==='loading'?{isLoading:true,isInitialLoading:true}:{}),...(state==='error'?{error:'Test request denied',hasCachedData:false}:{}),refresh(){},refetch(){},setPage(){}}}`}));
 await mock('useCategories','useCategories',{categories:[{id:'category',name:'Mains'}],isLoading:false});
 await mock('useProducts','useProducts',{products,isInitialLoading:false,hasCachedData:true});
 await mock('useKitchenOrders','useKitchenOrders',{orders:[ticket],isLoading:false,page:1,pageSize:20,total:1});
 await mock('useReadyToServeOrders','useReadyToServeOrders',{orders:[{...ticket,status:'READY'}],isLoading:false});
 for(const screen of ['welcome','menu','kitchen','ready','receipt']){
  await page.goto('http://127.0.0.1:5173/test-results/uiux-modernization/operations.html?screen='+screen);await page.waitForTimeout(300);assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(screen==='menu'){await page.getByRole('button',{name:/Add$/i}).click();assert(await page.evaluate(()=>window.action));if(width<=820){const quick=page.locator('.pos-mobile-order-action');await quick.click();assert(await page.evaluate(()=>window.action));}await page.locator('.pos-order-layout').evaluate(n=>{n.scrollTop=0});}
  if(screen==='receipt')await page.getByText('Sample preview · Not a transaction receipt').waitFor();
  await page.screenshot({path:fileURLToPath(new URL(`${screen}-after-${width}.png`,output))});
 }
 for(const screen of ['menu','kitchen','ready'])for(const state of ['empty','loading','error']){await page.goto(`http://127.0.0.1:5173/test-results/uiux-modernization/operations.html?screen=${screen}&state=${state}`);await page.waitForTimeout(200);assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(state==='error')assert((await page.locator('body').innerText()).match(/Unable to load products|Test request denied/));}
 results.push({viewport:[width,height],verification:'VERIFIED PASS',coverage:'Component fixtures: welcome, menu add handler, populated kitchen/serving, sample receipt; empty/loading/error states for menu and queues. No live queue mutation.'});await page.close();
 }
 await writeFile(new URL('operations-results.json',output),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();await rm(html,{force:true});await rm(jsx,{force:true});}
