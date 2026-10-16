// Private UDS JSON-framed RPC server. No HTTP listener or arbitrary module loading.
// Register ONLY trusted engine functions at process initialization.
// Handler contract: async (request) => scoped, review-required native assessment.
import net from 'node:net';
import {createHmac, timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';
import { statSync } from 'node:fs';

const MAX_FRAME = 524288;
const APPROVED = new Set(['AG08','AG12','AG17','AG20','AG26']);
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}

export function createNativeBridge({socketPath, handlers, signingSecret}) {
  if (typeof signingSecret !== 'string' || Buffer.byteLength(signingSecret) < 32) {
    throw new Error('32-byte private IPC secret is required');
  }
  if (!socketPath?.startsWith('/') || socketPath.length > 100) throw new Error('absolute socket path required');
  if (!handlers || Object.keys(handlers).some(k => !APPROVED.has(k) || typeof handlers[k] !== 'function')) {
    throw new Error('explicit approved specialist handlers required');
  }
  if (Object.keys(handlers).length === 0) throw new Error('empty native handler registry');
  const pending = new Set();
  const server = net.createServer(socket => {
    pending.add(socket);
    socket.once('close', () => pending.delete(socket));
    let buffer = Buffer.alloc(0);
    let done = false;
    socket.setTimeout(20000, () => socket.destroy());
    socket.on('data', async chunk => {
      if (done) return;
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > MAX_FRAME + 4) { socket.destroy(); return; }
      if (buffer.length < 4) return;
      const size = buffer.readUInt32BE(0);
      if (!size || size > MAX_FRAME) { socket.destroy(); return; }
      if (buffer.length < 4 + size) return;
      done = true;
      try {
        const request = JSON.parse(buffer.subarray(4,4+size).toString('utf8'));
        if (!request || typeof request !== 'object' || Array.isArray(request) ||
            Object.keys(request).some(k => !['agent_id','document_id','tenant_id','client_id','input','knowledge_citations','ipc_signature'].includes(k))) throw new Error('invalid request schema');
        if (!Array.isArray(request.knowledge_citations)) throw new Error('knowledge provenance required');
        const {ipc_signature:signature,...signedBody} = request;
        if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) throw new Error('unsigned runtime request');
        const expected = createHmac('sha256',signingSecret).update(canonical(signedBody)).digest();
        const actual = Buffer.from(signature,'hex');
        if (!timingSafeEqual(expected,actual)) throw new Error('invalid runtime signature');
        const id = request.agent_id;
        if (id === '__health__') {
          // Signed probe proves IPC owner possession; no model or clinical work.
          const data=Buffer.from(JSON.stringify({status:'ready',protocol:1,clinical_execution_enabled:false}));
          const header=Buffer.alloc(4);header.writeUInt32BE(data.length);
          socket.end(Buffer.concat([header,data]));
          return;
        }
        if (!APPROVED.has(id) || !handlers[id]) throw new Error('unregistered specialist');
        for (const key of ['document_id','tenant_id','client_id']) {
          if (typeof request[key] !== 'string' || !request[key]) throw new Error('missing verified routing identity');
        }
        const input = request.input;
        if (id === 'AG08') {
          if (typeof input !== 'string' || !input.trim()) throw new Error('source text required');
        } else if (!input || typeof input !== 'object' || Array.isArray(input) ||
                   input.document_id !== request.document_id || !input.source ||
                   typeof input.source !== 'object' || Array.isArray(input.source)) {
          throw new Error('structured specialist source contract failed');
        }
        const output = await Promise.race([
          handlers[id](Object.freeze(request)),
          new Promise((_,reject) => setTimeout(() => reject(new Error('specialist deadline exceeded')), 15000)),
        ]);
        if (!output || output.agent_id !== id ||
            ['document_id','tenant_id','client_id'].some(k => output[k] !== request[k]) ||
            output.status !== 'review_required' || output.requires_human_review !== true ||
            !output.assessment || typeof output.assessment !== 'object' || Array.isArray(output.assessment)) {
          throw new Error('native clinical output contract failed');
        }
        const data = Buffer.from(JSON.stringify(output));
        if (data.length > MAX_FRAME) throw new Error('oversized native result');
        const header = Buffer.alloc(4); header.writeUInt32BE(data.length);
        socket.end(Buffer.concat([header, data]));
      } catch {
        // A transport failure is deliberate; the Python dispatcher routes to review.
        socket.destroy();
      }
    });
  });
  return {
    start: () => new Promise((resolve,reject) => {
      if (fs.existsSync(socketPath)) {
        const stat = statSync(socketPath);
        if (!stat.isSocket()) throw new Error('refuse to unlink non-socket path');
        const probe = net.createConnection(socketPath);
        probe.once('connect', () => { probe.destroy(); reject(new Error('native socket already active')); });
        probe.once('error', (err) => {
          probe.destroy();
          if (err.code !== 'ECONNREFUSED') { reject(err); return; }
          fs.unlinkSync(socketPath);
          server.listen(socketPath, () => { fs.chmodSync(socketPath, 0o600); resolve(); });
        });
        return;
      }
      server.once('error', reject);
      server.listen(socketPath, () => {
        fs.chmodSync(socketPath, 0o600);
        resolve();
      });
    }),
    close: () => new Promise((resolve,reject) => {
      for (const connection of pending) connection.destroy();
      server.close(err => {
        try { if (fs.existsSync(socketPath) && statSync(socketPath).isSocket()) fs.unlinkSync(socketPath); } catch {}
        err ? reject(err) : resolve();
      });
    })
  };
}
