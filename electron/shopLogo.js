// The shop logo for printing (used by electron/main.js).
// The backend serves the current logo at /api/settings/logo, from the right folder (UPLOADS_DIR) and whatever its
// file is called (logo.png, logo.jpg, ... per the shop.logo_path setting). Printing asks it instead of guessing a
// path; when there is no logo or it can't be had, the receipt prints without it, never blocking a sale.
const http = require('http');

const SHOP_LOGO_URL = 'http://127.0.0.1:4000/api/settings/logo';
// The receipt HTML's logo <img> (print.js points it at the logo endpoint)
const LOGO_IMG_TAG = /<img[^>]*src="[^"]*\/api\/settings\/logo[^"]*"[^>]*>/g;

module.exports = ({ BrowserWindow, log }) => {
  // Resolves to { data, type } or null (no logo set, or the backend didn't answer)
  function fetchShopLogo(url = SHOP_LOGO_URL) {
    return new Promise((resolve) => {
      const req = http.get(url, { timeout: 3000 }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          log('PRINTER', `No shop logo to print (logo endpoint answered ${res.statusCode})`);
          resolve(null);
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const type = String(res.headers['content-type'] || 'image/png').split(';')[0].trim();
          resolve({ data: Buffer.concat(chunks), type });
        });
        res.on('error', (err) => {
          log('PRINTER', `Shop logo download failed: ${err.message}`, true);
          resolve(null);
        });
      });
      req.on('timeout', () => req.destroy(new Error('timed out after 3 s')));
      req.on('error', (err) => {
        log('PRINTER', `Shop logo not available: ${err.message}`, true);
        resolve(null);
      });
    });
  }

  // Jimp (the ESC/POS raster) reads PNG, JPEG, GIF and BMP, but the logo upload also allows WebP. Chromium decodes
  // any of them: draw the image on a canvas in a hidden window and take a PNG back.
  async function logoAsPng(logo) {
    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
    try {
      await win.loadURL('about:blank');
      const src = `data:${logo.type};base64,${logo.data.toString('base64')}`;
      const png = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext('2d').drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('the image could not be decoded'));
        img.src = ${JSON.stringify(src)};
      })`);
      return Buffer.from(png.split(',')[1], 'base64');
    } finally {
      win.destroy();
    }
  }

  // The print window would have to download a remote logo while printing starts, so it printed blank. Put the image
  // itself in the HTML (a data: URI, like the footer mark), or drop the <img> when there is no logo to show.
  async function inlineShopLogo(html, url = SHOP_LOGO_URL) {
    if (!html.match(LOGO_IMG_TAG)) return html;
    const logo = await fetchShopLogo(url);
    if (logo) log('PRINTER', `Shop logo inlined (${logo.type}, ${logo.data.length} bytes)`);
    return html.replace(LOGO_IMG_TAG, (tag) =>
      logo ? tag.replace(/src="[^"]*"/, `src="data:${logo.type};base64,${logo.data.toString('base64')}"`) : ''
    );
  }

  return { fetchShopLogo, logoAsPng, inlineShopLogo };
};
