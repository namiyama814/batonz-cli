import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { ChromeTransport } from '../src/transport.js';
import { BatonzClient } from '../src/client.js';
import { BatonzError } from '../src/errors.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Opt-in: requires an installed Google Chrome. All BATONZ traffic is intercepted.
test('Chrome CDP lifecycle, anonymous fetch, errors and CLI output', { skip: process.env.BATONZ_TEST_CHROME !== '1', timeout: 30000 }, async () => {
  const profile = await mkdtemp(join(tmpdir(), 'batonz-test-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', headless: true, chromiumSandbox: true,
    args: ['--remote-debugging-port=0'],
  });
  try {
    const [port] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n');
    const endpoint = `http://127.0.0.1:${port}`;
    const sentinel = context.pages()[0]!;
    const before = context.pages().length;
    await context.addCookies([{ name: 'session', value: 'must-not-send', domain: 'batonz.jp', path: '/' }]);
    let status = 200;
    let body = '{"count":107}';
    let delay = 0;
    await context.route('https://batonz.jp/**', async route => {
      if (route.request().url().includes('/api/')) {
        assert.equal(route.request().headers()['cookie'], undefined);
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        await route.fulfill({ status, contentType: 'application/json', body }).catch(() => {});
      } else {
        await route.fulfill({ contentType: 'text/html', body: '<html><title>Test</title></html>' });
      }
    });
    const run = promisify(execFile);
    const cliArgs = ['--import', 'tsx', 'src/cli.ts', 'count', '--transport', 'chrome', '--cdp-url', endpoint, '--json'];
    const output = await run(process.execPath, cliArgs);
    assert.deepEqual(JSON.parse(output.stdout), { count: 107 });
    assert.equal(output.stderr, '');
    assert.equal(context.pages().length, before);
    for (const [httpStatus, exitCode] of [[403, 3], [404, 4], [429, 5]]) {
      status = httpStatus!;
      await assert.rejects(run(process.execPath, cliArgs), (e: { code: number; stdout: string; stderr: string }) => e.code === exitCode && e.stdout === '' && e.stderr.includes(`HTTP ${httpStatus}`));
    }
    status = 200;
    const transport = new ChromeTransport(endpoint, 1000);
    try {
      assert.deepEqual(await new BatonzClient(transport).count(), { count: 107 });
      assert.equal(context.pages().length, before + 1);
      status = 403;
      await assert.rejects(transport.get('/api/v2/sell_cases/count'), (e: BatonzError) => e.code === 'FORBIDDEN');
      status = 200; body = 'invalid';
      await assert.rejects(transport.get('/api/v2/sell_cases/count'), (e: BatonzError) => e.code === 'INVALID_JSON');
      body = '{"count":107}'; delay = 1500;
      await assert.rejects(transport.get('/api/v2/sell_cases/count'), (e: BatonzError) => e.code === 'TIMEOUT');
    } finally { await transport.close(); }
    assert.equal(sentinel.isClosed(), false);
    assert.equal(context.pages().length, before);
    assert.ok(context.browser()?.isConnected());
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
