import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Where lead-gen keeps its JSON (gitignored data/; /tmp on Vercel). */
export const DATA_DIR = process.env.LEADGEN_DATA_DIR
  || (process.env.VERCEL ? '/tmp/leads' : join(__dirname, '..', 'data', 'leads'));
