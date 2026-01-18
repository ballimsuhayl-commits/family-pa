import worker from '../worker.js';

function assert(cond, msg){
  if(!cond) throw new Error(msg || 'assertion failed');
}

async function run(){
  const req = new Request('https://example.com/health');
  const env = { INBOX_KV: new Map() };
  const ctx = { waitUntil: (p)=>p };
  const res = await worker.fetch(req, env, ctx);
  assert(res.status === 200, 'health status');
  const t = await res.text();
  assert(t.includes('ok'), 'health body');
  console.log('test: ok');
}
run().catch(e=>{ console.error(e); process.exit(1); });
