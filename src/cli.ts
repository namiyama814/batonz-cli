#!/usr/bin/env node
import { Command, CommanderError, InvalidArgumentError, Option } from 'commander';
import { BatonzClient, TRANSFER_RANGES, type TransferRange } from './client.js';
import { BatonzError } from './errors.js';
import { formatDetail, formatSearch } from './format.js';
import { ChromeTransport, HttpTransport } from './transport.js';

function positive(value: string): number {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new InvalidArgumentError('1以上の整数を指定してください。');
  return Number(value);
}
function timeout(value: string): number {
  const result = positive(value);
  if (result > 2147483647) throw new InvalidArgumentError('2147483647以下のミリ秒を指定してください。');
  return result;
}
const program = new Command().name('batonz').description('BATONZ 公開案件の検索・詳細取得（非公式）').version('0.1.0');
program.exitOverride();
program.addOption(new Option('--transport <mode>', '通信方法').choices(['http', 'chrome']).default('http'))
  .option('--cdp-url <url>', '起動済みChromeのCDP URL', 'http://127.0.0.1:9222')
  .option('--timeout <ms>', '通信タイムアウト（ミリ秒）', timeout, 15000)
  .option('--json', 'JSONを出力');

function searchOptions(command: Command): Command {
  return command.argument('[keyword]', '検索キーワード').addOption(new Option('--transfer-range <range>', `譲渡希望額の範囲（繰り返し指定可）: ${TRANSFER_RANGES.join(', ')}`)
    .argParser((value: string, previous: string[]) => {
      if (!(TRANSFER_RANGES as readonly string[]).includes(value)) throw new InvalidArgumentError(`範囲は ${TRANSFER_RANGES.join(', ')} から指定してください。`);
      return [...previous, value];
    }).default([]));
}
async function execute(command: Command, action: (client: BatonzClient) => Promise<{ data: unknown; text: string }>): Promise<void> {
  const options = command.optsWithGlobals();
  const transport = options.transport === 'chrome' ? new ChromeTransport(options.cdpUrl as string, options.timeout as number) : new HttpTransport(options.timeout as number);
  try {
    const result = await action(new BatonzClient(transport));
    process.stdout.write(`${options.json ? JSON.stringify(result.data, null, 2) : result.text}\n`);
  } finally { await transport.close(); }
}
searchOptions(program.command('search').description('公開案件を検索')).option('--page <number>', 'ページ番号', positive, 1)
  .action(async (keyword: string | undefined, options: { page: number; transferRange: TransferRange[] }, command: Command) => {
    await execute(command, async client => {
      const data = await client.search({ ...(keyword ? { keyword } : {}), page: options.page, transferRanges: options.transferRange });
      return { data, text: formatSearch(data) };
    });
  });
searchOptions(program.command('count').description('検索条件に一致する件数を取得'))
  .action(async (keyword: string | undefined, options: { transferRange: TransferRange[] }, command: Command) => {
    await execute(command, async client => {
      const data = await client.count({ ...(keyword ? { keyword } : {}), transferRanges: options.transferRange });
      return { data, text: `${data.count.toLocaleString('ja-JP')}件` };
    });
  });
program.command('show').description('公開案件の詳細を取得').argument('<id>', '案件ID', positive)
  .action(async (id: number, _options: unknown, command: Command) => {
    await execute(command, async client => {
      const data = await client.show(id);
      return { data, text: formatDetail(data) };
    });
  });
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});
try { await program.parseAsync(); }
catch (error) {
  if (error instanceof CommanderError) process.exitCode = error.exitCode === 0 ? 0 : 2;
  else if (error instanceof BatonzError) {
    process.stderr.write(`${error.code}: ${error.message}\n`);
    process.exitCode = error.exitCode;
  } else {
    process.stderr.write('UNEXPECTED_ERROR: 予期しないエラーが発生しました。\n');
    process.exitCode = 1;
  }
}
