import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assessSeriousness } from '../lib/ai/seriousness-agent-client';
import { assessSharedPVAgent } from '../lib/ai/shared-pv-agent-client';

test('real Python service satisfies TypeScript specialist contracts', { timeout: 30_000 }, async () => {
  const root = path.resolve(process.cwd(), '..');
  const temp = await mkdtemp(path.join(tmpdir(), 'pv-http-'));
  const child = spawn(process.env.PV_TEST_PYTHON || 'python3', [path.join(root, 'tests', 'pv_contract_server.py'), temp], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  const old = { ...process.env };
  try {
    const port = await new Promise<number>((resolve, reject) => {
      let data = '';
      child.stdout.on('data', chunk => { data += chunk.toString(); const match = data.match(/PORT=(\d+)/); if (match) resolve(Number(match[1])); });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Contract service exited ${code}`)));
    });
    const url = `http://127.0.0.1:${port}`;
    process.env.NEXUS_SERIOUSNESS_ENABLED = 'true';
    process.env.NEXUS_CAUSALITY_ENABLED = 'true';
    process.env.NEXUS_SERIOUSNESS_AGENT_URL = url;
    process.env.NEXUS_PV_AGENT_URL = url;
    process.env.NEXUS_PV_AGENT_TOKEN = 'contract-test-only';
    const input = { tenant_id: 'tenant', client_id: 'client', workspace_id: 'workspace', case_id: 'case', narrative: 'Aspirin was suspected. The patient was hospitalized for bleeding.', source_type: 'literature', event_terms: ['bleeding'] };
    const seriousness = await assessSeriousness(input, { bearerToken: 'contract-test-only' });
    assert.equal(seriousness.decision, 'serious');
    assert.equal(seriousness.route, 'hitl');
    assert.ok(seriousness.audit_id);
    const causality = await assessSharedPVAgent('causality', input);
    assert.equal(causality.route, 'hitl');
    assert.equal(causality.review_required, true);
    assert.ok(causality.audit_id);
    assert.ok(Array.isArray(causality.result.pairs));
  } finally {
    child.kill();
    await new Promise<void>(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', () => resolve()); });
    for (const key of Object.keys(process.env)) if (!(key in old)) delete process.env[key];
    Object.assign(process.env, old);
    await rm(temp, { recursive: true, force: true });
  }
});
