import { test, expect, devices, type Browser, type Page, type TestInfo } from '@playwright/test';
import { DEMO_CONTEXT } from '../src/shared/contracts';

type Pairing = { sessionId: string; senderCapability: string };

async function pairPhone(desk: Page, phone: Page): Promise<Pairing> {
  await desk.goto('/desk');
  await expect(desk.getByText('Desk connected', { exact: true })).toBeVisible();
  await desk.getByRole('button', { name: 'Connect a phone' }).click();
  const link = await desk.getByRole('link', { name: 'Open contributor view' }).getAttribute('href');
  expect(link).toBeTruthy();
  const hash = new URL(link!).hash;
  const parameters = new URLSearchParams(hash.slice(1));
  const pairing = { sessionId: parameters.get('session')!, senderCapability: parameters.get('sender')! };
  expect(pairing.sessionId).toBeTruthy();
  expect(pairing.senderCapability).toBeTruthy();
  expect(parameters.has('reader')).toBe(false);
  await phone.goto(`/contribute${hash}`);
  await expect(phone.locator('.contributor-form')).toHaveAttribute('aria-busy', 'false');
  await expect(phone).toHaveURL(/\/contribute$/);
  await desk.getByRole('button', { name: 'Close pairing' }).click();
  return pairing;
}

/** A browser-rendered document fixture, with no OCR stub or supplied transcript. */
async function paymentPhoto(browser: Browser, testInfo: TestInfo): Promise<Buffer> {
  const context = await browser.newContext({ viewport: { width: 1200, height: 1300 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await page.setContent(`<!doctype html><html><head><style>
      *{box-sizing:border-box}body{margin:0;background:white;color:#121212;font-family:Arial,sans-serif}
      main{width:1200px;min-height:1300px;padding:80px 75px;border:16px solid #e5e5e5}
      .demo{font-size:25px;letter-spacing:3px;margin-bottom:38px}h1{font-size:54px;margin:0 0 18px}
      .reference{font-size:44px;margin:0 0 50px}dl{margin:0}dl>div{border-top:2px solid #ccc;padding:28px 0}
      dt{font-size:29px;color:#444;margin-bottom:12px}dd{font-size:43px;font-weight:600;margin:0}
      .amount dd{font-size:64px}.footer{margin-top:34px;font-size:24px;color:#555}
    </style></head><body><main>
      <div class="demo">FICTIONAL DEMO RECORD</div>
      <h1>PAYMENT CONFIRMATION</h1><p class="reference">PAY-882</p>
      <dl><div><dt>Beneficiary</dt><dd>HarborWorks</dd></div>
      <div><dt>Invoice reference</dt><dd>INV-204</dd></div>
      <div><dt>Contract</dt><dd>K-17</dd></div>
      <div><dt>Date sent</dt><dd>2026-11-05</dd></div>
      <div class="amount"><dt>Amount sent</dt><dd>USD 350,000</dd></div>
      <div><dt>Status</dt><dd>Completed</dd></div></dl>
      <p class="footer">Synthetic record for the Witness Desk demo.</p>
    </main></body></html>`);
    const image = await page.screenshot({ fullPage: true, type: 'png' });
    await testInfo.attach('synthetic-payment-photo', { body: image, contentType: 'image/png' });
    return image;
  } finally { await context.close(); }
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('unsupported and malformed photos stay on the phone without an inference request', async ({ browser, page: desk, baseURL }) => {
  const phoneContext = await browser.newContext({ ...devices['iPhone 13'], baseURL });
  const phone = await phoneContext.newPage();
  try {
    await pairPhone(desk, phone);
    let secureRequests = 0;
    phone.on('request', request => {
      if (new URL(request.url()).pathname === '/api/secure' && request.method() === 'POST') secureRequests++;
    });
    await phone.getByRole('textbox', { name: 'Evidence' }).fill('Keep this draft while I check the photograph.');
    const choose = phone.getByLabel('Choose photo', { exact: true });
    await choose.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('This is not a photograph.') });
    await expect(phone.getByRole('alert')).toContainText('Choose an image file.');
    await expect(phone.getByRole('textbox', { name: 'Evidence' })).toHaveValue('Keep this draft while I check the photograph.');
    expect(secureRequests).toBe(0);

    await choose.setInputFiles({ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not-a-decodable-jpeg') });
    await expect(phone.getByRole('alert')).toContainText('This browser could not open that image.');
    await expect(phone.getByRole('textbox', { name: 'Evidence' })).toHaveValue('Keep this draft while I check the photograph.');
    expect(secureRequests).toBe(0);
  } finally { await phoneContext.close(); }
});

test('Cindy reviews a real local vision description and submits an encrypted photo that only her desk can read', async ({ browser, page: desk, baseURL }, testInfo) => {
  test.setTimeout(480_000);
  const status = await desk.request.get('/api/status').then(response => response.json());
  expect(status.mode, 'This flow verifies actual encrypted local intake.').toBe('local-demo');
  expect(status.analysisProvider, 'Use the real local analysis provider for this test.').toBe('ollama');
  expect(status.ollamaAvailable).toBe(true);

  const fixture = await paymentPhoto(browser, testInfo);
  const phoneContext = await browser.newContext({ ...devices['iPhone 13'], baseURL });
  const phone = await phoneContext.newPage();
  try {
    const pairing = await pairPhone(desk, phone);
    const reviewedAddition = 'Reviewed by Cindy: compare this payment with invoice INV-204 before drawing conclusions.';
    const wireRecords: Array<{ path: string; keys: string[]; armored: boolean; leaks: string[] }> = [];
    phone.on('request', request => {
      if (request.method() !== 'POST') return;
      const wire = request.postData() || '';
      let envelope: Record<string, unknown> = {};
      try { envelope = JSON.parse(wire); } catch { /* A non-JSON upload should fail the assertions below. */ }
      wireRecords.push({
        path: new URL(request.url()).pathname,
        keys: Object.keys(envelope),
        armored: typeof envelope.ciphertext === 'string' && envelope.ciphertext.startsWith('-----BEGIN PGP MESSAGE-----'),
        leaks: ['data:image/', 'PAY-882', 'HarborWorks', '350,000', 'Cindy', reviewedAddition].filter(value => wire.includes(value)),
      });
    });

    await test.step('A real image is described by the local vision model', async () => {
      await phone.getByRole('textbox', { name: 'Context optional' }).fill(DEMO_CONTEXT);
      await phone.getByLabel('Choose photo', { exact: true }).setInputFiles({ name: 'PAY-882.png', mimeType: 'image/png', buffer: fixture });
      await expect(phone.getByRole('button', { name: 'Describe on laptop', exact: true })).toBeEnabled();
      await phone.getByRole('button', { name: 'Describe on laptop', exact: true }).click();
      await expect(phone.locator('.contributor-photo-description')).toBeVisible({ timeout: 240_000 });
      await expect(phone.locator('.contributor-photo-description')).toContainText('Description');
      await expect(phone.getByRole('textbox', { name: 'Evidence' })).toHaveValue(/350[\s,]?000/, { timeout: 240_000 });
      await capture(phone, testInfo, 'phone-real-vision-description');
    });

    let reviewedText = '';
    await test.step('Cindy edits the extracted evidence before approving it', async () => {
      const evidence = phone.getByRole('textbox', { name: 'Evidence' });
      const extracted = await evidence.inputValue();
      expect(extracted).toMatch(/350[\s,]?000/);
      reviewedText = `${extracted}\n\n${reviewedAddition}`;
      await evidence.fill(reviewedText);
      await phone.getByRole('button', { name: 'Review' }).click();
      await expect(phone.locator('.contributor-document pre')).toHaveText(reviewedText);
      await expect(phone.locator('.contributor-review-photo img')).toBeVisible();
      await capture(phone, testInfo, 'phone-photo-review');
      await phone.getByRole('button', { name: 'Send' }).click();
      await expect(phone.getByRole('heading', { name: 'Received' })).toBeVisible();
      expect(wireRecords.length).toBeGreaterThanOrEqual(2);
      for (const wire of wireRecords) {
        expect(wire.path).toBe('/api/secure');
        expect(wire.keys).toEqual(['ciphertext']);
        expect(wire.armored).toBe(true);
        expect(wire.leaks).toEqual([]);
      }
    });

    await test.step('The desk retains model provenance separately from reviewed text', async () => {
      await expect(desk.locator('.desk-inbox-card')).toHaveCount(1);
      await expect(desk.getByRole('button', { name: 'View submitted photo', exact: true })).toBeVisible();
      const snapshot = await desk.evaluate(async () => {
        const modulePath = '/src/shared/api.ts';
        const api = await import(modulePath);
        const session = JSON.parse(localStorage.getItem('witness-desk.session.v1')!);
        return api.readDesk(session);
      });
      expect(snapshot.submissions).toHaveLength(1);
      const submission = snapshot.submissions[0];
      expect(submission.photo.provider).toBe('ollama');
      expect(submission.photo.model).toBe('qwen2.5vl:3b');
      expect(submission.photo.durationMs).toBeGreaterThan(0);
      expect(submission.photo.description.length).toBeGreaterThan(10);
      expect(submission.photo.extractedText).toMatch(/350[\s,]?000/);
      expect(submission.photo.extractedText).not.toContain(reviewedAddition);
      expect(submission.tip.evidenceText).toBe(reviewedText);
      expect(submission.tip.photoId).toBe(submission.photo.id);
      expect(JSON.stringify(snapshot).includes('data:image/'), 'Desk polling carries metadata, not image bodies.').toBe(false);

      const denied = await phone.evaluate(async ({ sessionId, senderCapability, photoId }) => {
        const modulePath = '/src/shared/api.ts';
        const api = await import(modulePath);
        try {
          await api.secureJson('/api/desk/photo', { sessionId, readerSecret: senderCapability, photoId });
          return { allowed: true, code: 200 };
        } catch (error) { return { allowed: false, code: (error as { code?: number }).code }; }
      }, { ...pairing, photoId: submission.photo.id });
      expect(denied).toEqual({ allowed: false, code: 403 });
      expect(await phone.evaluate(() => localStorage.getItem('witness-desk.session.v1'))).toBeNull();

      await desk.getByRole('button', { name: 'View submitted photo', exact: true }).click();
      const dialog = desk.getByRole('dialog', { name: 'Submitted photo evidence', exact: true });
      await expect(dialog).toBeVisible();
      const photo = dialog.getByRole('img', { name: 'Photo submitted by Cindy', exact: true });
      await expect(photo).toBeVisible();
      await expect(photo).toHaveAttribute('src', /^data:image\/(jpeg|png|webp);base64,/);
      await expect.poll(() => photo.evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
      await expect(dialog).toContainText('Model description · unverified');
      await expect(dialog).toContainText('Text the model read · unverified');
      await expect(dialog).toContainText('Text submitted after review');
      await expect(dialog).toContainText(reviewedAddition);
      await capture(desk, testInfo, 'desk-reader-only-photo');
      await desk.getByRole('button', { name: 'Close submitted photo', exact: true }).click();
      await expect(dialog).toHaveCount(0);

      await expect(desk.locator('.desk-inbox-card .desk-state')).toHaveText('Ready to review', { timeout: 150_000 });
      await expect(desk.locator('.desk-amount-grid')).toContainText('$350,000');
      await expect(desk.locator('.desk-amount-gap')).toContainText('$230,000');
      await capture(desk, testInfo, 'desk-photo-derived-comparison');
    });
  } finally { await phoneContext.close(); }
});
