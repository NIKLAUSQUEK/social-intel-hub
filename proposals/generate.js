#!/usr/bin/env node
/**
 * Proposal generator — zero-faff edition.
 *
 * Usage:
 *   node generate.js <client-slug>
 *     → reads ./input/<slug>.json, writes ./out/proposal-<slug>.html, opens it.
 *
 *   node generate.js <client-slug> --no-open
 *     → same but does not auto-open the browser.
 *
 *   node generate.js paste
 *     → opens a prompt where you paste JSON, then writes + opens.
 *
 * What it does:
 *   - Reads proposal-template.html
 *   - Replaces the window.PROPOSAL_DATA = {...}; block with your JSON
 *   - Writes a standalone .html file
 *   - Opens it in your default browser (Cmd/Ctrl+P from there → Save as PDF)
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(__dirname, 'proposal-template.html');
const INPUT_DIR = path.join(__dirname, 'input');
const OUT_DIR = path.join(__dirname, 'out');

function ensureDirs() {
  if (!fs.existsSync(INPUT_DIR)) fs.mkdirSync(INPUT_DIR, { recursive: true });
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
}

function buildHtml(data) {
  const tpl = fs.readFileSync(TEMPLATE, 'utf8');
  // Match: window.PROPOSAL_DATA = {  ...  };
  const re = /window\.PROPOSAL_DATA\s*=\s*\{[\s\S]*?\n\};/m;
  if (!re.test(tpl)) throw new Error('Could not find PROPOSAL_DATA block in template.');
  const json = JSON.stringify(data, null, 2);
  return tpl.replace(re, `window.PROPOSAL_DATA = ${json};`);
}

function openInBrowser(filePath) {
  const cmd = process.platform === 'win32' ? `start "" "${filePath}"`
    : process.platform === 'darwin' ? `open "${filePath}"`
    : `xdg-open "${filePath}"`;
  exec(cmd, (err) => { if (err) console.warn('  (could not auto-open — open manually:', filePath, ')'); });
}

async function readStdinJson() {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    let buf = '';
    console.log('Paste JSON below. Press Ctrl+D (Mac/Linux) or Ctrl+Z then Enter (Windows) when done:\n');
    rl.on('line', (l) => { buf += l + '\n'; });
    rl.on('close', () => {
      try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('Invalid JSON: ' + e.message)); }
    });
  });
}

async function main() {
  ensureDirs();
  const args = process.argv.slice(2);
  const slug = args[0];
  const noOpen = args.includes('--no-open');

  if (!slug) {
    console.error('Usage: node generate.js <client-slug>   (reads ./input/<slug>.json)');
    console.error('       node generate.js paste           (paste JSON via stdin)');
    process.exit(1);
  }

  let data;
  if (slug === 'paste') {
    data = await readStdinJson();
  } else {
    const inputPath = path.join(INPUT_DIR, `${slug}.json`);
    if (!fs.existsSync(inputPath)) {
      console.error(`✗ Not found: ${inputPath}`);
      console.error(`  Drop your JSON here as <slug>.json and re-run, or use:  node generate.js paste`);
      process.exit(1);
    }
    data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  }

  const outName = slug === 'paste' ? `proposal-${data?.meta?.clientName?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'client'}.html` : `proposal-${slug}.html`;
  const outPath = path.join(OUT_DIR, outName);
  const html = buildHtml(data);
  fs.writeFileSync(outPath, html, 'utf8');

  console.log(`✓ Wrote ${outPath}`);
  console.log(`  Client: ${data?.meta?.clientName || '(unknown)'}`);
  console.log(`  Sections: ${countSections(data)}`);

  if (!noOpen) {
    console.log(`  Opening in browser…`);
    openInBrowser(outPath);
  }
}

function countSections(d) {
  const keys = ['snapshot','audience','hooks','funnel','competitorBenchmarks','trendGaps','education','abPhilosophy','differentiation','portfolio','roadmap','pricing','nextSteps'];
  return keys.filter(k => d?.[k]).length + ' / ' + keys.length;
}

main().catch(e => { console.error('✗', e.message); process.exit(1); });
