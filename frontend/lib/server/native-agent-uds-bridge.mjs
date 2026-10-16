// Private UDS JSON-framed RPC server. No HTTP listener or arbitrary module loading.
// Register ONLY trusted engine functions at process initialization.
// Handler contract: async (request) => scoped, review-required native assessment.
import net from 'node:net';
import fs from 'node:fs';

const MAX_FRAME = 524288;
const APPROVED = new Set(['AG08','AG12','AG17','AG20','AG26']);

export function createNativeBridge({socketPath, handlers}) {
  if (!socketPath?.startsWith('/') || socketPath.length > 100) throw new Error('absolute socket path required');
  if (!handlers || Object.keys(handlers).some(k => !APPROVED.has(k) || typeof handlers[k] !== 'function')) {
    throw new Error('explicit approved specialist handlers required');
  }
  if (Object.keys(handlers).length === 0) throw new Error('empty native handler registry');
  const server = net.createServer(socket => {
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
        const id = request.agent_id;
        if (!APPROVED.has(id) || !handlers[id]) throw new Error('unregistered specialist');
        for (const key of ['document_id','tenant_id','client_id']) {
          if (typeof request[key] !== 'string' || !request[key]) throw new Error('missing verified routing identity');
        }
        const output = await handlers[id](Object.freeze(request));
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
      if (fs.existsSync(socketPath)) throw new Error('socket path already occupied');
      server.once('error', reject);
      server.listen(socketPath, () => {
        fs.chmodSync(socketPath, 0o600);
        resolve();
      });
    }),
    close: () => new Promise((resolve,reject) => server.close(err => err ? reject(err) : resolve()))
  };
}
