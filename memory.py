"""Writes agent completions as Obsidian-compatible markdown notes.

When any agent fires a done event with an answer, ObsidianMemory writes a note
into the vault under Agents/<project>/ and keeps a rolling _Index.md that any
agent can read to understand what has already been done across the ecosystem.

The /api/memory endpoint calls ObsidianMemory.recent() so agents can query
completions before starting a new task.

Context pages:
  Agents/You.md  — who Ian is, how he thinks, communication style
  Agents/Org.md  — active projects, priorities, key people

These are always loaded in full via context_pages() and exposed at
/api/memory/context so every agent can read them before starting work.
"""

import os
import re
import threading
from collections import deque
from datetime import datetime


def _slug(text, limit=60):
    """Turn free text into a safe, readable filename fragment."""
    text = re.sub(r"[^\w\s-]", "", (text or "").lower())
    text = re.sub(r"\s+", " ", text).strip()
    words = text.split()
    slug = ""
    for w in words:
        if len(slug) + len(w) + 1 > limit:
            break
        slug = (slug + " " + w).strip()
    return slug or "task"


class ObsidianMemory:
    """Writes agent completions as notes in an Obsidian vault.

    Vault layout:
        Agents/
            _Index.md                   ← rolling table of recent completions
            <Project>/
                YYYY-MM-DD <slug>.md    ← one note per completed task

    Pass vault_path=None (or an invalid path) to disable silently.
    """

    AGENTS_DIR = "Agents"
    INDEX_FILE = "Agents/_Index.md"
    MAX_RECENT = 200

    def __init__(self, vault_path=None):
        self.vault = vault_path
        self.lock = threading.Lock()
        self._recent = deque(maxlen=self.MAX_RECENT)

    def _enabled(self):
        return bool(self.vault and os.path.isdir(self.vault))

    def write_completion(self, agent):
        """Write a note when an agent finishes a task. agent is the view dict."""
        if not self._enabled():
            return
        answer = (agent.get("answer") or "").strip()
        if not answer:
            return

        prompt = (agent.get("last_prompt") or "").strip()
        project = agent.get("project") or "unknown"
        agent_name = agent.get("name") or agent["id"]
        now = datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M")
        iso = now.strftime("%Y-%m-%dT%H:%M:%S")
        cost = agent.get("cost_usd") or 0.0
        tokens = sum((agent.get("tokens") or {}).values())
        cwd = agent.get("cwd") or ""

        slug = _slug(prompt or "task")
        filename = f"{date_str} {slug}.md"
        note_path = f"{self.AGENTS_DIR}/{project}/{filename}"

        tag_project = re.sub(r"[^\w-]", "-", project.lower())
        note = (
            f"---\n"
            f"agent: {agent_name}\n"
            f"project: {project}\n"
            f"date: {iso}\n"
            f"cwd: {cwd}\n"
            f"tags:\n"
            f"  - webgentz/done\n"
            f"  - project/{tag_project}\n"
            f"cost_usd: {cost:.4f}\n"
            f"tokens: {tokens}\n"
            f"---\n\n"
            f"# {slug.title()}\n\n"
            f"**Prompt:** {prompt or '(no prompt recorded)'}\n\n"
            f"**Answer:**\n\n"
            f"{answer}\n\n"
            f"---\n"
            f"[[{project}]] · [[{date_str}]]\n"
        )

        entry = {
            "date": iso,
            "project": project,
            "agent": agent_name,
            "cwd": cwd,
            "prompt": prompt,
            "answer": answer,
            "cost_usd": cost,
            "tokens": tokens,
            "note": note_path,
        }

        with self.lock:
            try:
                folder = os.path.join(self.vault, self.AGENTS_DIR, project)
                os.makedirs(folder, exist_ok=True)
                full_path = os.path.join(self.vault, self.AGENTS_DIR, project, filename)
                if os.path.exists(full_path):
                    for i in range(2, 100):
                        alt = f"{date_str} {slug} {i}.md"
                        if not os.path.exists(os.path.join(folder, alt)):
                            filename = alt
                            full_path = os.path.join(folder, filename)
                            entry["note"] = f"{self.AGENTS_DIR}/{project}/{filename}"
                            break
                with open(full_path, "w", encoding="utf-8") as f:
                    f.write(note)
                self._recent.appendleft(entry)
                self._update_index(date_str, time_str, project, agent_name, slug, cost, filename)
            except OSError as exc:
                print(f"[memory] could not write note: {exc}")

    def _update_index(self, date_str, time_str, project, agent_name, slug, cost, filename):
        """Rewrite _Index.md with the newest entry at the top."""
        index_path = os.path.join(self.vault, self.INDEX_FILE)
        os.makedirs(os.path.dirname(index_path), exist_ok=True)

        note_link = filename[:-3]  # strip .md for Obsidian wikilink
        new_row = f"| {date_str} {time_str} | [[{project}]] | {agent_name} | [[{note_link}]] | ${cost:.3f} |"

        header = (
            "# Agent Memory\n\n"
            "> Notes written by your agents as they finish tasks.\n"
            "> An agent can read this index before starting work to understand what has already been done.\n\n"
            "| When | Project | Agent | Task | Cost |\n"
            "|------|---------|-------|------|------|\n"
        )

        existing_rows = []
        if os.path.exists(index_path):
            with open(index_path, encoding="utf-8") as f:
                for line in f:
                    stripped = line.rstrip()
                    if stripped.startswith("| ") and not stripped.startswith("| When") and not stripped.startswith("|---"):
                        existing_rows.append(stripped)

        rows = [new_row] + existing_rows[:self.MAX_RECENT - 1]
        with open(index_path, "w", encoding="utf-8") as f:
            f.write(header)
            f.write("\n".join(rows) + "\n")

    def recent(self, n=20, project=None):
        """Return the n most recent completions, optionally filtered by project."""
        with self.lock:
            items = list(self._recent)
        if project:
            items = [e for e in items if e["project"] == project]
        return items[:n]

    # ---------------------------------------------------------------- vault search

    CONTEXT_PAGES = ["Agents/You.md", "Agents/Org.md"]

    def context_pages(self):
        """Return the full text of You.md and Org.md for agent context injection."""
        if not self._enabled():
            return []
        results = []
        for rel in self.CONTEXT_PAGES:
            path = os.path.join(self.vault, rel)
            if os.path.isfile(path):
                try:
                    text = open(path, encoding="utf-8").read()
                    results.append({"path": rel, "content": text})
                except OSError:
                    pass
        return results

    def search(self, query, n=20, project=None):
        """Full-text search across all .md files in the vault.

        Returns up to n results, each with the file path, note title (first #
        heading), and the matched line plus one line of context either side.
        Skips _Index.md (too noisy) and the context pages (returned separately).
        """
        if not self._enabled() or not query:
            return []

        skip = {os.path.join(self.vault, p) for p in [self.INDEX_FILE] + self.CONTEXT_PAGES}
        pattern = re.compile(re.escape(query), re.IGNORECASE)
        results = []

        for dirpath, _, filenames in os.walk(self.vault):
            for fname in filenames:
                if not fname.endswith(".md"):
                    continue
                full = os.path.join(dirpath, fname)
                if full in skip:
                    continue
                rel = os.path.relpath(full, self.vault)
                # Optional project filter: Agents/<project>/...
                if project and not rel.startswith(f"Agents/{project}/"):
                    continue
                try:
                    lines = open(full, encoding="utf-8").read().splitlines()
                except OSError:
                    continue

                title = next((l.lstrip("#").strip() for l in lines if l.startswith("#")), fname[:-3])

                for i, line in enumerate(lines):
                    if pattern.search(line):
                        start, end = max(0, i - 1), min(len(lines), i + 2)
                        snippet = "\n".join(lines[start:end])
                        results.append({
                            "path": rel,
                            "title": title,
                            "snippet": snippet,
                        })
                        if len(results) >= n:
                            return results
                        break  # one match per file is enough

        return results
