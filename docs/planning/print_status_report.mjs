// Prints the status report HTML to an A4 landscape PDF with the frontend's
// Playwright Chromium (run `npm ci` in frontend/ first). Fails if any page's
// content runs past its page.
//   node docs/planning/print_status_report.mjs <report.html> <out.pdf>
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '..', '..', 'frontend', 'package.json'));
const { chromium } = require('playwright');
const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error('usage: print_status_report.mjs <report.html> <out.pdf>'); process.exit(2); }

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve(input)).href);
const overflow = await page.$$eval('.page', (ps) => ps.map((p, i) => (p.scrollHeight > p.clientHeight + 1 ? i + 1 : 0)).filter(Boolean));
if (overflow.length) { console.error(`content runs past page(s) ${overflow.join(', ')}`); await browser.close(); process.exit(1); }
await page.pdf({ path: output, format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(`wrote ${output}`);
