/**
 * TITAN.AI — Per-Client Unit Economics Simulator
 * Run: node social-intel/cost-simulator.js
 */

const USD = (n) => '$' + n.toFixed(2);
const USD4 = (n) => '$' + n.toFixed(4);
const pad = (s, n) => s.padEnd(n);

// ── LLM PRICING (per 1M tokens, April 2026) ──
const LLM = {
  'gemini-2.0-flash':  { in: 0.10,  out: 0.40,  name: 'Gemini 2.0 Flash' },
  'gemini-2.5-flash':  { in: 0.30,  out: 2.50,  name: 'Gemini 2.5 Flash' },
  'gemini-2.5-pro':    { in: 1.25,  out: 10.00, name: 'Gemini 2.5 Pro' },
  'claude-haiku':      { in: 1.00,  out: 5.00,  name: 'Claude Haiku 4.5' },
  'claude-sonnet':     { in: 3.00,  out: 15.00, name: 'Claude Sonnet 4.6' },
  'gpt4o-mini':        { in: 0.15,  out: 0.60,  name: 'GPT-4o Mini' },
  'groq-llama-70b':    { in: 0.59,  out: 0.79,  name: 'Groq Llama 70B' },
  'groq-llama-8b':     { in: 0.05,  out: 0.08,  name: 'Groq Llama 8B' },
};

// ── API PRICING ──
const API = {
  exa_search:        0.003,
  exa_contents:      0.001,
  exa_deep:          0.007,    // deep search with structured output
  firecrawl:         0.0053,
  embedding_ada:     0.00011,  // per 1K tokens
  socialkit:         0.0024,
  apify_ig:          0.0026,
  apify_tt:          0.005,
  apify_li:          0.003,
};

function llmCost(inputTok, outputTok, model) {
  return ((inputTok / 1e6) * model.in) + ((outputTok / 1e6) * model.out);
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  TITAN.AI — Per-Client Unit Economics (April 2026)');
console.log('═══════════════════════════════════════════════════════════════');

// ═══════════════════════════════════════════════
// 1. DAILY SCRAPING (per client)
// ═══════════════════════════════════════════════
console.log('');
console.log('┌───────────────────────────────────────────────────────────┐');
console.log('│  1. DAILY SCRAPING (per client)                          │');
console.log('└───────────────────────────────────────────────────────────┘');
console.log('');
console.log('  PC Playwright (primary):          $0.00 (free)');
console.log('  Make.com fallback (when PC off):');
console.log('    IG (Meta Graph API):            $0.00 (free)');
console.log('    IG (Apify fallback):            ' + USD4(API.apify_ig));
console.log('    TT (Apify):                     ' + USD4(API.apify_tt));
console.log('    LI (Apify):                     ' + USD4(API.apify_li));
console.log('    Total per fallback day:          ' + USD4(API.apify_ig + API.apify_tt + API.apify_li));
console.log('');
const fallbackDaysPerMonth = 8;
const scrapeMonthlyCost = (API.apify_ig + API.apify_tt + API.apify_li) * fallbackDaysPerMonth;
console.log('  Monthly (8 fallback days avg):     ' + USD4(scrapeMonthlyCost) + '/client');

// ═══════════════════════════════════════════════
// 2. WEEKLY AI ANALYSIS REPORT
// ═══════════════════════════════════════════════
console.log('');
console.log('┌───────────────────────────────────────────────────────────┐');
console.log('│  2. WEEKLY AI ANALYSIS REPORT (per client per week)      │');
console.log('└───────────────────────────────────────────────────────────┘');
console.log('');

// Analysis pipeline:
// a) Metrics summary: 2K in + 1.5K out
// b) Trend analysis: 3K in + 2K out
// c) Competitor comparison: 4K in + 2K out
// d) Recommendations: 3K in + 2K out
// e) Report formatting: 5K in + 3K out
const reportSteps = [
  { name: 'Metrics summary',      inTok: 2000,  outTok: 1500 },
  { name: 'Trend analysis',       inTok: 3000,  outTok: 2000 },
  { name: 'Competitor comparison', inTok: 4000,  outTok: 2000 },
  { name: 'Recommendations',      inTok: 3000,  outTok: 2000 },
  { name: 'Report formatting',    inTok: 5000,  outTok: 3000 },
];

let totalReportIn = 0, totalReportOut = 0;
for (const step of reportSteps) {
  totalReportIn += step.inTok;
  totalReportOut += step.outTok;
}

console.log('  LLM calls: ' + reportSteps.length + ' steps');
console.log('  Total tokens: ' + totalReportIn.toLocaleString() + ' in + ' + totalReportOut.toLocaleString() + ' out');
console.log('');
console.log('  Per-report cost by model:');

const reportCosts = {};
for (const [key, model] of Object.entries(LLM)) {
  const cost = llmCost(totalReportIn, totalReportOut, model);
  const monthly = cost * 4.33;
  reportCosts[key] = { per: cost, monthly };
  console.log('    ' + pad(model.name, 22) + ' ' + USD4(cost) + '/report = ' + USD4(monthly) + '/month');
}

// Exa trend research (1 search + 3 competitor news searches per week)
const exaWeekly = (1 * API.exa_deep) + (3 * API.exa_search) + (4 * API.exa_contents);
console.log('');
console.log('  Exa trend research:    ' + USD4(exaWeekly) + '/week = ' + USD4(exaWeekly * 4.33) + '/month');
console.log('');
console.log('  ★ RECOMMENDED STACK:');
const recReportCost = reportCosts['gemini-2.5-flash'].per + exaWeekly;
console.log('    Gemini 2.5 Flash + Exa = ' + USD4(recReportCost) + '/report = ' + USD(recReportCost * 4.33) + '/month');

// ═══════════════════════════════════════════════
// 3. COMPETITOR MOVEMENT ALERTS
// ═══════════════════════════════════════════════
console.log('');
console.log('┌───────────────────────────────────────────────────────────┐');
console.log('│  3. COMPETITOR MOVEMENT ALERTS (per client per day)      │');
console.log('└───────────────────────────────────────────────────────────┘');
console.log('');

// Daily: compare metrics, detect spikes, generate alert if needed
// Most days = no alert (just comparison) — ~1K in + 200 out
// Alert day (~2x/week) — additional 1K in + 500 out for formatting
const alertCheckIn = 1000, alertCheckOut = 200;
const alertGenIn = 1000, alertGenOut = 500;
const alertDaysPerWeek = 2; // avg alerts triggered

console.log('  Daily check:     ' + alertCheckIn + ' in + ' + alertCheckOut + ' out tokens');
console.log('  Alert (2x/week): ' + alertGenIn + ' in + ' + alertGenOut + ' out tokens');
console.log('');

for (const [key, model] of Object.entries(LLM)) {
  const dailyCost = llmCost(alertCheckIn, alertCheckOut, model);
  const alertCost = llmCost(alertGenIn, alertGenOut, model);
  const weeklyCost = (dailyCost * 7) + (alertCost * alertDaysPerWeek);
  const monthlyCost = weeklyCost * 4.33;
  console.log('    ' + pad(model.name, 22) + ' ' + USD4(monthlyCost) + '/month');
}

// Make.com notification cost (Telegram/email via Make)
const makeAlertOps = 5 * alertDaysPerWeek * 4.33; // ~5 ops per alert
console.log('');
console.log('  Make.com ops for alerts: ~' + Math.round(makeAlertOps) + ' ops/month (negligible)');

// ═══════════════════════════════════════════════
// 4. VIDEO SCRIPTING PIPELINE
// ═══════════════════════════════════════════════
console.log('');
console.log('┌───────────────────────────────────────────────────────────┐');
console.log('│  4. VIDEO SCRIPTING PIPELINE (per script)                │');
console.log('└───────────────────────────────────────────────────────────┘');
console.log('');

// Step 1: Research — scrape 3-5 web sources
const researchSources = 5;
const step1_exa = (researchSources * API.exa_search) + (researchSources * API.exa_contents);
const step1_firecrawl = researchSources * API.firecrawl;

console.log('  STEP 1: Research Agent (3-5 web sources)');
console.log('    Option A: Exa search + extract = ' + USD4(step1_exa));
console.log('    Option B: Firecrawl scrape     = ' + USD4(step1_firecrawl));
console.log('');

// Step 2: RAG retrieval — embed query, search vectors
const step2_embed = (500 / 1000) * API.embedding_ada;
console.log('  STEP 2: RAG/Knowledge Base Retrieval');
console.log('    Embed query (500 tokens):       ' + USD4(step2_embed) + ' (negligible)');
console.log('    Supabase pgvector search:        $0.00 (free tier)');
console.log('');

// Step 3: Script generation (research + RAG context + brand voice → script)
const step3_in = 12000;  // research(5K) + RAG(3K) + brand voice(2K) + prompt(2K)
const step3_out = 2500;  // full video script

console.log('  STEP 3: Script Generation');
console.log('    Input: ' + step3_in.toLocaleString() + ' tokens (research + RAG + brand voice + prompt)');
console.log('    Output: ' + step3_out.toLocaleString() + ' tokens (video script)');
console.log('');

for (const [key, model] of Object.entries(LLM)) {
  console.log('    ' + pad(model.name, 22) + ' ' + USD4(llmCost(step3_in, step3_out, model)));
}
console.log('');

// Step 4: Refinement/polish pass
const step4_in = 5000;   // script + style guide + feedback
const step4_out = 2500;  // refined script

console.log('  STEP 4: Refinement/Polish Pass');
console.log('    Input: ' + step4_in.toLocaleString() + ' + Output: ' + step4_out.toLocaleString() + ' tokens');
console.log('');

for (const [key, model] of Object.entries(LLM)) {
  console.log('    ' + pad(model.name, 22) + ' ' + USD4(llmCost(step4_in, step4_out, model)));
}

// Step 5 (optional): Thumbnail/hook generation
const step5_in = 2000;
const step5_out = 500;

console.log('');
console.log('  STEP 5: Hook/Thumbnail Copy (optional)');
for (const [key, model] of Object.entries(LLM)) {
  console.log('    ' + pad(model.name, 22) + ' ' + USD4(llmCost(step5_in, step5_out, model)));
}

// Total per script
console.log('');
console.log('  ────────────────────────────────────────');
console.log('  TOTAL PER SCRIPT:');
console.log('');

const stacks = [
  {
    name: 'Budget (Gemini Flash all)',
    research: step1_exa,
    embed: step2_embed,
    gen: llmCost(step3_in, step3_out, LLM['gemini-2.0-flash']),
    refine: llmCost(step4_in, step4_out, LLM['gemini-2.0-flash']),
    hook: llmCost(step5_in, step5_out, LLM['gemini-2.0-flash']),
  },
  {
    name: 'Smart (Flash gen + Sonnet refine)',
    research: step1_exa,
    embed: step2_embed,
    gen: llmCost(step3_in, step3_out, LLM['gemini-2.5-flash']),
    refine: llmCost(step4_in, step4_out, LLM['claude-sonnet']),
    hook: llmCost(step5_in, step5_out, LLM['gemini-2.0-flash']),
  },
  {
    name: 'Premium (Sonnet all)',
    research: step1_exa,
    embed: step2_embed,
    gen: llmCost(step3_in, step3_out, LLM['claude-sonnet']),
    refine: llmCost(step4_in, step4_out, LLM['claude-sonnet']),
    hook: llmCost(step5_in, step5_out, LLM['claude-sonnet']),
  },
  {
    name: 'Groq (free tier, 8B)',
    research: step1_exa,
    embed: step2_embed,
    gen: llmCost(step3_in, step3_out, LLM['groq-llama-8b']),
    refine: llmCost(step4_in, step4_out, LLM['groq-llama-8b']),
    hook: llmCost(step5_in, step5_out, LLM['groq-llama-8b']),
  },
];

for (const stack of stacks) {
  const total = stack.research + stack.embed + stack.gen + stack.refine + stack.hook;
  const scriptsPerWeek = 4;
  const monthly = total * scriptsPerWeek * 4.33;
  console.log('  ' + pad(stack.name, 38) + USD4(total) + '/script');
  console.log('  ' + pad('', 38) + USD(monthly) + '/month (at ' + scriptsPerWeek + ' scripts/week)');
  console.log('');
}

// ═══════════════════════════════════════════════
// 5. EMBEDDING / KNOWLEDGE BASE MAINTENANCE
// ═══════════════════════════════════════════════
console.log('┌───────────────────────────────────────────────────────────┐');
console.log('│  5. EMBEDDINGS & KNOWLEDGE BASE (per client per month)   │');
console.log('└───────────────────────────────────────────────────────────┘');
console.log('');

// Per client: embed ~50 posts/month × avg 200 tokens = 10K tokens
// + embed research articles: ~20/month × 2K tokens = 40K tokens
// + embed brand voice/wiki: one-time ~5K tokens, updates ~2K/month
const monthlyEmbedTokens = (50 * 200) + (20 * 2000) + 2000; // = 52K tokens
const monthlyEmbedCost = (monthlyEmbedTokens / 1000) * API.embedding_ada;
console.log('  Posts embedded: ~50/month × 200 tokens');
console.log('  Research articles: ~20/month × 2K tokens');
console.log('  Wiki updates: ~2K tokens/month');
console.log('  Total: ' + monthlyEmbedTokens.toLocaleString() + ' tokens/month');
console.log('  Cost: ' + USD4(monthlyEmbedCost) + '/month (negligible)');
console.log('');
console.log('  Supabase vector storage: free tier (500 MB)');
console.log('  At 200 clients: ~100 MB → still free');
console.log('  Supabase Pro trigger: ~500+ clients ($25/mo)');

// ═══════════════════════════════════════════════
// 6. TOTAL COST PER CLIENT
// ═══════════════════════════════════════════════
console.log('');
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  TOTAL MONTHLY COST PER CLIENT');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

const tiers = [
  {
    name: 'BASIC (scraping + weekly report only)',
    scraping: scrapeMonthlyCost,
    report: reportCosts['gemini-2.0-flash'].monthly + (exaWeekly * 4.33),
    alerts: 0,
    scripts: 0,
    embeddings: monthlyEmbedCost,
    makeOps: 0,
    scriptsPerWeek: 0,
  },
  {
    name: 'STANDARD (+ alerts + 2 scripts/week)',
    scraping: scrapeMonthlyCost,
    report: reportCosts['gemini-2.5-flash'].monthly + (exaWeekly * 4.33),
    alerts: llmCost(alertCheckIn, alertCheckOut, LLM['gemini-2.0-flash']) * 30 + llmCost(alertGenIn, alertGenOut, LLM['gemini-2.0-flash']) * 8,
    scripts: stacks[1].research + stacks[1].embed + stacks[1].gen + stacks[1].refine + stacks[1].hook,
    embeddings: monthlyEmbedCost,
    makeOps: 0,
    scriptsPerWeek: 2,
  },
  {
    name: 'PREMIUM (+ alerts + 4 scripts/week + premium LLM)',
    scraping: scrapeMonthlyCost,
    report: reportCosts['claude-sonnet'].monthly + (exaWeekly * 4.33),
    alerts: llmCost(alertCheckIn, alertCheckOut, LLM['gemini-2.5-flash']) * 30 + llmCost(alertGenIn, alertGenOut, LLM['claude-sonnet']) * 8,
    scripts: stacks[2].research + stacks[2].embed + stacks[2].gen + stacks[2].refine + stacks[2].hook,
    embeddings: monthlyEmbedCost,
    makeOps: 0,
    scriptsPerWeek: 4,
  },
];

for (const tier of tiers) {
  const scriptMonthly = tier.scripts * tier.scriptsPerWeek * 4.33;
  const total = tier.scraping + tier.report + tier.alerts + scriptMonthly + tier.embeddings;
  console.log('  ' + tier.name);
  console.log('    Scraping:       ' + USD4(tier.scraping));
  console.log('    Weekly report:  ' + USD4(tier.report));
  console.log('    Alerts:         ' + USD4(tier.alerts));
  console.log('    Scripts:        ' + USD4(scriptMonthly) + ' (' + tier.scriptsPerWeek + '/week)');
  console.log('    Embeddings:     ' + USD4(tier.embeddings));
  console.log('    ─────────────────────────');
  console.log('    TOTAL:          ' + USD(total) + '/client/month');
  console.log('');
}

// ═══════════════════════════════════════════════
// 7. FIXED MONTHLY COSTS (not per-client)
// ═══════════════════════════════════════════════
console.log('═══════════════════════════════════════════════════════════════');
console.log('  FIXED MONTHLY COSTS (shared across all clients)');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('  Make.com Teams plan:          $0 (already paying)');
console.log('  Supabase free tier:           $0');
console.log('  SocialKit (emergency only):   $0-13/month');
console.log('  Domain/hosting:               ~$5/month');
console.log('  Exa API minimum:              ~$0 (pay-as-you-go)');
console.log('  Apify free tier:              $0 (up to ~80 clients)');
console.log('  ─────────────────────────────────────');
console.log('  TOTAL FIXED:                  ~$5-18/month');
console.log('');

// Dev/maintenance time
console.log('  DEV & MAINTENANCE TIME:');
console.log('    Dashboard updates:          ~2 hrs/month');
console.log('    New client onboarding:      ~30 min/client');
console.log('    Bug fixes / monitoring:     ~2 hrs/month');
console.log('    Feature development:        ~4-8 hrs/month');
console.log('    ─────────────────────────────────────');
console.log('    TOTAL:                      ~8-12 hrs/month');
console.log('');
const devRatePerHour = 50; // SGD or equivalent
console.log('    At $' + devRatePerHour + '/hr internal cost:  ' + USD(10 * devRatePerHour) + '/month');

// ═══════════════════════════════════════════════
// 8. PRICING RECOMMENDATIONS
// ═══════════════════════════════════════════════
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  PRICING RECOMMENDATIONS');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

const pricingTiers = [
  { name: 'BASIC', cost: 0.15, includes: 'Social monitoring + weekly PDF report', scripts: 0 },
  { name: 'STANDARD', cost: 1.50, includes: '+ competitor alerts + 2 video scripts/week', scripts: 2 },
  { name: 'PREMIUM', cost: 3.50, includes: '+ premium AI analysis + 4 scripts/week + priority', scripts: 4 },
];

console.log('  ┌────────────┬───────────┬───────────┬──────────┬──────────┐');
console.log('  │ Tier       │ Your Cost │ Price     │ Margin   │ Margin % │');
console.log('  ├────────────┼───────────┼───────────┼──────────┼──────────┤');

for (const pt of pricingTiers) {
  for (const price of [99, 199, 299, 499]) {
    if ((pt.name === 'BASIC' && price > 199) ||
        (pt.name === 'STANDARD' && (price < 199 || price > 299)) ||
        (pt.name === 'PREMIUM' && price < 299)) continue;

    const margin = price - pt.cost - (500 / 34); // share of fixed costs
    const marginPct = ((margin / price) * 100).toFixed(0);
    console.log('  │ ' + pad(pt.name, 10) + ' │ ' + pad(USD(pt.cost), 9) + ' │ ' + pad('$' + price + '/mo', 9) + ' │ ' + pad(USD(margin), 8) + ' │ ' + pad(marginPct + '%', 8) + ' │');
  }
}

console.log('  └────────────┴───────────┴───────────┴──────────┴──────────┘');
console.log('');
console.log('  Note: "Your Cost" = API costs only. Dev time ($500/mo) is');
console.log('  amortised across all clients in the margin calculation.');
console.log('');

// Breakeven analysis
console.log('  BREAKEVEN ANALYSIS:');
const fixedCosts = 500 + 18; // dev time + fixed infra
for (const price of [99, 199, 299]) {
  const breakeven = Math.ceil(fixedCosts / (price - 3.50)); // worst case PREMIUM cost
  console.log('    At $' + price + '/client/mo: breakeven at ' + breakeven + ' clients');
}
console.log('');

// Scale projections
console.log('  REVENUE PROJECTIONS (at $199/client/month STANDARD):');
for (const clients of [5, 10, 20, 34, 50, 100]) {
  const revenue = clients * 199;
  const varCost = clients * 1.50;
  const totalCost = fixedCosts + varCost;
  const profit = revenue - totalCost;
  const margin = ((profit / revenue) * 100).toFixed(0);
  console.log('    ' + pad(clients + ' clients:', 14) + USD(revenue) + ' revenue - ' + USD(totalCost) + ' cost = ' + USD(profit) + ' profit (' + margin + '% margin)');
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  KEY INSIGHT: API costs are near-zero. The product is');
console.log('  >95% margin. Price based on VALUE delivered, not cost.');
console.log('═══════════════════════════════════════════════════════════════');
