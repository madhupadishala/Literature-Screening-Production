import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const base = process.env.NEXUS_TEST_BASE_URL || 'http://127.0.0.1:3100';
const output = process.env.NEXUS_UI_SCREENSHOTS;
let server;
if (process.env.NEXUS_TEST_START_SERVER === '1') {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '0.0.0.0', '--port', '3100'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Next startup timed out: ' + logs)), 20_000);
      server.on('error', error => { clearTimeout(timeout); reject(error); });
      server.on('exit', code => { clearTimeout(timeout); reject(new Error('Next exited ' + code + ': ' + logs)); });
      server.stdout.on('data', data => { logs += data; if (logs.includes('Ready in')) { clearTimeout(timeout); resolve(); } });
      server.stderr.on('data', data => { logs += data; });
    });
  } catch (error) { server.kill(); throw error; }
}
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const now = new Date().toISOString();
const records = ['PROCESSING', 'READY_FOR_QC', 'FINALIZED'].map((caseStatus, i) => ({
  caseId: `case-${i + 1}`, caseKey: `PV-000${i + 1}`, intakeRecordId: `intake-${i + 1}`,
  caseStatus, priority: i === 0 ? 'HIGH' : 'NORMAL', seriousnessStatus: 'SERIOUS', assignedTo: null,
  currentDraftRevision: 2, currentVersion: 1, initialReceiptDate: now, latestReceiptDate: now, updatedAt: now,
}));
const fixture = { tenantId: 'tenant-a', tenantKey: 'clinixai-prod', workspaceId: 'workspace-a',
  workspaceName: 'TheClinixAI Production Workspace', moduleKey: 'CASE_PROCESSING', environment: 'PROD',
  displayName: 'ClinixAI Super Admin', email: 'synthetic@example.test', roleKey: 'CLINIXAI_SUPER_ADMIN',
  enabledModules: ['LITERATURE', 'INTAKE', 'CASE_PROCESSING', 'SUBMISSIONS'] };
let contextMode = 200;
let contextRequests = 0;
let status = 200;
let selectedModule = null;
let returnedRecords = records;
const errors = [];
let releaseCases;
const initialCasesGate = new Promise(resolve => { releaseCases = resolve; });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('clinixai_session', JSON.stringify({
    sessionId: 'synthetic-session', userId: 'synthetic-user', tenantId: 'tenant-a', tenantName: 'Synthetic Tenant',
    environment: 'PROD', role: 'CLINIXAI_SUPER_ADMIN', permissions: [], locked: false,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(), lastActivity: new Date().toISOString(),
  })));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body = { success: true, data: { records: [] } }; let code = 200;
    if (path === '/api/context/current') {
      contextRequests++;
      if (contextMode === -1) { await route.abort(); return; }
      code = contextMode;
      body = contextMode === 200 ? { success: true, data: fixture } : { success: false, code: 'AUTHENTICATION_REQUIRED' };
    }
    if (path === '/api/safety/cases') { await initialCasesGate; code = status; body = status === 200 ? { success: true, data: { records: returnedRecords } } : { error: 'Authentication required.' }; }
    if (path === '/api/nexus/context' && route.request().method() === 'POST') {
      selectedModule = route.request().postDataJSON(); fixture.moduleKey = selectedModule.moduleKey; body = { success: true, data: { permissions: ['submissions.view'] } };
    }
    await route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(base + '/cases');
  await page.getByText('Loading / Synchronizing cases...', { exact: true }).waitFor();
  assert.deepEqual(await page.locator('section[aria-label="Operational summary"] strong').allTextContents(), ['—', '—', '—', '—']);
  releaseCases();
  await page.getByRole('link', { name: 'PV-0001', exact: true }).waitFor();
  assert.equal(await page.getByRole('table').locator('tbody tr').count(), 3);
  assert.equal(await page.getByRole('link', { name: 'Submissions', exact: true }).count(), 1);
  const metricValues = () => page.locator('section[aria-label="Operational summary"] strong').allTextContents();
  assert.deepEqual(await metricValues(), ['3', '1', '1', '1']);
  for (const width of [1920, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const health = await page.getByRole('link', { name: 'System Health', exact: true }).evaluate(el => ({
      height: el.getBoundingClientRect().height, whiteSpace: getComputedStyle(el).whiteSpace,
      decoration: getComputedStyle(el).textDecorationLine, color: getComputedStyle(el).color,
    }));
    assert.equal(health.height, 32); assert.equal(health.whiteSpace, 'nowrap'); assert.equal(health.decoration, 'none');
    assert.notEqual(health.color, 'rgb(128, 0, 128)');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Page overflows at ${width}`);
    const client = page.getByText(fixture.workspaceName, { exact: true });
    assert.equal(await client.evaluate(el => el.scrollWidth <= el.clientWidth && getComputedStyle(el).textOverflow !== 'ellipsis'), true);
    assert.equal(await page.getByLabel('Search cases').evaluate(el => el.getBoundingClientRect().height), 32);
    assert.match(await page.locator('time').first().evaluate(el => getComputedStyle(el).fontFamily), /mono|Consolas/i);
    assert.match(await page.locator('time').first().textContent(), /UTC$/);
    const row = await page.getByRole('table').locator('tbody tr').first().boundingBox();
    assert.ok(row.height <= 38, `Noncompact row at ${width}: ${row.height}`);
    if (output) { await mkdir(output, { recursive: true }); await page.screenshot({ path: `${output}/cases-${width}.png`, fullPage: true }); }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByLabel('Search cases').fill('PV-0002');
  assert.equal(await page.getByRole('table').locator('tbody tr').count(), 1);
  await page.getByLabel('Search cases').fill('not-present');
  await page.getByText('Zero cases match current filters', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Clear Filters', exact: true }).evaluate(el => el.getBoundingClientRect().height), 32);
  await page.getByRole('button', { name: 'Clear Filters', exact: true }).click();
  assert.equal(await page.getByLabel('Search cases').inputValue(), '');
  assert.equal(await page.getByRole('table').locator('tbody tr').count(), 3);
  status = 401; await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Case worklist unavailable' }).waitFor();
  assert.deepEqual(await metricValues(), ['—', '—', '—', '—']);
  assert.equal(await page.getByText('Zero cases match current filters', { exact: true }).count(), 0);
  await page.getByText('Case data unavailable.', { exact: true }).waitFor();
  status = 200; returnedRecords = []; await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByText('Worklist empty (No pending cases in workspace)', { exact: true }).waitFor();
  assert.deepEqual(await metricValues(), ['0', '0', '0', '0']);
  await page.getByLabel('Search cases').fill('not-present');
  await page.getByText('Worklist empty (No pending cases in workspace)', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Clear Filters', exact: true }).count(), 0);
  await page.getByLabel('Search cases').fill('');
  assert.equal(await page.getByRole('alert').filter({ hasText: 'Case worklist unavailable' }).count(), 0);
  await page.evaluate(() => { window.__navigationDocument = 'preserved'; });
  await page.getByRole('link', { name: 'Submissions', exact: true }).click();
  await page.waitForURL('**/submissions');
  assert.deepEqual(selectedModule, { tenantId: 'tenant-a', workspaceId: 'workspace-a', environment: 'PROD', moduleKey: 'SUBMISSIONS' });
  assert.equal(await page.evaluate(() => window.__navigationDocument), 'preserved', 'Module switches must preserve the document');
  await page.getByRole('link', { name: 'Submissions', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Submissions', exact: true }).getAttribute('aria-current'), 'page');
  await page.getByRole('link', { name: 'Case Processing', exact: true }).click();
  await page.waitForURL('**/cases');
  assert.equal(await page.evaluate(() => window.__navigationDocument), 'preserved');
  assert.deepEqual(selectedModule, { tenantId: 'tenant-a', workspaceId: 'workspace-a', environment: 'PROD', moduleKey: 'CASE_PROCESSING' });
  for (const mode of [500, -1]) {
    contextMode = mode;
    await page.goto(base + '/cases');
    await page.getByText('Failed to load workspace context.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Submissions', exact: true }).count(), 0);
    assert.equal(await page.getByText(/Tenant, module entitlement and RBAC controls active/).count(), 0);
    const before = contextRequests;
    contextMode = 200;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('link', { name: 'Submissions', exact: true }).waitFor();
    assert.equal(contextRequests, before + 1, 'Shared provider must issue one request per retry');
    assert.equal(await page.getByText(fixture.email, { exact: true }).count(), 1);
    assert.equal(await page.getByRole('link', { name: 'Case Processing', exact: true }).getAttribute('aria-current'), 'page');
  }
  for (const mode of [401, 403]) {
    contextMode = mode;
    await page.goto(base + '/cases');
    await page.waitForURL(url => url.pathname === '/login' && url.searchParams.has('reason'));
    assert.equal(await page.getByText(/Tenant, module entitlement and RBAC controls active/).count(), 0);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: desktop/mobile density, full client labels, styled links, filters, error/empty states, and scoped Submissions navigation.');
} finally { await browser.close(); server?.kill(); }
