import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runTinfoilReview} from '../src/server/tinfoil-review';
import type {Analysis,Submission} from '../src/shared/contracts';
import {DEMO_EVIDENCE} from '../src/shared/contracts';
const original:Analysis={kind:'possible_overpayment',summary:'Payment exceeds invoice.',invoiceAmount:120000,paymentAmount:350000,difference:230000,citations:[],openQuestions:['Was the payment approved?'],recipientIds:[],provider:'ollama',model:'local',durationMs:10};
const verified:Analysis={...original,provider:'tinfoil',model:'hosted',verification:{securityVerified:true,verifiedAt:'2026-11-07T19:30:00Z',configRepo:'demo/config',enclaveHost:'demo.example',releaseDigest:'digest',codeFingerprint:'fingerprint',enclaveFingerprint:'fingerprint'}};
const row=():Submission=>({id:'demo',tip:{contributorAlias:'Cindy',evidenceText:DEMO_EVIDENCE},receivedAt:'2026-11-07T19:30:00Z',state:'ready',analysis:original});

test('repeated review requests perform one verified inference and preserve local findings',async()=>{
 const submission=row();let count=0;
 let finish!:(analysis:Analysis)=>void;
 const pending=new Promise<Analysis>(resolve=>{finish=resolve;});
 const analyze:Parameters<typeof runTinfoilReview>[2]=async(tip,_profiles,provider)=>{count++;assert.equal(provider,'tinfoil');assert.equal(tip.evidenceText,DEMO_EVIDENCE);return pending;};
 const running=runTinfoilReview(submission,[],analyze);
 assert.equal(submission.tinfoilReview?.state,'analyzing');
 await runTinfoilReview(submission,[],analyze);
 assert.equal(count,1);
 finish(verified);await running;
 assert.equal(submission.tinfoilReview?.state,'ready');
 assert.equal(submission.analysis,original);
 assert.equal(submission.tinfoilReview?.analysis,verified);
 await runTinfoilReview(submission,[],analyze);assert.equal(count,1);
});

test('failed or unverified review reveals no provider details and can be retried without replacing local analysis',async()=>{
 const submission=row();
 await runTinfoilReview(submission,[],async()=>{throw new Error('secret key and private prompt');});
 assert.equal(submission.tinfoilReview?.state,'failed');
 assert.doesNotMatch(submission.tinfoilReview!.error!,/secret key|private prompt/);
 assert.equal(submission.analysis,original);
 await runTinfoilReview(submission,[],async()=>({...verified,verification:undefined}));
 assert.equal(submission.tinfoilReview?.state,'failed');
 await runTinfoilReview(submission,[],async()=>original);
 assert.equal(submission.tinfoilReview?.state,'failed');
 await runTinfoilReview(submission,[],async()=>verified);
 assert.equal(submission.tinfoilReview?.state,'ready');
 assert.equal(submission.analysis,original);
});

test('a review cannot send a submission while initial analysis is incomplete',async()=>{
 const submission=row();submission.state='analyzing';let called=false;
 await assert.rejects(runTinfoilReview(submission,[],async()=>{called=true;return verified;}),/Wait for the initial analysis/);
 assert.equal(called,false);assert.equal(submission.tinfoilReview,undefined);
});
