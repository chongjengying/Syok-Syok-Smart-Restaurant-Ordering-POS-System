import {chromium} from '@playwright/test';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const output=new URL('../test-results/uiux-modernization/',import.meta.url);await mkdir(output,{recursive:true});
const html=new URL('screens.html',output),jsx=new URL('screens.jsx',output);
await writeFile(html,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="./screens.jsx?run='+Date.now()+'"></script></body></html>');
await writeFile(jsx,`import React from 'react';import{createRoot}from'react-dom/client';import'/src/index.css';import Shell from '/src/components/IpadShell.jsx';import Payment from '/src/components/PaymentScreen.jsx';import Cart from '/src/components/CartReviewScreen.jsx';
function Test(){const[lang,setLang]=React.useState('en');const mode=new URLSearchParams(location.search).get('screen');const hit=(name)=>()=>{window.lastAction=name};return <Shell isOnline={true} lang={lang} setLang={setLang} userEmail="cashier@example.invalid" onLogout={hit('logout')} onLock={hit('lock')} onOpenProfile={hit('profile')} onSwitchStaff={hit('switch')} onChangeTerminal={hit('terminal')} onCurrentShift={hit('shift')} staffName="Test Cashier" shiftStatus="Open" terminalContext={{terminalId:'test',branchName:'Test Branch',terminalName:'POS 01',terminalCode:'POS01'}}>{mode==='cart'?<Cart cart={[{dish:{id:'dish',name:'Test noodles',price:12},quantity:2,finalPrice:12,selectedOptions:[]}]} lang={lang} onChangeQuantity={hit('quantity')} onRemoveItem={hit('remove')} onClearCart={hit('clear')} onBackToMenu={hit('menu')} onOpenCustomization={hit('edit')} onReviewOrder={hit('review')} diningMode="dine-in" selectedTable="A1"/>:<Payment orderId="test" onBack={hit('back')} onPaymentSubmit={hit('submit')} lang={lang}/>}</Shell>};createRoot(document.getElementById('root')).render(<Test/>);`);
const order={id:'test',orderNumber:'TEST-001',diningMode:'dine-in',table:{tableNumber:'A1'},status:'SERVED',paymentStatus:'UNPAID',items:[],subtotal:12,tax:0,serviceCharge:0,discount:0,total:12};
const browser=await chromium.launch();const results=[];
try{
 for(const [width,height] of [[1920,1080],[1366,768],[1024,768],[768,1024],[390,844]]){
  const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/hooks/useOrder*',route=>route.fulfill({contentType:'application/javascript',body:`export function useOrder(){return {order:${JSON.stringify(order)},isLoading:false,error:null}}`}));
  await page.route('**/src/hooks/usePaymentCapabilities*',route=>route.fulfill({contentType:'application/javascript',body:`const methods=[{method:'CASH',available:true},{method:'QR',available:true,providers:[{providerId:'test',displayName:'Test QR'}]}];export function usePaymentCapabilities(){return{methods,isLoading:false,error:null,refresh(){}}}`}));
  await page.route('**/src/hooks/usePaymentSummary*',route=>route.fulfill({contentType:'application/javascript',body:`export function usePaymentSummary(){return{summary:{orderTotal:12,remainingAmount:12,paidAmount:0,paymentStatus:'UNPAID',payments:[]},isLoading:false,error:null,refetch(){}}}`}));
  await page.goto('http://127.0.0.1:5173/test-results/uiux-modernization/screens.html');
  await page.waitForTimeout(500);if(errors.length)throw new Error(JSON.stringify(errors));
  await page.getByLabel('Amount applied to order').fill('10');await page.getByLabel('Cash received').fill('20');
  assert.equal(await page.getByLabel('Amount applied to order').inputValue(),'10');assert.equal(await page.getByLabel('Cash received').inputValue(),'20');
  await page.getByRole('button',{name:'QR / E-wallet',exact:true}).click();
  await page.getByLabel('Provider',{exact:true}).selectOption('test');await page.getByLabel('Payment reference').fill('TEST-REFERENCE');
  await page.getByRole('button',{name:'Confirm Payment',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Confirm QR / E-wallet Payment'});await modal.waitFor();assert((await modal.innerText()).includes('RM 10.00'));
  for(let i=0;i<12;i++){await page.keyboard.press(i<6?'Tab':'Shift+Tab');assert(await modal.evaluate(n=>n.contains(document.activeElement)));}
  await page.screenshot({path:fileURLToPath(new URL('qr-dialog-after-'+width+'.png',output))});await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});
  await page.getByLabel('Amount applied to order').fill('99');assert(await page.getByRole('button',{name:'Confirm Payment',exact:true}).isDisabled());await page.getByLabel('Amount applied to order').fill('10');
  await page.screenshot({path:fileURLToPath(new URL('payment-after-'+width+'.png',output))});
  if(width<768){const toggle=page.getByRole('button',{name:'Session actions'});assert.equal(await toggle.getAttribute('aria-expanded'),'false');await toggle.click();}
  await page.getByRole('button',{name:'Current Shift',exact:true}).click();assert.equal(await page.evaluate(()=>window.lastAction),'shift');
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Switch Staff',exact:true}).click();assert.equal(await page.evaluate(()=>window.lastAction),'shift');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Switch Staff',exact:true}).click();assert.equal(await page.evaluate(()=>window.lastAction),'switch');
  await page.goto('http://127.0.0.1:5173/test-results/uiux-modernization/screens.html?screen=cart');await page.getByRole('button',{name:/Increase quantity:/}).click();assert.equal(await page.evaluate(()=>window.lastAction),'quantity');
  await page.screenshot({path:fileURLToPath(new URL('cart-after-'+width+'.png',output))});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);results.push({viewport:[width,height],verification:'VERIFIED PASS',coverage:'Component fixtures only: payment labels, QR confirmation focus/Escape, overpayment disabled; shell handlers and switch confirmation; cart controls, no page overflow or runtime errors'});await page.close();
 }
 await writeFile(new URL('screen-results.json',output),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();await rm(html,{force:true});await rm(jsx,{force:true});}
