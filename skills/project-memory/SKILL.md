---
name: project-memory
description: Recall and maintain this project's long-term memory — indexed docs and code symbols, lessons, decisions, procedures, and cross-session tasks. Use it before re-deriving project context or repeating a past mistake.
---

# Project memory

This repository keeps a memory store at `.dsh-project-memory/` (path configurable). It holds three
kinds of things:

1. **Indexed corpus** — documents (Markdown / PDF / text) and code symbols, with `path:line`
   citations.
2. **Insights** — lessons (`problem → fix`), decisions (`choice + reason`), procedures (steps), and
   experience notes. These are written by agents, across sessions.
3. **Tasks** — cross-session work records with steps and hot files. A session can be bound to one.

Query it before re-deriving; write to it only after something has been verified.

## What this store is about

The subject is **this project's own conventions**, not the operator's global agent instructions:

- `AGENTS.md` at the project root, `docs/` (architecture, design, style guides), README — all of them
  land in the `doc` layer as chunks and are reachable through `query_memory` (`indexDocs` gates this;
  with the default `indexDocs: false` the store holds code symbols only).
- Chunks whose heading matches a normative word (必须 / 禁止 / 规则 / 约定 / 清单 / rules / must /
  never …) rank at ×1.5 in the `doc` layer, so "what does this project require" questions surface the
  rules section first.
- The `doc` layer is **not** part of the per-step silent injection (`agent/pre-step` injects insights
  only). Project rules take effect every turn through the host's own instruction injection; this store
  is the retrievable, citable copy.
- `~/.dsh/AGENTS.md` and profile-level rules belong to the operator's global setup — do not copy them
  here, and do not write project decisions there.

## When to query

- Before asking the human to re-explain the project, a past decision, or "what were we doing".
- Before changing a subsystem: there may be a lesson about its failure modes.
- Before an irreversible action (commit / publish / release / push / deploy / migrate): the store may
  know a prerequisite you would otherwise miss.
- When resuming: call `list_tasks`, then `select_task` if one matches the current work.

## Workflow

1. **Locate context**
   - `query_memory` with `query` = what you actually need ("how are shards written", "why store
     scope", "where is X implemented").
   - `type`: `all` (default) / `experience` / `insight` / `task`. `doc` / `symbol` are rejected
     with a pointer instead of an empty result: corpus indexing is off (`corpusEnabled: false`) —
     code structure belongs to `codegraph_explore`, note corpus to `search_notes`.
   - Results carry ids and citations. Treat them as evidence: read the cited file when the answer
     matters.
2. **Check what the store holds**
   - `pm_stats` — insight / task / experience counts, plus the optional vector layer.
   - `index_repo` / `index_doc` / `watch_repo` exist only when `corpusEnabled: true`; with the
     default `false` they are not registered at all, because code structure is served by
     `codegraph_explore` and note corpus by `search_notes`.
3. **Write back what will still be true next session**
   - `save_lesson` — one insight. Give `kind` (`lesson` / `decision` / `procedure`), a one-line
     `title`, and the body: `pattern` + `fix`, or `choice` + `reason`, or `steps`.
   - `remember problem solution` — shorthand for `kind: experience`.
   - `files`: project-relative paths the conclusion is about.
   - `category`: which aspect it belongs to — `style` / `arch` / `data` / `test` / `perf` /
     `security` / `deploy` / `docs` / `tooling`. Set it whenever the entry is about one aspect:
     it derives that aspect's intent words into `trigger.when.intents` and it makes the entry
     topic-gated at injection (only injected when the current step is about that aspect).
     An uncategorized entry is injected on its trigger alone — that is how "everything gets
     injected" happens.
   - `trigger.when`: when this should be recalled. `ops` (action), `writes` (file about to change),
     `intents` (words the human would use). `guard` only narrows; `prevents` records what breaks
     without it. Do **not** write a trigger you have not seen fire. Prefer a specific `writes` over
     the catch-all `ops: ['file-write']` — the catch-all fires on every write and, for a
     categorized entry, is the one trigger shape the topic gate is allowed to veto.
   - `scope`: `task` (needs a bound task), `project` (default), `global` (rarely).
4. **Correct or delete**
   - Same `id` + new fields = in-place update (old value kept in `prev`).
   - `forget id_or_query` is a real delete, no undo. Prefer ids; keyword deletes refuse when too many
     entries match.

## Rules

- Memory is evidence, not authority. Re-check the file before acting on a citation.
- Do not save: progress narration, temporary state, secrets/credentials, anything derivable from the
  code in one read.
- One durable entry beats five observations. Merge by updating the existing id.
- Write in the same language the project uses; keep titles short and searchable.
- The store self-ignores in git; do not commit it unless the human explicitly wants memory in the repo.

## Diagnostics

Run from a shell (no dsh required):

```bash
node <this-skill-dir>/scripts/pm-digest.mjs <project-root>
node <this-skill-dir>/scripts/pm-digest.mjs <project-root> --json
node <this-skill-dir>/scripts/pm-digest.mjs <project-root> --memory-dir <name>

# reflection 草稿（draft:true）先看清单，再审核并提升到 project 级
node <this-skill-dir>/scripts/pm-insights-sweep.mjs <project-root> --dry-run
node <this-skill-dir>/scripts/pm-insights-sweep.mjs <project-root>
```

`pm-digest.mjs` prints store size, insight/task counts, trigger coverage, and staleness.
`pm-insights-sweep.mjs` runs the same `actInsight()` the panel uses (`confirm` then `promote`), so it
keeps usage trails, near-duplicate merging, and `maxProject` pruning; it is a no-op when no draft is
pending. Pass `--min-confidence`, `--max-project`, `--decay-days` to mirror the profile's `insight.*`.

The store directory is usually
`.dsh-project-memory`; if the project configures another `memoryDir`, pass it with `--memory-dir`
(or `DSH_PROJECT_MEMORY_DIR`) — without either, a single store-shaped directory directly under the
root is picked up and reported as `auto-detected`, and the "no memory store" message says how to pass it.
