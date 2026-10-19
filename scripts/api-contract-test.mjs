import worker from '../src/worker.js';

const env = {
  BACKEND_ENABLED: 'false',
  AUTH_ENABLED: 'false',
  SYNC_ENABLED: 'false',
  ASSETS: {
    fetch() {
      return new Response('asset');
    }
  }
};

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

async function request(path, init) {
  return worker.fetch(new Request(`https://example.test${path}`, init), env);
}

async function json(path, init) {
  const response = await request(path, init);
  return {
    response,
    body: await response.json()
  };
}

{
  const { response, body } = await json('/api/health');
  assert(response.status === 200, 'Health endpoint should return 200');
  assert(body.ok === true, 'Health endpoint should report ok');
  assert(body.backendEnabled === false, 'Health endpoint should expose disabled backend flag');
}

{
  const { response, body } = await json('/api/config');
  assert(response.status === 200, 'Config endpoint should return 200');
  assert(body.backendEnabled === false, 'Config should expose backend flag');
  assert(body.authEnabled === false, 'Config should expose auth flag');
  assert(body.syncEnabled === false, 'Config should expose sync flag');
}

{
  const { response, body } = await json('/api/me');
  assert(response.status === 503, 'Reserved routes should return 503 while backend is disabled');
  assert(body.error === 'backend_disabled', 'Disabled reserved routes should explain backend_disabled');
}

{
  const { response, body } = await json('/api/nope');
  assert(response.status === 404, 'Unknown API routes should return 404');
  assert(body.error === 'not_found', 'Unknown API routes should return not_found');
}

{
  const response = await request('/');
  assert(response.status === 200, 'Non-API routes should fall through to static assets');
  assert(await response.text() === 'asset', 'Static asset binding should handle non-API routes');
}

if (failures.length) {
  console.error(`API contract test failed with ${failures.length} issue${failures.length === 1 ? '' : 's'}:`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('API contract test passed.');
