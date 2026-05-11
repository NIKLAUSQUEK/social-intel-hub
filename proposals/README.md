# TITAN.AI Proposal Generator

Zero-API-cost workflow. You generate the JSON in Claude chat (free with your subscription), paste it into the HTML template, save, done.

## Files

- `PROMPT.md` — master prompt. Paste into Claude.
- `proposal-template.html` — single-file proposal with sample F&B data already embedded. Open in browser to preview.
- `samples/` — additional JSON payloads (add as you build them).

## Structure (70 / 30 split)

The proposal is engineered with a strict 70% client / 30% TITAN ratio:

**70% client-focused (sections 01-06.5 + 09):**
- 01 Opportunity Snapshot — wins + risks
- 02 Audience + Pain Points
- 03 Hook Architecture (5 formulas in client's voice)
- 04 Funnel Engine (TOF/MOF/BOF)
- 05 Competitor Playbooks
- 06 Trend Gaps to Own
- **06.5 — 2026 Playbook (Education)** — content pillar system, aesthetic codes, repurposing tree, format velocity. Niche-specific, never generic.
- 09 Roadmap (90 days)

**30% TITAN-focused (sections 07-08.5 + 10-11):**
- 07 A/B Testing Process
- 08 Why TITAN.AI (differentiators)
- 08.5 Portfolio / Results
- 10 Pricing (Starter / Growth / Agency)
- 11 CTA

## Workflow

1. **Pull the source data.** From the social-intel app, export for the target client:
   - Brand report PDF/JSON
   - Metrics audit output (if available)
   - Competitor discovery output (if available)
   - Trending audio / trend-jacking output (if available)

2. **Generate the JSON.** Open Claude chat (web/app — uses your subscription, no API spend). Paste `PROMPT.md` contents, then paste the client context block at the bottom. Claude returns a single JSON object.

3. **Paste into the template.**
   - Open `proposal-template.html` in a text editor.
   - Find the `window.PROPOSAL_DATA = { ... };` block near the top of the `<script>` tag.
   - Replace the entire object with the JSON Claude returned.
   - Save as `proposal-{client-slug}.html` (e.g. `proposal-haeclaypot.html`).

4. **Open in browser.** Double-click the HTML file. The proposal renders with TITAN.AI branding, reveal animations, and full pricing.

5. **Export PDF (optional).** In the browser:
   - Cmd/Ctrl + P → Destination: Save as PDF
   - Layout: Portrait
   - Margins: Default
   - Background graphics: ON
   - The CSS `@media print` rules already optimise for 7-page output.

## Tips

- **Voice matching.** If the client is hawker-style F&B, tell Claude in EXTRA_CONTEXT: "tone is casual local Singlish-friendly, no corporate jargon". Claude will mirror it in hooks + examplePost fields.
- **Multiple proposals.** Keep one master `proposal-template.html` and copy it per client. The JSON block is the only thing that changes.
- **Proposal ID.** Use format `TTN-{YYYY}-{MMDD}-{XXX}` where XXX is a 3-letter client code (e.g. `HCP` for Hae Claypot).
- **Pricing changes.** Edit pricing in the JSON, not the HTML. The HTML is purely a renderer.

## Cost

- HTML template: free (one-time build)
- Claude chat for JSON generation: included in your Claude Pro/Max subscription — no API key burned
- PDF export: free (browser print)

Total per proposal: ~5 minutes of work, $0 in API costs.

## Troubleshooting

| Issue | Fix |
|---|---|
| Page renders blank | JSON syntax error — paste into [jsonlint.com](https://jsonlint.com) to find the bad comma |
| Pricing tier missing | Check `pricing.tiers` array has exactly 3 entries |
| Reveal animations not firing | Hard reload (Cmd/Ctrl + Shift + R) — IntersectionObserver caches |
| Print cuts mid-section | Add `page-break-inside: avoid` to the affected section in the print CSS |
| Fonts not loading offline | Save once with internet connection; browser caches Google Fonts |

## Roadmap

- [ ] CLI helper: `node generate.js --client haeclaypot` that pulls brand report from `data/{client}/` and pre-fills the prompt input block
- [ ] Headless PDF export via Playwright (so non-technical staff can run a one-liner)
- [ ] Branded cover page variant for enterprise pitches
