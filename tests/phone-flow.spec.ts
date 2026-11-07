import { test, expect, devices, type Page, type TestInfo } from '@playwright/test';
import { DEMO_CONTEXT, DEMO_EVIDENCE } from '../src/shared/contracts';

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('the explicit side-by-side demo pairs both panels with the active desk, including after a stale saved phone pairing', async ({ page }) => {
  async function expectSharedSession() {
    await expect(page.frameLocator('.preview-phone iframe').locator('.contributor-form')).toHaveAttribute('aria-busy', 'false');
    await expect(page.frameLocator('.preview-desk iframe').getByText('Desk connected', { exact: true })).toBeVisible();
    const shared = await page.evaluate(() => ({
      desk: JSON.parse(localStorage.getItem('witness-desk.session.v1') || 'null'),
      phone: JSON.parse(sessionStorage.getItem('witness-contributor-pair') || 'null'),
    }));
    expect(shared.phone).toEqual({ sessionId: shared.desk.sessionId, senderCapability: shared.desk.senderCapability });
  }
  await page.goto('/preview');
  await expectSharedSession();
  await page.evaluate(() => sessionStorage.setItem('witness-contributor-pair', JSON.stringify({ sessionId: 'old-desk', senderCapability: 'old-link' })));
  await page.reload();
  await expectSharedSession();
});

test('Cindy sends encrypted evidence from a paired phone; a lost receipt retry creates one real analyzed desk record', async ({ browser, page: desk, baseURL }, testInfo) => {
  const provider = await desk.request.get('/api/status').then(response => response.json());
  expect(provider.mode, 'This test checks the actual local encrypted intake transport.').toBe('local-demo');
  expect(provider.analysisProvider, 'Run this test with the actual Ollama provider.').toBe('ollama');
  expect(provider.ollamaAvailable, 'Start Ollama before the real inference flow.').toBe(true);

  const phoneContext = await browser.newContext({ ...devices['iPhone 13'], baseURL });
  const phone = await phoneContext.newPage();
  try {
    const encryptedBodies: Array<Record<string, unknown>> = [];
    phone.on('request', request => {
      if (new URL(request.url()).pathname === '/api/secure' && request.method() === 'POST') {
        encryptedBodies.push(request.postDataJSON());
      }
    });

    await test.step('A direct phone visit does not create or expose a desk session', async () => {
      await phone.goto('/contribute');
      await expect(phone.getByText('Scan the desk’s QR code to connect.')).toBeVisible();
      await expect(phone.getByRole('button', { name: 'Review' })).toBeDisabled();
      expect(encryptedBodies).toHaveLength(0);
      expect(await phone.evaluate(() => localStorage.getItem('witness-desk.session.v1'))).toBeNull();
    });

    await test.step('The laptop pairs a separate phone with submission access', async () => {
      await desk.goto('/desk');
      await expect(desk.getByText('Desk connected', { exact: true })).toBeVisible();
      await desk.getByRole('button', { name: 'Connect a phone' }).click();
      const link = await desk.getByRole('link', { name: 'Open contributor view' }).getAttribute('href');
      expect(link).toBeTruthy();
      const pairing = new URL(link!);
      const parameters = new URLSearchParams(pairing.hash.slice(1));
      expect(parameters.get('session')).toBeTruthy();
      expect(parameters.get('sender')).toBeTruthy();
      expect(parameters.has('reader')).toBe(false);
      await phone.goto(`/contribute${pairing.hash}`);
      await expect(phone.locator('.contributor-form')).toHaveAttribute('aria-busy', 'false');
      await expect(phone).toHaveURL(/\/contribute$/);
      expect(await phone.evaluate(() => localStorage.getItem('witness-desk.session.v1'))).toBeNull();
      await desk.getByRole('button', { name: 'Close pairing' }).click();
    });

    await test.step('Cindy loads, edits, and reviews exactly what will be shared', async () => {
      await phone.getByRole('textbox', { name: 'Evidence' }).fill(DEMO_EVIDENCE);
      await phone.getByRole('textbox', { name: 'Context optional' }).fill(DEMO_CONTEXT);
      await expect(phone.getByRole('textbox', { name: 'Evidence' })).toHaveValue(DEMO_EVIDENCE);
      await expect(phone.getByRole('textbox', { name: 'Context optional' })).toHaveValue(DEMO_CONTEXT);
      await capture(phone, testInfo, 'phone-compose');
      await phone.getByRole('button', { name: 'Review' }).click();
      await expect(phone.locator('.contributor-document pre')).toHaveText(DEMO_EVIDENCE);
      await phone.getByRole('button', { name: 'Back' }).click();
      await phone.getByRole('textbox', { name: 'Context optional' }).fill(`${DEMO_CONTEXT}\nPlease compare the invoice reference before drawing conclusions.`);
      await phone.getByRole('button', { name: 'Review' }).click();
      await expect(phone.locator('.contributor-review-context')).toContainText('Please compare the invoice reference before drawing conclusions.');
      expect(encryptedBodies).toHaveLength(0);
      await capture(phone, testInfo, 'phone-review');
    });

    await test.step('A lost confirmation can be retried without a duplicate submission', async () => {
      let dropped = false;
      await phone.route('**/api/secure', async route => {
        if (!dropped) {
          dropped = true;
          // Deliver to the real server, then simulate losing its response.
          await route.fetch();
          await route.abort('failed');
          return;
        }
        await route.continue();
      });
      await phone.getByRole('button', { name: 'Send' }).click();
      await expect(phone.getByText('Please try again.')).toBeVisible();
      await expect(phone.locator('.contributor-document pre')).toHaveText(DEMO_EVIDENCE);
      await expect(desk.locator('.desk-inbox-card')).toHaveCount(1);
      await phone.getByRole('button', { name: 'Send' }).click();
      await expect(phone.getByRole('heading', { name: 'Received' })).toBeVisible();
      await expect(desk.locator('.desk-inbox-card')).toHaveCount(1);
      expect(encryptedBodies).toHaveLength(2);
      for (const envelope of encryptedBodies) {
        expect(Object.keys(envelope)).toEqual(['ciphertext']);
        expect(envelope.ciphertext).toEqual(expect.stringContaining('-----BEGIN PGP MESSAGE-----'));
        const wire = JSON.stringify(envelope);
        expect(wire).not.toContain('Cindy');
        expect(wire).not.toContain('350,000');
        expect(wire).not.toContain('Harbor Works');
      }
      await capture(phone, testInfo, 'phone-receipt');
    });

    await test.step('The local model derives the $230,000 difference with inspectable evidence', async () => {
      await expect(desk.locator('.desk-inbox-card .desk-state')).toHaveText('Ready to review', { timeout: 150_000 });
      await expect(desk.locator('.desk-amount-grid')).toContainText('$120,000');
      await expect(desk.locator('.desk-amount-grid')).toContainText('$350,000');
      await expect(desk.locator('.desk-amount-gap')).toContainText('$230,000');
      await expect(desk.locator('.desk-analysis-byline')).toContainText('Ollama');
      await expect(desk.locator('.desk-citation')).toHaveCount(2);
      await desk.locator('.desk-source-button').first().click();
      await expect(desk.getByRole('dialog', { name: 'Source inspector' })).toBeVisible();
      await expect(desk.locator('.desk-inspector-document')).toContainText('INV-204');
      await desk.getByRole('button', { name: 'Close source inspector' }).click();
      await desk.getByText('Original submission', { exact: true }).click();
      await expect(desk.locator('.desk-original pre')).toHaveText(DEMO_EVIDENCE);
      await capture(desk, testInfo, 'desk-analyzed');
    });

    await test.step('A changed payment is analyzed anew and its citation opens the payment record', async () => {
      const previousReference = await phone.locator('.contributor-receipt dd').first().textContent();
      const equalPayment = DEMO_EVIDENCE.replace('USD 350,000', 'USD 120,000');
      await phone.getByRole('button', { name: 'New submission' }).click();
      await phone.getByRole('textbox', { name: 'Evidence' }).fill(DEMO_EVIDENCE);
      await phone.getByRole('textbox', { name: 'Context optional' }).fill(DEMO_CONTEXT);
      await phone.getByRole('textbox', { name: 'Evidence' }).fill(equalPayment);
      await phone.getByRole('textbox', { name: 'Context optional' }).fill('This payment appears to equal the invoice. Please check the actual record.');
      await phone.getByRole('button', { name: 'Review' }).click();
      await expect(phone.locator('.contributor-document pre')).toHaveText(equalPayment);
      await phone.getByRole('button', { name: 'Send' }).click();
      await expect(phone.getByRole('heading', { name: 'Received' })).toBeVisible();
      await expect(phone.locator('.contributor-receipt dd').first()).not.toHaveText(previousReference!);
      await expect(desk.locator('.desk-inbox-card')).toHaveCount(2);
      await expect(desk.locator('.desk-inbox-card').first().locator('.desk-state')).toHaveText('Ready to review', { timeout: 150_000 });
      await expect(desk.locator('.desk-inbox-card').first().locator('strong')).toHaveText('Payment matches invoice');
      await expect(desk.getByRole('heading', { name: 'No payment gap shown', exact: true })).toBeVisible();
      await expect(desk.locator('.desk-amount-grid strong')).toHaveText(['$120,000', '$120,000', '$0']);
      await expect(desk.locator('.desk-amount-gap small')).toHaveText('Amounts match');
      await expect(desk.locator('.desk-amount-grid')).not.toContainText('$230,000');
      await expect(desk.locator('.desk-analysis-byline')).toContainText('Ollama');
      await desk.locator('.desk-citations .desk-source-button').nth(1).click();
      await expect(desk.locator('.desk-inspector-document')).toContainText('PAY-882');
      await expect(desk.locator('.desk-inspector-document')).toContainText('Amount sent: USD 120,000');
      await capture(desk, testInfo, 'desk-equal-payment-source');
      await desk.getByRole('button', { name: 'Close source inspector' }).click();
      await capture(desk, testInfo, 'desk-equal-payment');
    });
  } finally {
    await phoneContext.close();
  }
});
