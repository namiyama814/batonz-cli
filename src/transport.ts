import { chromium, type Browser, type Page } from 'playwright-core';
import { BatonzError, parseResponse } from './errors.js';

export const ORIGIN = 'https://batonz.jp';
export interface Transport {
  get(path: string): Promise<unknown>;
  close(): Promise<void>;
}

function apiUrl(path: string): string {
  const url = new URL(path, ORIGIN);
  if (url.origin !== ORIGIN || !/^\/api\/v2\/sell_cases(?:\/(?:count|[1-9]\d*))?$/.test(url.pathname)) {
    throw new BatonzError('INVALID_PATH', '許可されていないAPIパスです。', 2);
  }
  return url.href;
}

export class HttpTransport implements Transport {
  constructor(private readonly timeoutMs = 15000, private readonly fetcher: typeof fetch = fetch) {}
  async get(path: string): Promise<unknown> {
    let response: Response;
    let body: string;
    try {
      response = await this.fetcher(apiUrl(path), {
        signal: AbortSignal.timeout(this.timeoutMs), redirect: 'error', credentials: 'omit',
        headers: { Accept: 'application/json', 'User-Agent': 'batonz-cli/0.1.0' },
      });
      body = await response.text();
    } catch (error) {
      if (error instanceof BatonzError) throw error;
      const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
      throw new BatonzError(timeout ? 'TIMEOUT' : 'NETWORK_ERROR', timeout ? 'APIの取得がタイムアウトしました。' : 'APIに接続できませんでした。', timeout ? 8 : 6);
    }
    return parseResponse(response.status, body);
  }
  async close(): Promise<void> {}
}

export class ChromeTransport implements Transport {
  private browser: Browser | undefined;
  private page: Page | undefined;
  constructor(private readonly endpoint: string, private readonly timeoutMs = 15000) {}

  private async connect(): Promise<Page> {
    if (this.page) return this.page;
    try {
      this.browser = await chromium.connectOverCDP(this.endpoint, { timeout: this.timeoutMs });
      const context = this.browser.contexts()[0];
      if (!context) throw new Error('No default context');
      const page = await context.newPage();
      this.page = page;
      await page.goto(`${ORIGIN}/sell_cases/`, { waitUntil: 'domcontentloaded', timeout: this.timeoutMs });
      if (new URL(page.url()).origin !== ORIGIN) throw new Error('Unexpected origin');
      return page;
    } catch {
      await this.close();
      throw new BatonzError('CHROME_CONNECTION', 'Chromeに接続できないか、BATONZを開けませんでした。CDP URL とブラウザの起動状態を確認してください。', 6);
    }
  }

  async get(path: string): Promise<unknown> {
    const url = apiUrl(path);
    const page = await this.connect();
    let result: { status: number; body: string };
    try {
      result = await page.evaluate(async ({ url, timeoutMs }) => {
        const response = await fetch(url, {
          credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
          headers: { Accept: 'application/json' },
        });
        return { status: response.status, body: await response.text() };
      }, { url, timeoutMs: this.timeoutMs });
    } catch (error) {
      const timeout = error instanceof Error && /TimeoutError|AbortError|timed out/i.test(error.message);
      throw new BatonzError(timeout ? 'TIMEOUT' : 'NETWORK_ERROR', timeout ? 'APIの取得がタイムアウトしました。' : 'Chrome経由のAPI取得に失敗しました。', timeout ? 8 : 6);
    }
    return parseResponse(result.status, result.body);
  }

  async close(): Promise<void> {
    // connectOverCDP の browser.close() は接続を切断する。既存ブラウザは終了しない。
    try { await this.page?.close(); }
    finally {
      this.page = undefined;
      await this.browser?.close();
      this.browser = undefined;
    }
  }
}
