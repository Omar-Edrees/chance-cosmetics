/*
 * Orders that Shopify Flow wrote before its row got the COD form columns (before 2026-10-28 03:56 Cairo): their source
 * and products, read once from Shopify (Admin API, order customAttributes + line items).
 * Order ID → [Attr UTM Source, Attr UTM Campaign, Attr UTM Content, Order Referrer, Products, Source Name],
 * the same columns Flow writes now. Used only for a row that has none of them itself.
 */
const MS_ = 'Sheglam Marshmallow Puff Lip Blur Pen';
const ORDER_PATCH = {
  'gid://shopify/Order/7318352855330': ['facebook', '120256366878570102', '120256366885940102', 'Instagram', MS_ + ' x1', '4655075'],
  'gid://shopify/Order/7318352920866': ['facebook', '120256366878570102', '120256366885940102', 'Instagram', MS_ + ' x1', '4655075'],
  'gid://shopify/Order/7318361276706': ['', '', '', '', 'SHEGLAM Camera On Blurring Setting Powder Balm x1', 'shopify_draft_order'],
  'gid://shopify/Order/7318369796386': ['', '', '', '', 'Sheglam Cutie Paw Blush Stamp x1 | ' + MS_ + ' x1', 'shopify_draft_order'],
  'gid://shopify/Order/7318407315746': ['All Aug | Sheglam page | CBO | 10/9', 'New Sales Ad - Copy 3', 'fb', 'Facebook',
    'SHEGLAM Bold Moves Kohl Cream Eyeliner Pencil x1', '4655075'],
  'gid://shopify/Order/7318439952674': ['facebook', '120256366878570102', '120256366894810102', 'Facebook', MS_ + ' x1 | ' + MS_ + ' x1', '4655075'],
  'gid://shopify/Order/7318439985442': ['facebook', '120256366878570102', '120256366885940102', 'Instagram', MS_ + ' x1', '4655075'],
  'gid://shopify/Order/7318469673250': ['', '', '', 'Direct(Chancestoreegy)', 'Sponge Makeup Multicolor x1 | Sheglam Concealer Like Magic 12 hour full coverage x1 | ' +
    'SHEGLAM Skinfinite Hydrating Foundation x1 | Real Techniques Ultra Plush Blush Makeup Brush x1 | SHEGLAM Butter Glow Melt Touch Ultra Hydrating Primer x1', '4655075'],
  'gid://shopify/Order/7318484123938': ['facebook', '120256366878570102', '120256366885940102', 'Instagram', MS_ + ' x1', '4655075'],
  'gid://shopify/Order/7318484189474': ['facebook', '120256366878570102', '120256366885940102', 'Facebook',
    MS_ + ' x1 | ' + MS_ + ' x1 | Sheglam Boldline Longwear Multi-Function Gel Liner Set x1', '4655075'],
  'gid://shopify/Order/7318484287778': ['SHEGLAM Bold Moves Kohl Cream Eyeliner Pencil | Testing | Sales | ABO | 12/10/2026', 'Reels | With Music | Product Show', 'fb', 'Facebook',
    'CYBELE 3D Mascara 01 Extra Volume Dark Black x1 | SHEGLAM Like Magic hydrating Concealer x1', '4655075'],
  'gid://shopify/Order/7318512304418': ['All Aug | Sheglam page | CBO | 10/9', 'New Sales Ad - Copy 3', 'fb', 'Facebook', MS_ + ' x1', '4655075'],
  'gid://shopify/Order/7318539960610': ['Camera on powder | CBO | 30\\9 - ANC', 'New Sales Ad - Copy 6', 'ig', 'Instagram', 'Maange 10Pcs Makeup Brush Set With Bag x1', '4655075'],
  'gid://shopify/Order/7318539993378': ['', '', '', 'Wl', 'Sheglam Air Plush Lip and Cheek Cream x1 | SHEGLAM Peel Talk Lip Tint x1 | ' +
    'SHEGLAM Bold Moves Kohl Cream Eyeliner Pencil x1 | ' + MS_ + ' x1', '4655075'],
  'gid://shopify/Order/7318554214690': ['Shein Muge Leen Thanks For The Love Lip Set 12 Pcs | Testing | Sales | ABO | 18/10/2026 - Copy', 'Vid | UGC | Product showing',
    'th', 'Threads', 'Shein Muge Leen Thanks For The Love Lip Set 12 Pcs x1', '4655075'],
  'gid://shopify/Order/7318554280226': ['facebook', '120256366878570102', '120256366894810102', 'Instagram', MS_ + ' x1', '4655075'],
  'gid://shopify/Order/7318568534306': ['Testing | Catalog | Makeup - AOV 1000:1500 | Black F Wedding Offers | ABO | 26/10/2026', 'Vid | EGC | Summer Offer', 'ig',
    'Instagram', 'Maange Makeup Brush Set 16 Pcs With Bag x1', '4655075'],
  'gid://shopify/Order/7318568599842': ['', '', '', '', MS_ + ' x1', '4655075']
};
/* The patch columns, by the names readOrderSource_ reads them under. */
const ORDER_PATCH_COLS = ['attr_utm_source', 'attr_utm_campaign', 'attr_utm_content', 'referrer', 'product', 'source_name'];
