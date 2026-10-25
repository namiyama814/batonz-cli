import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpTransport, ChromeTransport } from '../src/transport.js';
import { BatonzError } from '../src/errors.js';

const path = '/api/v2/sell_cases/count?undecorate=true';
test('HTTP transport requests same-origin JSON without cookies and closes', async () => {
  const transport = new HttpTransport(100, async (url, options) => {
    assert.equal(url, `https://batonz.jp${path}`);
    assert.equal(options?.redirect, 'error');
    assert.equal(new Headers(options?.headers).get('cookie'), null);
    return new Response('{"count":0}');
  });
  assert.deepEqual(await transport.get(path), { count: 0 });
  await transport.close();
});
for (const [status, code, exitCode] of [[403, 'FORBIDDEN', 3], [404, 'NOT_FOUND', 4], [429, 'RATE_LIMITED', 5], [500, 'HTTP_ERROR', 6]] as const) {
  test(`HTTP ${status} has a distinct error and is not retried`, async () => {
    let calls = 0;
    const transport = new HttpTransport(100, async () => { calls++; return new Response('<html>error</html>', { status }); });
    await assert.rejects(transport.get(path), (e: BatonzError) => e.code === code && e.exitCode === exitCode);
    assert.equal(calls, 1);
  });
}
test('invalid JSON is distinguished from HTTP failure', async () => {
  const transport = new HttpTransport(100, async () => new Response('<html>oops</html>'));
  await assert.rejects(transport.get(path), (e: BatonzError) => e.code === 'INVALID_JSON' && e.exitCode === 7);
});
test('timeout and network failure are distinguished', async () => {
  for (const [name, expected, exitCode] of [['TimeoutError', 'TIMEOUT', 8], ['TypeError', 'NETWORK_ERROR', 6]] as const) {
    const transport = new HttpTransport(100, async () => { const error = new Error(); error.name = name; throw error; });
    await assert.rejects(transport.get(path), (e: BatonzError) => e.code === expected && e.exitCode === exitCode);
  }
});
test('response body reading is included in timeout handling', async () => {
  const transport = new HttpTransport(100, async () => ({ text: async () => { throw new DOMException('expired', 'TimeoutError'); } }) as Response);
  await assert.rejects(transport.get(path), (e: BatonzError) => e.code === 'TIMEOUT');
});
test('both transports reject external API URLs before connecting', async () => {
  for (const transport of [new HttpTransport(), new ChromeTransport('http://127.0.0.1:1', 100)]) {
    await assert.rejects(transport.get('https://example.com/api/v2/sell_cases'), (e: BatonzError) => e.code === 'INVALID_PATH');
    await transport.close();
  }
});
test('unavailable Chrome reports connection failure and can be closed twice', async () => {
  const transport = new ChromeTransport('http://127.0.0.1:1', 100);
  await assert.rejects(transport.get(path), (e: BatonzError) => e.code === 'CHROME_CONNECTION');
  await transport.close();
  await transport.close();
});
