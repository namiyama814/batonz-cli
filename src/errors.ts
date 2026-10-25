export class BatonzError extends Error {
  constructor(public readonly code: string, message: string, public readonly exitCode = 1) {
    super(message);
    this.name = 'BatonzError';
  }
}

export function httpError(status: number): BatonzError {
  if (status === 403) return new BatonzError('FORBIDDEN', 'HTTP 403: アクセスが拒否されました。--transport chrome --cdp-url http://127.0.0.1:9222 をお試しください。', 3);
  if (status === 404) return new BatonzError('NOT_FOUND', 'HTTP 404: 案件またはAPIが見つかりません。', 4);
  if (status === 429) return new BatonzError('RATE_LIMITED', 'HTTP 429: リクエストが制限されています。時間を置いて再実行してください。', 5);
  return new BatonzError('HTTP_ERROR', `HTTP ${status}: APIの取得に失敗しました。`, 6);
}

export function parseResponse(status: number, body: string): unknown {
  if (status < 200 || status >= 300) throw httpError(status);
  try { return JSON.parse(body) as unknown; }
  catch { throw new BatonzError('INVALID_JSON', 'APIが有効なJSONを返しませんでした。', 7); }
}
