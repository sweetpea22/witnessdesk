import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DeskStore,ApiError} from '../src/server/store';
import {supportedAmounts,extractJson} from '../src/server/analysis';
import {DEMO_EVIDENCE} from '../src/shared/contracts';

const secret='r'.repeat(64);
const tip={contributorAlias:'Cindy',evidenceText:DEMO_EVIDENCE};
test('Cindy scenario computes $230,000 and follows changed payment input',()=>{
 const values=supportedAmounts(DEMO_EVIDENCE);
 assert.equal(values.paymentAmount! - values.invoiceAmount,230000);
 assert.equal(supportedAmounts(DEMO_EVIDENCE.replace('350,000','400,000')).paymentAmount,400000);
 assert.equal(supportedAmounts(DEMO_EVIDENCE.replace('INV-204','INV-999')).paymentAmount,null);
 assert.equal(supportedAmounts('Cindy says they stole $350,000').paymentAmount,null);
 assert.equal(supportedAmounts(DEMO_EVIDENCE.replace('350,000','350,000 EUR')).paymentAmount,null);
 assert.equal(supportedAmounts(DEMO_EVIDENCE+'\nAmount sent: USD 400,000').paymentAmount,null);
 assert.equal(supportedAmounts(DEMO_EVIDENCE.replace('INV-204','INV-2040')).paymentAmount,null);
});
test('sender authorization never grants a desk read, and sessions stay isolated',()=>{
 const store=new DeskStore();const one=store.create(secret);const two=store.create('s'.repeat(64));
 store.submit(one.sessionId,one.senderCapability,'tip-a',tip);
 assert.throws(()=>store.authorize(one.sessionId,one.senderCapability,'reader'),e=>e instanceof ApiError&&e.status===403);
 assert.throws(()=>store.authorize(one.sessionId,'s'.repeat(64),'reader'));
 assert.equal(store.authorize(two.sessionId,'s'.repeat(64),'reader').submissions.size,0);
});
test('retry gives the same receipt once; reused ID with changed evidence conflicts',()=>{
 const store=new DeskStore();const desk=store.create(secret);
 const first=store.submit(desk.sessionId,desk.senderCapability,'one',tip);
 const retry=store.submit(desk.sessionId,desk.senderCapability,'one',{...tip});
 assert.equal(first.isNew,true);assert.equal(retry.isNew,false);assert.deepEqual(first.receipt,retry.receipt);
 assert.equal(store.get(desk.sessionId).submissions.size,1);
 assert.throws(()=>store.submit(desk.sessionId,desk.senderCapability,'one',{...tip,evidenceText:'different'}),e=>e instanceof ApiError&&e.status===409);
});
test('reset rotates access and removes the old evidence session',()=>{
 const store=new DeskStore();const old=store.create(secret);store.submit(old.sessionId,old.senderCapability,'one',tip);
 const next=store.reset(old.sessionId,secret,'n'.repeat(64));
 assert.throws(()=>store.submit(old.sessionId,old.senderCapability,'two',tip),e=>e instanceof ApiError&&e.status===410);
 assert.equal(store.authorize(next.sessionId,'n'.repeat(64),'reader').submissions.size,0);
 assert.notEqual(next.senderCapability,old.senderCapability);
});
test('expired sessions reject access',()=>{
 const store=new DeskStore();const desk=store.create(secret);store.sessions.get(desk.sessionId)!.createdAt=Date.now()-9*3600000;
 assert.throws(()=>store.authorize(desk.sessionId,secret,'reader'),e=>e instanceof ApiError&&e.status===410);
});
test('model JSON parser handles thought wrappers and rejects missing JSON',()=>{
 assert.deepEqual(extractJson('<think>private reasoning</think>\n```json\n{"recipientIds":[]}\n```'),{recipientIds:[]});
 assert.throws(()=>extractJson('not a result'));
});
