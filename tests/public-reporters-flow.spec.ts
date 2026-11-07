import { test, expect, type Frame, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DEMO_CONTEXT, DEMO_EVIDENCE, INVOICE_TEXT, type DeskSnapshot } from '../src/shared/contracts';

// Browser traces and automatic failure screenshots can contain pairing capabilities.
test.use({ trace: 'off', screenshot: 'off' });

const seeds = JSON.parse(readFileSync(new URL('../fixtures/public-reporter-seeds.json', import.meta.url), 'utf8')) as {
  reporters: Array<{ id: string; name: string; cohortIds: string[]; sources: Array<{ id: string; url: string; excerpt: string }> }>;
};

function deskFrame(page: Page): Frame {
  const frame = page.frames().find(frame => { try { return new URL(frame.url()).pathname === '/desk'; } catch { return false; } });
  if (!frame) throw new Error('The preview desk frame is unavailable.');
  return frame;
}

async function snapshot(page: Page): Promise<DeskSnapshot> {
  return deskFrame(page).evaluate(async () => {
    const modulePath = '/src/shared/api.ts';
    const api = await import(modulePath);
    const session = JSON.parse(localStorage.getItem('witness-desk.session.v1')!);
    return api.readDesk(session);
  });
}

async function capture(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, mask: [
    page.locator('[role="alert"], .app-loading'),
    page.frameLocator('.preview-phone iframe').locator('[role="alert"]'),
    page.frameLocator('.preview-desk iframe').locator('[role="alert"], .desk-modal-backdrop'),
  ] });
  await info.attach(name, { path, contentType: 'image/png' });
}

test('real public reporter matching produces a reviewed recipient-specific story packet without onward delivery', async ({ page }, info) => {
  test.setTimeout(420_000);
  const status = await page.request.get('/api/status').then(response => response.json());
  expect(status.mode).toBe('local-demo');
  expect(status.analysisProvider).toBe('ollama');
  expect(status.ollamaAvailable).toBe(true);

  await page.goto('/preview');
  const phone = page.frameLocator('.preview-phone iframe');
  const desk = page.frameLocator('.preview-desk iframe');
  await expect(phone.getByRole('heading', { name: 'What are you witnessing?', exact: true })).toBeVisible();
  await expect(phone.locator('.contributor-form')).toHaveAttribute('aria-busy', 'false');
  await expect(desk.getByText('Desk connected', { exact: true })).toBeVisible();
  await expect(desk.locator('.desk-inbox-card')).toHaveCount(0);

  await test.step('Cindy submits the fictional payment through normal encrypted intake', async () => {
    await phone.getByRole('textbox', { name: 'Evidence', exact: true }).fill(DEMO_EVIDENCE);
    await phone.getByRole('textbox', { name: /^Context/ }).fill(DEMO_CONTEXT);
    await phone.getByRole('button', { name: 'Review', exact: true }).click();
    await expect(phone.locator('.contributor-document pre')).toHaveText(DEMO_EVIDENCE);
    await phone.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(phone.getByRole('heading', { name: 'Received', exact: true })).toBeVisible();
    await expect(desk.locator('.desk-inbox-card .desk-state')).toHaveText('Ready to review', { timeout: 150_000 });
    await expect(desk.locator('.desk-amount-grid strong')).toHaveText(['$120,000', '$350,000', '$230,000']);
    const initial = await snapshot(page);
    expect(initial.submissions[0].analysis?.provider).toBe('ollama');
    expect(initial.reporterNetwork?.preparation.state).toBe('ready');
    expect(initial.reporterNetwork?.preparation.provider).toBe('darkbloom');
    expect(initial.reporterNetwork?.profiles.length).toBe(seeds.reporters.length);
  });

  await test.step('The local model selects real reporters only within the chosen cohort', async () => {
    const panel = desk.getByRole('region', { name: 'Public reporter matches', exact: true });
    await panel.getByLabel('Match cohort', { exact: true }).selectOption('us-finance');
    await panel.getByRole('button', { name: 'Find matches locally', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).submissions[0].reporterMatch?.state, { timeout: 200_000, intervals: [1_000, 2_000] }).toBe('ready');
    const run = (await snapshot(page)).submissions[0].reporterMatch!;
    expect(run.provider).toBe('ollama');
    expect(run.model).toBeTruthy();
    expect(run.durationMs).toBeGreaterThan(0);
    expect(run.cohortIds).toEqual(['us-finance']);
    expect(run.matches!.length).toBeGreaterThan(0);
    expect(run.profiles!.every(profile => profile.cohortIds?.includes('us-finance'))).toBe(true);
    for (const match of run.matches!) {
      const seed = seeds.reporters.find(profile => profile.id === match.recipientId);
      expect(!!seed && seed.cohortIds.includes('us-finance')).toBe(true);
      const profile = run.profiles!.find(profile => profile.id === match.recipientId)!;
      expect(profile.preparationProvider).toBe('darkbloom');
      expect(match.sourceIds.length).toBeGreaterThan(0);
      for (const id of match.sourceIds) {
        const source = profile.sources.find(source => source.id === id);
        const citation = profile.supportingCitations.find(citation => citation.documentId === id);
        const original = seed!.sources.find(source => source.id === id);
        expect(!!source && !!citation && !!original).toBe(true);
        expect(source!.kind).toBe('public-web');
        expect(source!.url).toBe(original!.url);
        expect(citation!.quote).toBe(original!.excerpt);
      }
    }
    await expect(panel.locator('.desk-ranked-matches > li')).toHaveCount(run.matches!.length);

    const first = run.matches![0];
    const profile = run.profiles!.find(profile => profile.id === first.recipientId)!;
    const row = panel.locator('.desk-ranked-matches > li').first();
    await row.locator('.desk-match-person button').click();
    const inspector = desk.getByRole('dialog', { name: 'Source inspector', exact: true });
    await expect(inspector.getByRole('heading', { name: profile.name, exact: true })).toBeVisible();
    await expect(inspector.getByRole('link', { name: 'Public contact page', exact: true })).toHaveAttribute('href', profile.publicContact!.url);
    await inspector.getByRole('button', { name: 'Close source inspector', exact: true }).click();
    const source = profile.sources.find(source => source.id === first.sourceIds[0])!;
    await row.locator('.desk-match-sources button').first().click();
    await expect(inspector.locator('.desk-inspector-document pre')).toHaveText(source.text);
    await inspector.locator('summary').filter({ hasText: /^Source details$/ }).click();
    await expect(inspector.getByRole('link', { name: source.url!, exact: true })).toHaveAttribute('href', source.url!);
    await expect(inspector.locator('time')).toHaveAttribute('datetime', source.retrievedAt!);
    await capture(page, info, 'public-match-source');
    await inspector.getByRole('button', { name: 'Close source inspector', exact: true }).click();
  });

  await test.step('The network directory filters public profiles by cohort', async () => {
    await desk.locator('.desk-rail button').filter({ hasText: /^Recipients$/ }).click();
    await desk.getByLabel('Reporter dataset', { exact: true }).selectOption('public');
    for (const cohort of ['us-finance', 'us-corporate']) {
      await desk.getByLabel('Network cohort', { exact: true }).selectOption(cohort);
      const names = seeds.reporters.filter(profile => profile.cohortIds.includes(cohort)).map(profile => profile.name);
      await expect(desk.locator('.desk-network-directory .desk-profile')).toHaveCount(names.length);
      await expect(desk.locator('.desk-network-directory .desk-profile strong')).toHaveText(names);
      await expect(desk.locator('.desk-graph .node-recipient')).toHaveCount(names.length);
    }
    await capture(page, info, 'public-network-cohort');
    await desk.locator('.desk-rail button').filter({ hasText: /^Evidence/ }).click();
  });

  await test.step('The reviewed packet includes only the selected recipient and relevant source provenance', async () => {
    const current = await snapshot(page);
    const submission = current.submissions[0];
    const run = submission.reporterMatch!;
    const chosenMatch = run.matches![0];
    const chosen = run.profiles!.find(profile => profile.id === chosenMatch.recipientId)!;
    await desk.locator('summary').filter({ hasText: /^Prepare story packet$/ }).click();
    const recipient = desk.getByLabel('Story packet recipient', { exact: true });
    const options = await recipient.locator('option').evaluateAll(elements => elements.map(element => (element as HTMLOptionElement).value).filter(Boolean));
    expect(options.sort()).toEqual(run.matches!.map(match => match.recipientId).sort());
    await recipient.selectOption(chosen.id);
    await desk.locator('button').filter({ hasText: /^Prepare story packet$/ }).click();
    const preview = desk.getByRole('textbox', { name: 'Story packet preview', exact: true });
    await expect(preview).toBeVisible();
    const packet = await preview.inputValue();
    expect(packet.includes(chosen.name)).toBe(true);
    expect(packet.includes(DEMO_EVIDENCE)).toBe(true);
    expect(packet.includes(INVOICE_TEXT)).toBe(true);
    expect(packet.includes('$120,000') || packet.includes('120000')).toBe(true);
    expect(packet.includes('$350,000') || packet.includes('350000')).toBe(true);
    expect(packet.includes('$230,000') || packet.includes('230000')).toBe(true);
    expect(packet.toLowerCase().includes('darkbloom')).toBe(true);
    expect(packet.toLowerCase().includes('ollama')).toBe(true);
    expect(packet.includes(run.model!)).toBe(true);
    expect(/\bCindy\b/i.test(packet)).toBe(false);
    expect(packet.includes(DEMO_CONTEXT)).toBe(false);
    expect(packet.includes(submission.receivedAt)).toBe(false);
    expect(packet.includes(submission.id)).toBe(false);
    const capabilitiesOmitted = await deskFrame(page).evaluate(text => {
      const session = JSON.parse(localStorage.getItem('witness-desk.session.v1')!);
      return [session.sessionId, session.readerSecret, session.senderCapability].every(value => !text.includes(value));
    }, packet);
    expect(capabilitiesOmitted).toBe(true);
    for (const other of seeds.reporters.filter(profile => profile.id !== chosen.id)) expect(packet.includes(other.name)).toBe(false);
    for (const sourceId of chosenMatch.sourceIds) {
      const source = chosen.sources.find(source => source.id === sourceId)!;
      const quote = chosen.supportingCitations.find(citation => citation.documentId === sourceId)!;
      expect(packet.includes(source.url!)).toBe(true);
      expect(packet.includes(quote.quote)).toBe(true);
    }
    const downloadPacket = desk.getByRole('button', { name: 'Download story packet', exact: true });
    await expect(downloadPacket).toBeDisabled();
    const reviewedPacket = packet + '\nOperator note: Please check the invoice reference before drawing conclusions.\n';
    await preview.fill(reviewedPacket);
    await desk.getByRole('checkbox', { name: 'I reviewed this story packet.', exact: true }).check();
    await expect(downloadPacket).toBeEnabled();
    const downloading = page.waitForEvent('download');
    await downloadPacket.click();
    const path = info.outputPath('selected-reporter-story.md');
    await (await downloading).saveAs(path);
    expect(await readFile(path, 'utf8')).toBe(reviewedPacket);
    await info.attach('selected-reporter-story', { path, contentType: 'text/markdown' });

    const manifestDownload = page.waitForEvent('download');
    await desk.getByRole('button', { name: 'Download evidence manifest', exact: true }).click();
    const manifestPath = info.outputPath('selected-reporter-evidence.json');
    await (await manifestDownload).saveAs(manifestPath);
    const manifestText = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestText);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.kind).toBe('fictional-story-packet');
    expect(manifest.recipient.name).toBe(chosen.name);
    expect(manifest.recipient.publication).toBe(chosen.publication);
    expect(manifest.originalEvidence.map((item: { text: string }) => item.text)).toEqual([INVOICE_TEXT, DEMO_EVIDENCE]);
    expect(manifest.chronology.map((item: { date: string }) => item.date)).toEqual(['2026-11-03', '2026-11-05']);
    expect([manifest.comparison.invoiceAmount, manifest.comparison.paymentAmount, manifest.comparison.difference]).toEqual([120000, 350000, 230000]);
    expect(manifest.provenance.originalAnalysis.provider).toBe('ollama');
    expect(manifest.provenance.matching.provider).toBe('ollama');
    expect(manifest.provenance.matching.model).toBe(run.model);
    expect(manifest.provenance.preparation.provider).toBe('darkbloom');
    expect(manifest.provenance.preparation.runId).toBe(chosen.preparationRunId);
    expect(manifest.operatorReviewedMarkdown).toBe(reviewedPacket);
    expect(manifest.markdownSha256).toBe(createHash('sha256').update(reviewedPacket).digest('hex'));
    expect(manifest.originalEvidencePreserved).toBe(true);
    expect(manifest.limits.recipientContacted).toBe(false);
    expect(manifestText.includes(submission.id)).toBe(false);
    expect(manifestText.includes(submission.receivedAt)).toBe(false);
    expect(manifestText.includes(DEMO_CONTEXT)).toBe(false);
    expect(/\bCindy\b/i.test(manifestText)).toBe(false);
    const expectedURLs = chosenMatch.sourceIds.map(id => chosen.sources.find(source => source.id === id)!.url!).sort();
    expect(manifest.publicSources.map((source: { url: string }) => source.url).sort()).toEqual(expectedURLs);
    for (const source of manifest.publicSources as Array<{ url: string; quotes: string[] }>) {
      const original = chosen.sources.find(item => item.url === source.url)!;
      const quotes = chosen.supportingCitations.filter(item => item.documentId === original.id).map(item => item.quote);
      expect(source.quotes).toEqual(quotes);
    }
    await info.attach('selected-reporter-evidence', { path: manifestPath, contentType: 'application/json' });
    await capture(page, info, 'reviewed-story-packet');

    const resultPath = info.outputPath('public-story-result.json');
    await writeFile(resultPath, JSON.stringify({ initialAnalysisProvider: submission.analysis?.provider, profilePreparationProvider: chosen.preparationProvider,
      matchingProvider: run.provider, matchingModel: run.model, matchingDurationMs: run.durationMs, cohortIds: run.cohortIds,
      matchedReporterIds: run.matches!.map(match => match.recipientId), selectedReporterId: chosen.id, selectedSourceIds: chosenMatch.sourceIds,
      downloadsVerified: true, onwardDelivery: 'not-performed' }, null, 2) + '\n');
    await info.attach('public-story-result', { path: resultPath, contentType: 'application/json' });
  });
});
