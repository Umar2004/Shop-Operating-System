/**
 * Print utility functions for generating HTML receipts and invoices
 */

/**
 * Generate HTML for test receipt
 */
export function generateTestReceiptHTML(settings) {
  const { 
    shopName = 'Shop Operating Platform', 
    paperSize = '80',
    receiptSettings = {}
  } = settings;
  
  // Receipt customization settings with defaults
  const {
    headerAlign = 'center',
    itemAlign = 'left',
    totalAlign = 'right',
    footerAlign = 'center',
    fontSize = '12',
    headerFontSize = '14',
    itemFontSize = '11',
    totalFontSize = '13',
    padding = '10',
    paddingLeft = '0',
    paddingRight = '0',
    lineSpacing = '1.3',
  } = receiptSettings;
  const now = new Date();
  const dateTime = now.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const widths = {
    '58': '200px',
    '76': '280px',
    '80': '300px',
  };
  const width = widths[paperSize] || '300px';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @media print {
      @page {
        size: ${width} auto;
        margin: 0;
      }
      body {
        margin: 0;
        padding: ${padding}px ${parseInt(paddingRight || '0')}px ${padding}px ${parseInt(paddingLeft || '0')}px;
        width: ${width};
        font-family: 'Courier New', monospace;
        font-size: ${fontSize}px;
      }
    }
    body {
      margin: 0;
      padding: ${padding}px ${parseInt(paddingRight || '0')}px ${padding}px ${parseInt(paddingLeft || '0')}px;
      width: ${width};
      font-family: 'Courier New', monospace;
      font-size: ${fontSize}px;
      line-height: ${lineSpacing};
      box-sizing: border-box;
    }
    .header {
      text-align: ${headerAlign};
      margin-bottom: 10px;
      font-weight: bold;
      font-size: ${headerFontSize}px;
    }
    .separator {
      text-align: ${headerAlign};
      margin: 10px 0;
      border-top: 1px dashed #000;
      padding-top: 5px;
    }
    .content {
      text-align: ${itemAlign};
      margin: 10px 0;
    }
    .footer {
      text-align: ${footerAlign};
      margin-top: 10px;
      font-size: ${parseInt(fontSize) - 2}px;
    }
  </style>
</head>
<body>
  <div class="header">${shopName}</div>
  <div class="separator">--------------------</div>
  <div class="content">
    <div style="font-weight: bold; margin-bottom: 5px;">Printer Test OK</div>
    <div>Paper: ${paperSize}mm</div>
  </div>
  <div class="separator">--------------------</div>
  <div class="footer">${dateTime}</div>
</body>
</html>
  `.trim();
}

/**
 * Generate HTML for invoice receipt
 */
export function generateInvoiceHTML(invoiceData, settings) {
  const { 
    shopName = 'Shop Operating Platform', 
    paperSize = '80', 
    printLogo = false, 
    logoUrl = null,
    receiptSettings = {}
  } = settings;
  
  // Receipt customization settings with defaults
  const {
    headerAlign = 'center',
    itemAlign = 'left',
    totalAlign = 'right',
    footerAlign = 'center',
    fontSize = '12',
    headerFontSize = '14',
    itemFontSize = '11',
    totalFontSize = '13',
    padding = '10',
    paddingLeft = '0',
    paddingRight = '0',
    lineSpacing = '1.3',
  } = receiptSettings;
  
  const widths = {
    '58': '200px',
    '76': '280px',
    '80': '300px',
  };
  const width = widths[paperSize] || '300px';

  // Handle both direct invoice object and API response structure
  const invoice = invoiceData.invoice || invoiceData;
  const items = invoiceData.items || invoice.items || [];
  const payments = invoiceData.payments || invoice.payments || [];

  const date = new Date(invoice.date_time || invoice.created_at || new Date()).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Format items
  const itemsHTML = items.map(item => {
    const name = item.product_name || 'Unknown';
    const qty = item.quantity || 0;
    const price = parseFloat(item.unit_price || 0).toFixed(2);
    const total = parseFloat(item.line_total || 0).toFixed(2);
    return `
      <tr>
        <td>${name}</td>
        <td style="text-align: right;">${qty} x ${price}</td>
        <td style="text-align: right;">${total}</td>
      </tr>
    `;
  }).join('') || '';

  // Calculate totals from invoice
  const subtotal = parseFloat(invoice.total_amount || 0).toFixed(2);
  const discount = parseFloat(invoice.discount || 0).toFixed(2);
  const additionalAmount = parseFloat(invoice.additional_amount || 0).toFixed(2);
  // For now, tax is 0 (can be added later if needed)
  const tax = '0.00';
  const total = (parseFloat(invoice.total_amount || 0) + parseFloat(additionalAmount || 0) - parseFloat(discount || 0)).toFixed(2);
  
  // Get paid amount from payments if available
  let paid = '0.00';
  let balance = '0.00';
  let change = '0.00';
  if (payments && Array.isArray(payments)) {
    paid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0).toFixed(2);
    balance = (parseFloat(total) - parseFloat(paid)).toFixed(2);
    change = (parseFloat(paid) - parseFloat(total)).toFixed(2);
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @media print {
      @page {
        size: ${width} auto;
        margin: 0;
      }
      body {
        margin: 0;
        padding: ${padding}px ${parseInt(paddingRight || '0')}px ${padding}px ${parseInt(paddingLeft || '0')}px;
        width: ${width};
        font-family: 'Courier New', monospace;
        font-size: ${fontSize}px;
      }
    }
    body {
      margin: 0;
      padding: ${padding}px ${parseInt(paddingRight || '0')}px ${padding}px ${parseInt(paddingLeft || '0')}px;
      width: ${width};
      font-family: 'Courier New', monospace;
      font-size: ${fontSize}px;
      line-height: ${lineSpacing};
      box-sizing: border-box;
    }
    .header {
      text-align: ${headerAlign};
      margin-bottom: 10px;
    }
    .shop-name {
      font-weight: bold;
      font-size: ${headerFontSize}px;
      margin-bottom: 5px;
    }
    .separator {
      text-align: center;
      margin: 8px 0;
      border-top: 1px dashed #000;
      padding-top: 5px;
    }
    .info {
      margin: 5px 0;
    }
    .info-label {
      font-weight: bold;
    }
    table {
      width: 100%;
      margin: 10px 0;
      border-collapse: collapse;
    }
    table td {
      padding: 2px 0;
      border-bottom: 1px dotted #ccc;
      text-align: ${itemAlign};
    }
    table td:last-child {
      text-align: ${totalAlign};
    }
    .totals {
      margin-top: 10px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      margin: 3px 0;
    }
    .total-row {
      text-align: ${totalAlign};
    }
    .total-row.grand {
      font-weight: bold;
      font-size: ${totalFontSize}px;
      margin-top: 8px;
      padding-top: 5px;
      border-top: 2px solid #000;
    }
    .footer {
      text-align: ${footerAlign};
      margin-top: 15px;
      font-size: ${parseInt(fontSize) - 2}px;
    }
  </style>
</head>
<body>
  <div class="header">
    ${printLogo && logoUrl ? `<div style="margin-bottom: 5px; text-align: center;"><img src="${logoUrl}" alt="Logo" style="max-width: 150px; max-height: 60px; object-fit: contain;" /></div>` : ''}
    <div class="shop-name">${shopName}</div>
  </div>
  <div class="separator">--------------------</div>
  <div class="info" style="text-align: ${itemAlign};">
    <div><span class="info-label">Invoice:</span> ${invoice.invoice_number || 'N/A'}</div>
    <div><span class="info-label">Date:</span> ${date}</div>
    ${invoice.customer_name ? `<div><span class="info-label">Customer:</span> ${invoice.customer_name}</div>` : ''}
  </div>
  <div class="separator">--------------------</div>
  <table style="width: 100%;">
    ${itemsHTML}
  </table>
  <div class="separator">--------------------</div>
  <div class="totals">
    <div class="total-row">
      <span>Subtotal:</span>
      <span>${subtotal}</span>
    </div>
    ${parseFloat(additionalAmount) > 0 ? `
    <div class="total-row">
      <span>Additional:</span>
      <span>${additionalAmount}</span>
    </div>
    ` : ''}
    ${parseFloat(discount) > 0 ? `
    <div class="total-row">
      <span>Discount:</span>
      <span>-${discount}</span>
    </div>
    ` : ''}
    ${parseFloat(tax) > 0 ? `
    <div class="total-row">
      <span>Tax:</span>
      <span>${tax}</span>
    </div>
    ` : ''}
    <div class="total-row grand">
      <span>BILL TOTAL:</span>
      <span>${total}</span>
    </div>
    <div class="total-row">
      <span>Amount Paid:</span>
      <span>${paid}</span>
    </div>
    ${parseFloat(balance) > 0 ? `
    <div class="total-row" style="font-weight: bold;">
      <span>Balance:</span>
      <span>${balance}</span>
    </div>
    ` : ''}
    ${parseFloat(change) > 0 ? `
    <div class="total-row" style="font-weight: bold;">
      <span>Change:</span>
      <span>${change}</span>
    </div>
    ` : ''}
  </div>
  <div class="separator">--------------------</div>
  <div class="footer">Thank you for your business!</div>
</body>
</html>
  `.trim();
}

/**
 * Generate HTML for credit payment receipt
 */
export function generateReceiptHTML(receiptData, settings) {
  const { 
    shopName = 'Shop Operating Platform', 
    paperSize = '80', 
    printLogo = false, 
    logoUrl = null,
    receiptSettings = {}
  } = settings;
  
  // Receipt customization settings with defaults
  const {
    headerAlign = 'center',
    itemAlign = 'left',
    totalAlign = 'right',
    footerAlign = 'center',
    fontSize = '12',
    headerFontSize = '14',
    itemFontSize = '11',
    totalFontSize = '13',
    padding = '10',
    paddingLeft = '0',
    paddingRight = '0',
    lineSpacing = '1.3',
  } = receiptSettings;
  
  const widths = {
    '58': '200px',
    '76': '280px',
    '80': '300px',
  };
  const width = widths[paperSize] || '300px';

  const date = new Date(receiptData.date || new Date()).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const amount = parseFloat(receiptData.amount || 0).toFixed(2);
  const balanceBefore = parseFloat(receiptData.balanceBefore || 0).toFixed(2);
  const balanceAfter = parseFloat(receiptData.balanceAfter || 0).toFixed(2);
  const invoiceTotal = receiptData.invoiceTotal ? parseFloat(receiptData.invoiceTotal).toFixed(2) : null;
  const invoiceDiscount = receiptData.invoiceDiscount ? parseFloat(receiptData.invoiceDiscount).toFixed(2) : null;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @media print {
      @page {
        size: ${width} auto;
        margin: 0;
      }
      body {
        margin: 0;
        padding: ${padding}px ${parseInt(paddingRight || '0')}px ${padding}px ${parseInt(paddingLeft || '0')}px;
        width: ${width};
        font-family: 'Courier New', monospace;
        font-size: ${fontSize}px;
      }
    }
    body {
      margin: 0;
      padding: ${padding}px ${parseInt(paddingRight || '0')}px ${padding}px ${parseInt(paddingLeft || '0')}px;
      width: ${width};
      font-family: 'Courier New', monospace;
      font-size: ${fontSize}px;
      line-height: ${lineSpacing};
      box-sizing: border-box;
    }
    .header {
      text-align: ${headerAlign};
      margin-bottom: 10px;
    }
    .shop-name {
      font-weight: bold;
      font-size: ${headerFontSize}px;
      margin-bottom: 5px;
    }
    .separator {
      text-align: center;
      margin: 10px 0;
      border-top: 1px dashed #000;
      padding-top: 5px;
    }
    .info {
      margin: 8px 0;
      text-align: ${itemAlign};
    }
    .info-label {
      font-weight: bold;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      margin: 3px 0;
      text-align: ${totalAlign};
    }
    .amount {
      text-align: ${totalAlign};
      font-size: ${totalFontSize}px;
      font-weight: bold;
      margin: 15px 0;
    }
    .footer {
      text-align: ${footerAlign};
      margin-top: 15px;
      font-size: ${parseInt(fontSize) - 2}px;
    }
  </style>
</head>
<body>
  <div class="header">
    ${printLogo && logoUrl ? `<div style="margin-bottom: 5px; text-align: center;"><img src="${logoUrl}" alt="Logo" style="max-width: 150px; max-height: 60px; object-fit: contain;" /></div>` : ''}
    <div class="shop-name">${shopName}</div>
  </div>
  <div class="separator">--------------------</div>
  <div class="info">
    <div style="text-align: ${headerAlign}; font-weight: bold; margin-bottom: 10px; font-size: ${headerFontSize}px;">PAYMENT RECEIPT</div>
    <div><span class="info-label">Customer:</span> ${receiptData.customerName || 'N/A'}</div>
    <div><span class="info-label">Date:</span> ${date}</div>
    ${receiptData.invoiceNumber ? `<div><span class="info-label">Invoice:</span> ${receiptData.invoiceNumber}</div>` : ''}
    <div><span class="info-label">Payment Type:</span> ${receiptData.paymentType || 'Cash'}</div>
  </div>
  <div class="separator">--------------------</div>
  ${invoiceTotal ? `
  <div class="info">
    <div class="total-row">
      <span>Bill Total:</span>
      <span>${invoiceTotal}</span>
    </div>
    ${invoiceDiscount && parseFloat(invoiceDiscount) > 0 ? `
    <div class="total-row">
      <span>Discount:</span>
      <span>-${invoiceDiscount}</span>
    </div>
    ` : ''}
  </div>
  <div class="separator">--------------------</div>
  ` : ''}
  <div class="info">
    <div class="total-row">
      <span>Previous Balance:</span>
      <span>${balanceBefore}</span>
    </div>
    <div class="total-row" style="font-weight: bold;">
      <span>Amount Paid:</span>
      <span>${amount}</span>
    </div>
    <div class="total-row" style="font-weight: bold; margin-top: 5px; padding-top: 5px; border-top: 1px solid #000;">
      <span>New Balance:</span>
      <span>${balanceAfter}</span>
    </div>
  </div>
  <div class="separator">--------------------</div>
  <div class="footer">Thank you for your payment!</div>
</body>
</html>
  `.trim();
}

