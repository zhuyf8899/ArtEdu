// Only the isolated test image loads this file; deployment code is unchanged.
const target = new URL(process.env.DATABASE_URL || 'http://invalid');
if (process.env.ARTEDU_LOAD_TEST !== 'isolated-local' || process.env.NODE_ENV !== 'test' || !['postgres','127.0.0.1','localhost'].includes(target.hostname) || target.pathname !== '/artedu_loadtest') {
  throw Error('Load-test limiter requires the isolated test database and test environment');
}
const buckets = new Map();
const modulePath=target.hostname==='postgres' ? '/app/apps/api/dist/common/rate-limit.js' : require('node:path').resolve(__dirname,'../../apps/api/dist/common/rate-limit.js');
require(modulePath).apiRateLimitHook = async (request, reply) => {
  const write = !['GET','HEAD','OPTIONS'].includes(request.method);
  const key = `${request.ip}:${write ? 'write' : 'read'}`;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.reset <= now) bucket = {count:0,reset:now+60000};
  buckets.set(key,bucket);
  if (++bucket.count > (write ? 12000 : 60000)) return reply.code(429).send({message:'Isolated load-test limit exceeded'});
};
console.log('[loadtest] Isolated per-IP limits: 60000 reads/min, 12000 writes/min. Authentication remains enabled.');
