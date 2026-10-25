import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function run(...args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], { encoding: 'utf8', timeout: 10000 });
}
test('help and version exit successfully without accessing network', () => {
  const help = run('--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /search/);
  assert.equal(run('--version').stdout.trim(), '0.1.0');
});
for (const args of [['show', 'abc'], ['show', '0'], ['search', '--page', '-1'], ['search', '--page', '1.1'], ['count', '--transfer-range', 'unknown'], ['search', '--transport', 'other'], ['show'], ['--timeout', '0', 'count'], ['search', '--typo']]) {
  test(`invalid arguments: ${args.join(' ')}`, () => {
    const result = run(...args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.notEqual(result.stderr, '');
  });
}
test('global options work after subcommand and runtime errors go to stderr', () => {
  const result = run('count', '--transport', 'chrome', '--cdp-url', 'http://127.0.0.1:1', '--timeout', '100', '--json');
  assert.equal(result.status, 6);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /CHROME_CONNECTION/);
});
