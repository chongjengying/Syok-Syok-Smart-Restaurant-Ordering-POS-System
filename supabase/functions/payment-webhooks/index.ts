import {createClient} from 'npm:@supabase/supabase-js@2';
import {jsonResponse} from '../_shared/http.ts';

const encoder=new TextEncoder();
const hex=(bytes:ArrayBuffer)=>[...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');
const equal=(left:string,right:string)=>{if(left.length!==right.length)return false;let value=0;for(let i=0;i<left.length;i+=1)value|=left.charCodeAt(i)^right.charCodeAt(i);return value===0;};

Deno.serve(async request=>{
 if(request.method!=='POST')return jsonResponse(405,{error:'Method not allowed.'});
 const url=Deno.env.get('SUPABASE_URL');const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');const secret=Deno.env.get('PAYMENT_WEBHOOK_SECRET');const provider=Deno.env.get('PAYMENT_GATEWAY_PROVIDER')||'EXTERNAL_GATEWAY';
 if(!url||!serviceKey||!secret)return jsonResponse(503,{error:'Webhook configuration is incomplete.'});
 const raw=await request.text();const supplied=(request.headers.get('x-pos-signature')||'').toLowerCase().replace(/^sha256=/,'');
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const expected=hex(await crypto.subtle.sign('HMAC',key,encoder.encode(raw)));
 if(!supplied||!equal(supplied,expected))return jsonResponse(401,{error:'Webhook signature is invalid.'});
 let body:Record<string,unknown>;try{const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();body=value;}catch{return jsonResponse(400,{error:'Webhook body must be valid JSON.'});}
 const eventId=typeof body.eventId==='string'?body.eventId.trim():'';const eventType=typeof body.eventType==='string'?body.eventType.trim():'';const reference=typeof body.transactionReference==='string'?body.transactionReference.trim():'';const status=typeof body.status==='string'?body.status.toUpperCase():'';const amount=Number(body.amount);const currency=typeof body.currency==='string'?body.currency.toUpperCase():'MYR';
 if(!eventId||!eventType||!reference||!['CONFIRMED','FAILED','REFUNDED'].includes(status)||!Number.isFinite(amount)||amount<=0||!/^[A-Z]{3}$/.test(currency))return jsonResponse(400,{error:'Webhook event fields are invalid.'});
 const digest=hex(await crypto.subtle.digest('SHA-256',encoder.encode(raw)));const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const{data:payment}=await admin.from('payments').select('id,order_id,amount,status,currency_code').eq('transaction_reference',reference).maybeSingle();
 const matched=Boolean(payment)&&Number(payment.amount)===amount&&String(payment.currency_code||'MYR')===currency;const processingStatus=matched?'APPLIED':'PENDING';
 const{error}=await admin.from('payment_gateway_events').upsert({provider,event_id:eventId,event_type:eventType,transaction_reference:reference,order_id:payment?.order_id||null,amount,currency_code:currency,verification_status:'VERIFIED',processing_status:processingStatus,payload_digest:digest,error:matched?null:'No exact local payment match; manual reconciliation required.',processed_at:matched?new Date().toISOString():null},{onConflict:'provider,event_id',ignoreDuplicates:true});
 if(error){console.error('Unable to persist verified payment webhook',error);return jsonResponse(500,{error:'Webhook could not be recorded.'});}
 return jsonResponse(202,{data:{accepted:true,matched}});
});
