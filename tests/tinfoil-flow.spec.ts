import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {DEMO_CONTEXT,DEMO_EVIDENCE} from '../src/shared/contracts';

test('desk requests a verified Tinfoil review, exports a cited brief, and reconnects after session expiry',async({page},testInfo)=>{
 const status=await page.request.get('/api/status').then(r=>r.json());
 expect(status.analysisProvider).toBe('ollama');
 expect(status.tinfoilConfigured,'A real configured Tinfoil key is required for this integration test.').toBe(true);
 await page.goto('/preview');
 const phone=page.frameLocator('.preview-phone iframe');
 const desk=page.frameLocator('.preview-desk iframe');
 await expect(phone.locator('.contributor-form')).toHaveAttribute('aria-busy','false');
 await expect(phone.getByRole('heading',{name:'What are you witnessing?'})).toBeVisible();
 await phone.getByRole('textbox',{name:'Evidence',exact:true}).fill(DEMO_EVIDENCE);
 await phone.getByRole('textbox',{name:'Context optional'}).fill(DEMO_CONTEXT);
 await phone.getByRole('button',{name:'Review',exact:true}).click();
 await phone.getByRole('button',{name:'Send',exact:true}).click();
 await expect(phone.getByRole('heading',{name:'Received',exact:true})).toBeVisible();
 await expect(desk.locator('.desk-inbox-card .desk-state')).toHaveText('Ready to review',{timeout:150000});
 const before=await page.evaluate(async()=>{
  const modulePath='/src/shared/api.ts';const api=await import(modulePath);
  const session=JSON.parse(localStorage.getItem('witness-desk.session.v1')!);
  const snapshot=await api.readDesk(session);return snapshot.submissions[0];
 });
 expect(before.analysis.provider).toBe('ollama');
 expect(before.tinfoilReview).toBeUndefined();
 const denied=await page.evaluate(async(id)=>{
  const modulePath='/src/shared/api.ts';const api=await import(modulePath);
  const session=JSON.parse(localStorage.getItem('witness-desk.session.v1')!);
  try{await api.secureJson('/api/desk/tinfoil-review',{sessionId:session.sessionId,readerSecret:session.senderCapability,submissionId:id});return 200;}
  catch(e){return (e as {code?:number}).code;}
 },before.id);
 expect(denied).toBe(403);
 const plain=await page.request.post('/api/desk/tinfoil-review',{data:{}});expect(plain.status()).toBe(403);
 await desk.getByRole('button',{name:'Review with Tinfoil',exact:true}).click();
 await expect(desk.getByText('Review complete',{exact:true})).toBeVisible({timeout:150000});
 await expect(desk.getByText('Inference verified',{exact:true})).toBeVisible();
 const after=await page.evaluate(async()=>{
  const modulePath='/src/shared/api.ts';const api=await import(modulePath);
  const session=JSON.parse(localStorage.getItem('witness-desk.session.v1')!);
  return (await api.readDesk(session)).submissions[0];
 });
 expect(after.analysis).toEqual(before.analysis);
 expect(after.tinfoilReview.state).toBe('ready');
 const analysis=after.tinfoilReview.analysis;
 expect(analysis.provider).toBe('tinfoil');
 expect(analysis.verification.securityVerified).toBe(true);
 expect(analysis.verification.releaseDigest).toBeTruthy();
 expect(analysis.difference).toBe(230000);
 expect(analysis.citations[1].quote).toBe(DEMO_EVIDENCE);
 await desk.getByText('Inference verified',{exact:true}).click();
 await page.screenshot({path:testInfo.outputPath('verified-review.png'),fullPage:true});
 const downloadPromise=page.waitForEvent('download');
 await desk.getByRole('button',{name:'Download case brief',exact:true}).click();
 const download=await downloadPromise;
 await download.saveAs(testInfo.outputPath('cindy-case-brief.md'));
 const downloadedPath=await download.path();expect(downloadedPath).toBeTruthy();
 const brief=await readFile(downloadedPath!,'utf8');
 expect(brief).toContain('$230,000');expect(brief).toContain('INV-204');
 expect(brief).toContain('PAY-882');expect(brief).toContain('Tinfoil');
 expect(brief).toContain(analysis.verification.releaseDigest);
 const session=await page.evaluate(()=>JSON.parse(localStorage.getItem('witness-desk.session.v1')!));
 expect(brief).not.toContain(session.readerSecret);expect(brief).not.toContain(session.senderCapability);
 expect(brief).not.toContain('data:image/');
 await testInfo.attach('case-brief',{body:brief,contentType:'text/markdown'});
 const metadata=JSON.stringify({provider:analysis.provider,model:analysis.model,durationMs:analysis.durationMs,verification:analysis.verification,difference:analysis.difference,recipientIds:analysis.recipientIds},null,2);
 await writeFile(testInfo.outputPath('verified-review-metadata.json'),metadata);
 await testInfo.attach('verified-review-metadata',{body:metadata,contentType:'application/json'});

 // Expire the desk behind its current view, as another tab/reset or a restart would.
 await page.evaluate(async()=>{
  const modulePath='/src/shared/api.ts';const api=await import(modulePath);
  await api.resetDesk(JSON.parse(localStorage.getItem('witness-desk.session.v1')!));
 });
 await expect(desk.getByRole('button',{name:'Reconnect desk',exact:true})).toBeVisible();
 await desk.getByRole('button',{name:'Reconnect desk',exact:true}).click();
 await expect(desk.getByRole('dialog',{name:'Connect a phone'})).toBeVisible();
 await expect(desk.locator('.desk-inbox-card')).toHaveCount(0);
 await expect(desk.getByText('Desk connected',{exact:true})).toBeVisible();
});
