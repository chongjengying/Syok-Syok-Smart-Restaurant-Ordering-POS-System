import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { staffPosStatus,hasStaffBranch } from '../src/shared/staffPresentation.js';

const user = { status:'ACTIVE',pin_status:'ACTIVE',assignedBranchIds:['main','secondary'] };
assert.equal(staffPosStatus(user),'POS Ready');
assert.equal(hasStaffBranch(user,'secondary'),true);
assert.equal(hasStaffBranch(user,'other'),false);
for (const [change,label] of [
  [{status:'INACTIVE'},'Inactive'],[{pinLocked:true},'PIN Locked'],
  [{pin_status:'SETUP_REQUIRED'},'PIN Required'],[{pin_status:'TEMPORARY_RESET'},'PIN Change Required'],
  [{roleActive:false},'Role Inactive'],[{assignedBranchIds:[]},'Branch Required'],
  [{terminals:[{allowed:false}]},'No Eligible Terminal'],
]) assert.equal(staffPosStatus({...user,...change}),label);
const source=readFileSync(new URL('../src/components/admin/UserManagement.jsx',import.meta.url),'utf8');
const start=source.indexOf('  const deactivate =');
const end=source.indexOf('  const visibleUsers',start);
const calls=[];
const staff={...user,id:'staff',name:'Staff',role_name:'CASHIER',branch_id:'main'};
const run=new Function('deactivating','reactivating','state','setDeactivating','setReactivating',source.slice(start,end)+'\nreturn {deactivate,reactivate};');
const actions=run(staff,staff,{edit:async input=>{calls.push(input);return{};}},()=>{},()=>{});
await actions.deactivate();
await actions.reactivate();
assert.deepEqual(calls.map(call=>call.additionalBranchIds),[['secondary'],['secondary']]);
assert.deepEqual(calls.map(call=>call.active),[false,true]);
console.log('Staff readiness, secondary-branch filtering, and activation assignment preservation passed');
