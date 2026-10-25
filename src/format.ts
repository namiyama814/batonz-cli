import type { SellCase } from './client.js';

// 画面の「800万円」とAPIの transferRawValue: 800 を照合済み。
export function price(item: SellCase): string {
  if (item.transferValueRange === 'negotiable') return '応相談';
  return item.transferRawValue == null ? '未公開' : `${item.transferRawValue.toLocaleString('ja-JP')}万円`;
}
const clean = (value: string): string => value.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '').replace(/\r/g, '');
export function salesRange(value: string | null | undefined): string {
  if (value == null || value === '') return '未公開';
  const match = /^(\d+(?:[mb])?)_(\d+[mb])?$/.exec(value);
  if (!match) return value;
  const amount = (part: string): string => {
    const yen = Number.parseInt(part, 10) * (part.endsWith('b') ? 1e9 : part.endsWith('m') ? 1e6 : 1);
    return yen >= 1e8 ? `${(yen / 1e8).toLocaleString('ja-JP')}億円` : yen === 0 ? '0円' : `${(yen / 1e4).toLocaleString('ja-JP')}万円`;
  };
  return match[2] ? `${amount(match[1]!)}〜${amount(match[2])}` : `${amount(match[1]!)}以上`;
}
export function formatSearch(result: { page: number; items: SellCase[] }): string {
  if (result.items.length === 0) return '該当する案件はありません。';
  return [`ページ ${result.page}（${result.items.length}件）`, ...result.items.map(item => `${item.id}\t${price(item)}\t${clean(item.title ?? '会員限定案件（詳細非公開）').replace(/\n/g, ' ')}\nhttps://batonz.jp/sell_cases/${item.id}`)].join('\n');
}
export function formatDetail(item: SellCase): string {
  const sections: [string, string | null | undefined][] = [
    ['事業概要', item.description], ['商品・サービス', item.productFeature],
    ['事業の流れ', item.businessFlow], ['組織', item.organizationFeature], ['強み', item.sellingPoint],
  ];
  return [
    `${item.id} ${clean(item.title ?? '会員限定案件（詳細非公開）')}`, `譲渡希望額: ${price(item)}`,
    `売上高: ${salesRange(item.netSalesRange)}`, `状態: ${{ open: '公開中', closed: '終了' }[item.status ?? ''] ?? item.status ?? '未公開'}`,
    `https://batonz.jp/sell_cases/${item.id}`,
    ...sections.filter(([, value]) => value != null && value !== '').map(([label, value]) => `\n${label}\n${clean(value!)}`),
  ].join('\n');
}
