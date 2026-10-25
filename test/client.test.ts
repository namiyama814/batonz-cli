import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BatonzClient, query } from '../src/client.js';
import { price, salesRange, formatSearch, formatDetail } from '../src/format.js';
import { BatonzError } from '../src/errors.js';

const fixture = async (name: string): Promise<unknown> => JSON.parse(await readFile(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
function mock(value: unknown) {
  const paths: string[] = [];
  const client = new BatonzClient({ async get(path) { paths.push(path); return value; }, async close() {} });
  return { client, paths };
}

test('keyword, page and repeated ranges use URLSearchParams encoding', () => {
  const params = new URLSearchParams(query({ keyword: 'カフェ & EC', page: 2, transferRanges: ['7_5m_10m', 'negotiable'] }));
  assert.equal(params.get('q'), 'カフェ & EC');
  assert.equal(params.get('page'), '2');
  assert.equal(params.get('undecorate'), 'true');
  assert.deepEqual(params.getAll('transfer_value_ranges[]'), ['7_5m_10m', 'negotiable']);
});
test('search maps list and preserves missing values', async () => {
  const { client, paths } = mock(await fixture('search'));
  const result = await client.search({ page: 2 });
  assert.equal(result.page, 2);
  assert.equal(result.items.length, 3);
  assert.match(paths[0]!, /^\/api\/v2\/sell_cases\?/);
  assert.equal(price(result.items[0]!), '800万円');
  assert.equal(price(result.items[1]!), '応相談');
  assert.equal(price(result.items[2]!), '未公開');
  assert.match(formatSearch(result), /101\t800万円/);
});
test('zero price is distinct from absent or negotiable price', () => {
  assert.equal(price({ id: 1, title: 'test', transferRawValue: 0 }), '0万円');
  assert.equal(price({ id: 1, title: 'test' }), '未公開');
});
test('sales ranges render in yen without treating missing values as zero', () => {
  assert.equal(salesRange('0_10m'), '0円〜1,000万円');
  assert.equal(salesRange('30m_50m'), '3,000万円〜5,000万円');
  assert.equal(salesRange('100m_200m'), '1億円〜2億円');
  assert.equal(salesRange('1b_'), '10億円以上');
  assert.equal(salesRange(null), '未公開');
});
test('count shares search filters but omits pagination', async () => {
  const { client, paths } = mock(await fixture('count'));
  assert.deepEqual(await client.count({ keyword: 'カフェ', page: 2, transferRanges: ['7_5m_10m'] }), { count: 107 });
  const url = new URL(paths[0]!, 'https://batonz.jp');
  assert.equal(url.pathname, '/api/v2/sell_cases/count');
  assert.equal(url.searchParams.has('page'), false);
  assert.equal(url.searchParams.get('transfer_value_ranges[]'), '7_5m_10m');
});
test('detail unwraps sellCase and formats public sections', async () => {
  const { client, paths } = mock(await fixture('detail'));
  const result = await client.show(101);
  assert.equal(result.id, 101);
  assert.equal(paths[0], '/api/v2/sell_cases/101?undecorate=true');
  assert.match(formatDetail(result), /事業概要\n事業概要\n2行目/);
});
test('empty result is a successful response', async () => {
  const { client } = mock(await fixture('empty'));
  assert.equal(formatSearch(await client.search()), '該当する案件はありません。');
});
test('limited listing stubs are preserved without inventing a title or price', async () => {
  const { client } = mock({ sellCases: [{ id: 36914, scope: 'limited', openedAt: '2023-10-20T17:20:38.794+09:00' }] });
  const result = await client.search();
  assert.equal(result.items[0]?.title, undefined);
  assert.equal(price(result.items[0]!), '未公開');
  assert.match(formatSearch(result), /会員限定案件（詳細非公開）/);
  await assert.rejects(mock({ sellCases: [{ id: 1, scope: 'open' }] }).client.search(), (e: BatonzError) => e.code === 'API_SCHEMA_CHANGED');
});
test('schema changes fail instead of returning empty results', async () => {
  for (const value of [{}, { sellCases: [{}] }, { sellCases: null }, { sellCases: [{ id: 1, title: 'test', transferRawValue: '800' }] }]) {
    await assert.rejects(mock(value).client.search(), (e: BatonzError) => e.code === 'API_SCHEMA_CHANGED');
  }
  await assert.rejects(mock({ count: -1 }).client.count(), (e: BatonzError) => e.exitCode === 7);
  await assert.rejects(mock({ sellCase: null }).client.show(1), (e: BatonzError) => e.exitCode === 7);
});
test('invalid identifiers and page numbers never reach network', async () => {
  const { client, paths } = mock({});
  for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(client.show(value), (e: BatonzError) => e.exitCode === 2);
    await assert.rejects(client.search({ page: value }), (e: BatonzError) => e.exitCode === 2);
  }
  assert.deepEqual(paths, []);
});
test('terminal control characters from titles are stripped in text output', () => {
  assert.doesNotMatch(formatDetail({ id: 1, title: '\x1b[31mtest\x07' }), /\x1b|\x07/);
});
