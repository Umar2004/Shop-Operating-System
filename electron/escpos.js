// Pure JS ESC/POS byte generator — no native dependencies (jimp used only for logo)
'use strict';

const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

// Characters per line for each paper width at Font A
const CHAR_WIDTH = { '58': 32, '76': 40, '80': 48 };

// Dot widths per paper size (203 DPI thermal), full paper in dots
const DOT_WIDTH = { '58': 384, '76': 512, '80': 576 };

class ESCPOSBuilder {
  constructor(paperSize = '80', paddingLeft = 0) {
    this._bufs = [];
    this.cols = Math.max(16, (CHAR_WIDTH[paperSize] || 48) - Number(paddingLeft || 0));
    this._indent = ' '.repeat(Number(paddingLeft || 0));
  }

  _b(...bytes)      { this._bufs.push(Buffer.from(bytes)); return this; }
  _s(str)           { this._bufs.push(Buffer.from(str, 'utf8')); return this; }
  raw(buf)          { this._bufs.push(buf); return this; }

  init()            { return this._b(ESC, 0x40); }
  cut()             { return this._b(GS, 0x56, 0x41, 0x03); }
  feed(n = 3)       { for (let i = 0; i < n; i++) this._b(LF); return this; }

  align(a)          { return this._b(ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0); }
  bold(on)          { return this._b(ESC, 0x45, on ? 1 : 0); }
  doubleHeight(on)  { return this._b(GS, 0x21, on ? 0x01 : 0x00); }

  line(str = '')    { return this._s(this._indent + str + '\n'); }
  sep(ch = '-')     { return this._s(this._indent + ch.repeat(this.cols) + '\n'); }

  twoCol(left, right) {
    const r = String(right);
    const l = String(left).substring(0, this.cols - r.length - 1).padEnd(this.cols - r.length);
    return this._s(this._indent + l + r + '\n');
  }

  itemRow(name, qty, price) {
    const q = String(qty);
    const p = String(price);
    const nameWidth = this.cols - q.length - p.length - 2;
    const n = String(name).substring(0, nameWidth).padEnd(nameWidth);
    return this._s(this._indent + `${n} ${q} ${p}` + '\n');
  }

  encode() { return Buffer.concat(this._bufs); }
}

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmt  = (n) => Number(n || 0).toFixed(2);
const date = (d) => new Date(d || Date.now()).toLocaleString('en-US', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
});

function parseSettings(s) {
  s = s || {};
  return {
    headerAlign:  s.headerAlign  || 'center',
    itemAlign:    s.itemAlign    || 'left',
    totalAlign:   s.totalAlign   || 'right',
    footerAlign:  s.footerAlign  || 'center',
    headerDouble: Number(s.headerFontSize || 14) >= 14,
    totalDouble:  Number(s.totalFontSize  || 13) >= 13,
    paddingLeft:  Number(s.paddingLeft || 0),
  };
}

// ─── Logo → ESC/POS raster bitmap ────────────────────────────────────────────
// Converts a PNG/JPG Buffer to GS v 0 ESC/POS bytes, centered on the paper.
// Logo is scaled to ~50% of paper width.
async function logoToEscpos(imageBuffer, paperSize) {
  const Jimp = require('jimp');

  const paperDots  = DOT_WIDTH[String(paperSize)] || 576;
  const paperBytes = paperDots / 8; // full paper row width in bytes

  // Target ~50% of paper width for a clean logo
  const targetWidth = Math.floor(paperDots * 0.5);

  const img = await Jimp.read(imageBuffer);

  // Composite over white to flatten transparency
  const bg = new Jimp(img.bitmap.width, img.bitmap.height, 0xFFFFFFFF);
  bg.composite(img, 0, 0);

  bg.resize(targetWidth, Jimp.AUTO);
  bg.greyscale();

  const w = bg.bitmap.width;
  const h = bg.bitmap.height;
  const logoBytesPerRow = Math.ceil(w / 8);

  // Padding to center logo on full paper width
  const leftPadBytes = Math.max(0, Math.floor((paperBytes - logoBytesPerRow) / 2));
  const totalBytesPerRow = paperBytes;

  const rowData = Buffer.alloc(totalBytesPerRow * h, 0x00);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const { r } = Jimp.intToRGBA(bg.getPixelColor(x, y));
      if (r < 128) {
        const col = leftPadBytes * 8 + x;
        const byteIdx = y * totalBytesPerRow + Math.floor(col / 8);
        const bit = 7 - (col % 8);
        if (byteIdx < rowData.length) rowData[byteIdx] |= (1 << bit);
      }
    }
  }

  const xL = totalBytesPerRow & 0xFF;
  const xH = (totalBytesPerRow >> 8) & 0xFF;
  const yL = h & 0xFF;
  const yH = (h >> 8) & 0xFF;

  return Buffer.concat([
    Buffer.from([GS, 0x76, 0x30, 0x00, xL, xH, yL, yH]),
    rowData,
    Buffer.from([LF]),  // feed one line after logo
  ]);
}

// ─── Receipt generators ───────────────────────────────────────────────────────

function generateTest(shopName, paperSize, receiptSettings, logoBuffer) {
  const cfg = parseSettings(receiptSettings);
  const b = new ESCPOSBuilder(paperSize, cfg.paddingLeft);
  b.init();
  if (logoBuffer) b.raw(logoBuffer);
  b.align(cfg.headerAlign).bold(true).doubleHeight(cfg.headerDouble).line(shopName)
   .doubleHeight(false).bold(false)
   .sep()
   .align(cfg.itemAlign).line('*** TEST RECEIPT ***')
   .line(date())
   .sep()
   .line('Printing is working correctly.')
   .line('Paper width: ' + paperSize + 'mm')
   .sep()
   .feed(3).cut();
  return b.encode();
}

function generateInvoice(fullInvoice, shopName, paperSize, receiptSettings, logoBuffer) {
  const cfg = parseSettings(receiptSettings);
  const b = new ESCPOSBuilder(paperSize, cfg.paddingLeft);

  const inv   = fullInvoice.invoice || fullInvoice;
  const items = fullInvoice.items   || inv.items || inv.InvoiceItems || [];
  const pmts  = fullInvoice.payments || inv.payments || [];

  const totalPaid = pmts.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const change    = totalPaid > (Number(inv.total_amount) || 0)
    ? totalPaid - (Number(inv.total_amount) || 0) : 0;

  b.init();
  if (logoBuffer) b.raw(logoBuffer);

  // Header
  b.align(cfg.headerAlign)
   .bold(true).doubleHeight(cfg.headerDouble).line(shopName)
   .doubleHeight(false).bold(false)
   .line(`Invoice #${inv.invoice_number || inv.id}`)
   .line(date(inv.date_time || inv.created_at))
   .sep();

  if (inv.customer_name) {
    b.align('left').line(`Customer: ${inv.customer_name}`).sep();
  }

  // Items
  b.align(cfg.itemAlign);
  items.forEach(item => {
    const qty   = `x${item.quantity}`;
    const price = fmt(item.line_total ?? item.total_price ?? item.total ?? item.subtotal);
    b.itemRow(item.product_name || item.name || '', qty, price);
  });

  // Totals
  b.sep().align(cfg.totalAlign);
  if (Number(inv.discount) > 0)          b.twoCol('Discount:',   `-${fmt(inv.discount)}`);
  if (Number(inv.additional_amount) > 0) b.twoCol('Additional:', `+${fmt(inv.additional_amount)}`);

  b.bold(true).doubleHeight(cfg.totalDouble)
   .twoCol('TOTAL:', fmt(inv.total_amount ?? inv.total))
   .doubleHeight(false).bold(false);

  if (totalPaid > 0) b.twoCol('Paid:',   fmt(totalPaid));
  if (change > 0)    b.twoCol('Change:', fmt(change));

  const pmtTypes = [...new Set(pmts.map(p => p.payment_type || p.type))].join(' + ');
  if (pmtTypes) b.align('left').line(`Method: ${pmtTypes}`);

  // Footer
  b.sep().align(cfg.footerAlign).line('Thank you for your business!')
   .feed(3).cut();

  return b.encode();
}

function generatePaymentReceipt(receipt, shopName, paperSize, receiptSettings, logoBuffer) {
  const cfg = parseSettings(receiptSettings);
  const b = new ESCPOSBuilder(paperSize, cfg.paddingLeft);

  b.init();
  if (logoBuffer) b.raw(logoBuffer);

  b.align(cfg.headerAlign).bold(true).doubleHeight(cfg.headerDouble).line(shopName)
   .doubleHeight(false).bold(false)
   .line('PAYMENT RECEIPT')
   .line(date(receipt.date))
   .sep()
   .align(cfg.itemAlign)
   .line(`Customer: ${receipt.customerName || ''}`)
   .line(`Payment:  ${receipt.paymentType || 'Cash'}`);

  if (receipt.invoiceNumber) b.line(`Invoice:  #${receipt.invoiceNumber}`);

  b.sep().align(cfg.totalAlign)
   .bold(true).doubleHeight(cfg.totalDouble)
   .twoCol('Amount Paid:', fmt(receipt.amount))
   .doubleHeight(false).bold(false);

  if (receipt.balanceBefore !== undefined) b.twoCol('Balance Before:', fmt(receipt.balanceBefore));
  if (receipt.balanceAfter  !== undefined) b.twoCol('Balance After:',  fmt(receipt.balanceAfter));

  b.sep().align(cfg.footerAlign).line('Thank you!')
   .feed(3).cut();

  return b.encode();
}

module.exports = { generateTest, generateInvoice, generatePaymentReceipt, logoToEscpos };
