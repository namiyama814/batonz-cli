import { z } from 'zod';
import { BatonzError } from './errors.js';
import type { Transport } from './transport.js';

export const TRANSFER_RANGES = ['negotiable', '0_1m', '1m_3m', '3m_5m', '5m_7_5m', '7_5m_10m', '10m_20m', '20m_30m', '30m_50m', '50m_75m', '75m_100m', '100m_250m', '250m_500m', '500m_1b', '1b_'] as const;
export type TransferRange = typeof TRANSFER_RANGES[number];
export interface SearchOptions { keyword?: string; page?: number; transferRanges?: TransferRange[] }

const optionalText = z.string().nullable().optional();
const caseSchema = z.object({
  id: z.number().int().positive(), title: z.string().optional(), scope: z.string().optional(),
  transferRawValue: z.number().finite().nullable().optional(),
  transferValueRange: optionalText, netSalesRange: optionalText,
  openedAt: optionalText, meaningfulUpdatedAt: optionalText,
  publicAreaId: z.number().int().nullable().optional(),
  mainBusinessKindId: z.number().int().nullable().optional(),
  transferred: optionalText, status: optionalText,
  description: optionalText, productFeature: optionalText, businessFlow: optionalText,
  organizationFeature: optionalText, sellingPoint: optionalText,
}).passthrough().refine(item => item.title !== undefined || item.scope === 'limited');
export type SellCase = z.infer<typeof caseSchema>;
const searchSchema = z.object({ sellCases: z.array(caseSchema) }).passthrough();
const countSchema = z.object({ count: z.number().int().nonnegative() });
const detailSchema = z.object({ sellCase: caseSchema });

function validated<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new BatonzError('API_SCHEMA_CHANGED', 'APIレスポンスの形式が想定と異なります。内部APIが変更された可能性があります。', 7);
  return result.data;
}

export function query(options: SearchOptions, includePage = true): string {
  const params = new URLSearchParams({ undecorate: 'true' });
  if (options.keyword) params.set('q', options.keyword);
  if (includePage && options.page !== undefined) {
    if (!Number.isSafeInteger(options.page) || options.page < 1) throw new BatonzError('INVALID_ARGUMENT', 'ページ番号は1以上の整数で指定してください。', 2);
    params.set('page', String(options.page));
  }
  for (const range of options.transferRanges ?? []) {
    if (!TRANSFER_RANGES.includes(range)) throw new BatonzError('INVALID_ARGUMENT', '譲渡希望額の範囲が不正です。', 2);
    params.append('transfer_value_ranges[]', range);
  }
  return params.toString();
}

export class BatonzClient {
  constructor(private readonly transport: Transport) {}
  async search(options: SearchOptions = {}) {
    const data = validated(searchSchema, await this.transport.get(`/api/v2/sell_cases?${query(options)}`));
    return { page: options.page ?? 1, items: data.sellCases };
  }
  async count(options: SearchOptions = {}) {
    return validated(countSchema, await this.transport.get(`/api/v2/sell_cases/count?${query(options, false)}`));
  }
  async show(id: number) {
    if (!Number.isSafeInteger(id) || id < 1) throw new BatonzError('INVALID_ARGUMENT', '案件IDは1以上の整数で指定してください。', 2);
    return validated(detailSchema, await this.transport.get(`/api/v2/sell_cases/${id}?undecorate=true`)).sellCase;
  }
}
