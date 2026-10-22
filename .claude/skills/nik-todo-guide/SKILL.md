---
name: nik-todo-guide
description: Write Nik's to-do items and how-to guides in his favourite "To-do page" format. Nik is a non-technical physio founder with ADHD. Use whenever Nik must do something himself, in any project or chat. That includes creating an account, signing up, getting an API key or credential, setting up a store, domain, payment or company, approving or deciding something, or following steps in a website or dashboard. Also use when he asks for a guide, checklist, to-do, setup steps or "how do I". It covers a checklist table, click-by-click steps with direct links and where things are on screen, marked screenshots, verification labels, a machine-readable JSON twin, and a short progress line in chat.
---

# Nik's To-do guides

Nik loves one format: the To-do page. Every task he must do himself goes into that format, in every project and every chat. Never give him the full steps in chat. Put them on the page and give him one line plus the link.

## 1. Where the page lives

- **In a repo that has `docs/nik/todo/TODO.md`:** add items there.
  - Rebuild it with `python3 docs/nik/build_page.py docs/nik/todo/TODO.md docs/nik/todo.html "Nik's To-do"`.
  - Republish to the URL listed in `docs/nik/DOC_LINKS.md`. Never make a second To-do page.
- **In a repo without one:** create `docs/nik/todo/TODO.md` from `assets/todo_page_template.md` and its pictures folder `docs/nik/todo/img/`.
  - Build it with `python3 ${CLAUDE_SKILL_DIR}/scripts/build_page.py <md> <html> "<title>"` (falls back to `scripts/build_page.py` in chat).
  - Publish it as a private Artifact. Record the URL in `docs/nik/DOC_LINKS.md`.
- **In a plain chat (no repo):** build the same page as a private Artifact (or a doc, if the host offers one). Reuse the same page for the rest of the conversation.

## 2. Page layout (always this order)

1. **Title:** "Nik's to-do list: <project>".
2. **Date line:** "Written <date>. Every guide was checked against the official docs that day. Menus may have moved since."
3. **Stuck tip:** "🆘 Stuck? Send me a screenshot of your screen (cover any keys) and I'll circle exactly where to click."
4. **Safety line:** "Never paste a secret into the chat," plus where each secret goes instead.
5. **Checklist table** with these columns: `# | Item (link to its section) | Why | Time | Cost | Blocks launch? | Status | Checked`.
6. **One section per item**, written with `assets/todo_item_template.md`.

## 3. Every item has these parts, in this order

- **Why:** one sentence on what it unlocks.
- **Time and cost:** for example "15 minutes. Free." If there's waiting, show a small table of your time, waiting time and cost per part.
- **Order:** for multi-part items, a small flow diagram (a ```mermaid block) showing what comes first and where the waits are.
- **Before you start:** the logins and things to have open.
- **Option A / Option B:** if Claude can do it, Option A is "reply 'do it' and Claude does it". Option B is doing it yourself.
- **Steps:** numbered, one action per step. Each step has:
  - 🔗 **a direct link** that goes straight to the page (a deep link), checked;
  - 📍 **where it is on screen**, as a breadcrumb plus location, e.g. "Left sidebar, near the bottom: ⚙️ Project Settings → API Keys";
  - the exact button text in **bold**, and exact values to type in `code`;
  - **what you should see after**;
  - **a picture** for the key steps, marked up (section 5).
- **What to send back / where to paste:** never secrets in chat. Say exactly where the secret goes instead.
- **How you know it worked:** the exact thing he should see.
- **If it looks different:** the most likely reason and the fix.
- **Verification:** ✅ Verified, ⚠️ Partly verified or ❓ Not verified.
  - Give the official source links and the date checked.
  - Say plainly which steps come from memory or from help text rather than a seen screen.

## 4. Honesty rules (no guessing)

- Check every rule, fee, waiting time and link against the provider's official page **today**, with web search or fetch. Quote the official wording where it matters.
- Prefer official sources. If you use a secondary source (e.g. a blog), say so and label the item ⚠️.
- **Never fake a screenshot** of a logged-in screen. If the screen is behind a login and no official image exists, write "No picture: <reason>". Describe the screen in words instead.
- Plain words and short sentences. Explain any unavoidable technical word in 3–5 words in brackets.
- Never ask Nik to paste passwords, API keys or tokens into chat.

## 5. Pictures

1. Use only real images:
   - official screenshots from the provider's docs (credit the URL);
   - or a Playwright screenshot of a **public** page. For example: `npx playwright screenshot --viewport-size=1280,900 <url> shot.png`, or a short Node script with `waitUntil: 'domcontentloaded'` plus a few seconds' wait.
2. Mark them up: `python3 ${CLAUDE_SKILL_DIR}/scripts/mark_screenshot.py <in.png> <out-marked.png> "x0,y0,x1,y1,STEP" [...]`.
   - It draws a red rounded box and a numbered circle that matches the step number.
   - Keep the original next to the `-marked` copy.
3. Look at the result before using it: the box must sit on the right button.
4. Add both files to the "Images" table at the bottom of the page, with their source.

## 6. TITAN-ready twin (always)

Nik's agent, TITAN OS, reads the to-do list as data. After editing `TODO.md`, regenerate the JSON twin:

`python3 ${CLAUDE_SKILL_DIR}/scripts/todo_json.py docs/nik/todo/TODO.md docs/nik/todo/TODO.json`

- Each item is `{id: "todo-NN", title, anchor, why, time, cost, blocks_launch, status, verify, links[]}`.
- Optional `subtasks[]` have stable ids like `todo-13a`.
- Never renumber existing items. Add new ones at the end.

## 7. In the chat reply

Keep the chat short and sorted. Follow the `nik-comms` skill if it's available. Otherwise use these sections:
- **✅ Updates**
- **📝 Your to-do**
- **⏳ Running now**
- **💡 Good to know**
- **❓ I need from you**

In the **📝 Your to-do** section:
- Show one line per new item, linked to the page.
- Add a **focus line**: the next 1–3 tasks, each with its time and what it unlocks. For example "25 min, phone on silent".
- Add a **progress line** when a tracker exists, e.g. `PeachForm launch ▓▓▓▓▓░░░░░ 48%`. Never invent a percentage.

Also include one short, genuine line of praise for something Nik actually did.

## 8. Checklist before you publish

- [ ] Every item has all the parts in section 3.
- [ ] Every link was opened or found on the provider's official docs today.
- [ ] Every picture is real, credited, and marked on the right spot.
- [ ] The verification labels are honest, with the reasons written down.
- [ ] `TODO.json` is regenerated, the page is rebuilt, and it's republished to the **same** URL.
- [ ] The Updates log mentions the new item (if the project has one).
