"""Build one of Nik's pages (To-do, guides) from Markdown into the house HTML style.

Usage: python3 build_page.py <input.md> <output.html> "<Page title>"
Needs the `markdown` package (pip install markdown). Image paths in the Markdown
are kept relative to the output file, so publish the images with the page.
"""
import os
import re
import sys

import markdown

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700'
         '&family=Bricolage+Grotesque:opsz,wght@12..96,700&display=swap">')
EXTRA_CSS = """
article{display:flex;flex-direction:column;gap:6px}
article h1{margin-bottom:6px} article h2{margin-top:30px;padding-top:18px;border-top:1px solid var(--line)}
article img{border:1px solid var(--line);border-radius:10px;margin:8px 0}
article ol{display:flex;flex-direction:column;gap:8px;padding-left:1.4em}
article code{background:var(--line);padding:1px 5px;border-radius:5px;font-size:.9em;word-break:break-word}
article p{margin:6px 0}
article blockquote{margin:8px 0;padding:8px 14px;border-left:4px solid var(--accent);background:var(--surface);border-radius:0 8px 8px 0}
pre.mermaid{background:var(--surface);overflow-x:auto}
"""
TAGS = [("✅ Verified", "ok"), ("⚠️ Partly verified", "warn"), ("❓ Not verified", "warn")]


def build(src, out, title):
    md = open(src, encoding="utf-8").read()
    rel = os.path.relpath(os.path.dirname(os.path.abspath(src)), os.path.dirname(os.path.abspath(out)))
    if rel != ".":
        md = re.sub(r"\]\((?!https?:|#|/)([^)]+)\)", lambda m: f"]({rel}/{m.group(1)})", md)
    mermaid = []
    md = re.sub(r"```mermaid\n(.*?)```", lambda m: (mermaid.append(m.group(1)), f"\n\nMERMAID{len(mermaid) - 1}\n\n")[1], md, flags=re.S)
    html = markdown.markdown(md, extensions=["tables", "toc", "sane_lists"])
    for i, block in enumerate(mermaid):
        html = html.replace(f"<p>MERMAID{i}</p>", f'<pre class="mermaid">{block}</pre>')
    html = html.replace("<table>", '<div class="tw"><table>').replace("</table>", "</table></div>")
    for label, cls in TAGS:
        html = html.replace(label, f'<span class="tag {cls}">{label}</span>')
    css = open(os.path.join(HERE, "..", "assets", "style.css"), encoding="utf-8").read() + EXTRA_CSS
    with open(out, "w", encoding="utf-8") as f:
        f.write(f"<title>{title}</title>\n{FONTS}\n<style>\n{css}</style>\n<main><article>\n{html}\n</article></main>\n")


if __name__ == "__main__":
    build(*sys.argv[1:4])
