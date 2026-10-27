/* Chance Cosmetics profile (preliminary). */
/*
 * Seeds empty tabs once at setup. After that the Settings / Accounts / Products / Benchmarks tabs
 * are the source of truth. Never put tokens here.
 * OPEN (to fill later): store domain, account purposes, costs, confirm/delivery rates, benchmarks.
 */
const PROFILE = {
  settings: {
    'business.name': 'Chance Cosmetics',
    'business.currency': 'EGP',
    'business.timezone': 'Africa/Cairo',
    'business.store_domains': '',
    'orders.method': 'shopify_flow_sheet',
    'orders.sheet_url': 'https://docs.google.com/spreadsheets/d/15rkiOnnON-nobcGxq1ct5tHnocrvS79f454xkQQg6Ys/edit',
    'orders.sheet_tab': 'orders',
    'orders.col.order_id': 'Order ID',
    'orders.col.date': 'Created At',
    'orders.col.product': 'Products',
    'orders.col.total': 'Total Price',
    'orders.col.phone': 'Phone',
    'orders.col.city': 'City',
    'orders.col.utm_source': 'UTM Source',
    'orders.col.utm_campaign': 'UTM Campaign',
    'orders.col.utm_content': 'UTM Content',
    'orders.col.metadata': '',
    'meta.api_version': 'v26.0',
    'tiktok.method': 'csv_tab',
    'tiktok.tab': 'TikTok Data'
  },
  // [Platform, Account ID, Name, Purpose, Include, Brand / Page]
  accounts: [
    ['META', '1354948596094660', 'Meta 4660', '', true, ''],
    ['META', '1443770363884823', 'Meta 4823', '', true, ''],
    ['META', '1980884485605243', 'Meta 5243', '', true, ''],
    ['TIKTOK', '7433928103325794321', 'TikTok', '', true, '']
  ],
  // Products are added automatically from the stock sheet (Shopify title + handle + price).
  products: [],
  benchmarks: []
};
