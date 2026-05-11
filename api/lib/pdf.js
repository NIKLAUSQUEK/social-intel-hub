/**
 * PDF generation via Playwright — renders HTML string to PDF buffer
 */

import { chromium } from 'playwright';

/**
 * Render an HTML string to a PDF buffer
 * @param {string} html - Full HTML document string
 * @param {object} opts - PDF options
 * @returns {Promise<Buffer>} PDF buffer
 */
export async function htmlToPdf(html, opts = {}) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });

    // Allow fonts to load
    await page.waitForTimeout(1500);

    const pdfBuffer = await page.pdf({
      format: opts.format || 'A4',
      printBackground: true,
      margin: opts.margin || { top: '0.5cm', bottom: '1cm', left: '0.8cm', right: '0.8cm' },
      displayHeaderFooter: opts.showFooter !== false,
      headerTemplate: '<span></span>',
      footerTemplate: opts.footerTemplate || '<div style="width:100%;text-align:center;font-size:9px;color:#94A3B8;font-family:sans-serif;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });

    return pdfBuffer;
  } finally {
    if (browser) await browser.close();
  }
}
