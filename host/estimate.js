/**
 * Context-item pricing: the same fixed-density heuristic DSH's own
 * `@deepseek-ai/dsh-token-meter/estimate` uses (4 chars ≈ 1 token, one
 * 4-token block framing, one 4-token role framing), plus the two
 * breakdowns the context-composition card needs to say *what* is in there:
 * one row per tool definition and one row per system-prompt section.
 *
 * Pure, no DSH imports: plain values in, plain values out, so the Host fold
 * and its unit test can both call it.
 *
 * Mirrors `client.context.js#estimate*` (a browser window module cannot share
 * a Node module), so both copies must be edited together.
 */

/** Fixed text density used by DSH's context estimator. */
export const CHARS_PER_TOKEN = 4;
/** Per-block structural overhead (JSON framing and type tags). */
export const BLOCK_OVERHEAD = 4;
/** Role-field framing added to every priced message. */
export const ROLE_OVERHEAD = 4;

/** Heuristic price of one non-text content block. */
export function estimateStructuralBlock(block) {
  if (block !== null && typeof block === 'object' && block.type === 'image') {
    const { offloaded: _offloaded, ...reference } = block;
    return BLOCK_OVERHEAD + Math.ceil(JSON.stringify(reference).length / CHARS_PER_TOKEN);
  }
  return BLOCK_OVERHEAD + Math.ceil(JSON.stringify(block ?? null).length / CHARS_PER_TOKEN);
}

/** Heuristic price of a content-block list. */
export function estimateContent(blocks) {
  if (!Array.isArray(blocks)) return 0;
  let tokens = 0;
  for (const block of blocks) {
    if (block === null || typeof block !== 'object') continue;
    if (block.type === 'text' || block.type === 'reasoning') {
      tokens += Math.ceil(String(block.text ?? '').length / CHARS_PER_TOKEN) + BLOCK_OVERHEAD;
    } else if (block.type === 'tool-call') {
      tokens += Math.ceil(String(block.name ?? '').length / CHARS_PER_TOKEN)
        + Math.ceil(String(block.arguments ?? '').length / CHARS_PER_TOKEN)
        + BLOCK_OVERHEAD;
    } else {
      tokens += estimateStructuralBlock(block);
    }
  }
  return tokens;
}

/** Heuristic price of a rendered system prompt (text density + role framing). */
export function estimateSystemMessage(message) {
  const content = Array.isArray(message?.content) ? message.content : [];
  if (content.length === 0) return 0;
  let characters = 0;
  for (const block of content) {
    characters += block?.type === 'text' ? String(block.text ?? '').length : JSON.stringify(block).length;
  }
  return Math.ceil(characters / CHARS_PER_TOKEN) + ROLE_OVERHEAD;
}

/** Heuristic price of one model-visible message. */
export function estimateMessage(message) {
  if (message?.role === 'system') return estimateSystemMessage(message);
  return estimateContent(message?.content) + ROLE_OVERHEAD;
}

/** Heuristic price of the tool-schema part of a canonical request envelope. */
export function estimateToolsTokens(header) {
  const tools = header?.tools;
  if (!Array.isArray(tools) || tools.length === 0) return 0;
  return Math.ceil(JSON.stringify(tools).length / CHARS_PER_TOKEN) + BLOCK_OVERHEAD;
}

// ── breakdowns ──────────────────────────────────────────────────────────────

const MAX_TOOL_ROWS = 120;
const MAX_SECTIONS = 40;
const SECTION_PREVIEW = 160;
const TOOL_DESC_PREVIEW = 90;
/**
 * Body text kept per section and per tool schema. The card shows it on demand
 * ("展开"), so this is the read window for one item — large enough to read a
 * whole section of a harness prompt, small enough that a 40-section projection
 * stays a few hundred KB instead of copying the whole prompt into every frame.
 */
const SECTION_BODY = 12000;
const TOOL_BODY = 6000;
/**
 * Total body budget per prompt / per tool list. A projection frame is copied
 * into every snapshot read, so the detail is bounded as a whole rather than
 * per item: the biggest sections get their full text, the tail keeps only its
 * preview and is flagged `truncated`.
 */
const SECTION_BODY_BUDGET = 64000;
const TOOL_BODY_BUDGET = 80000;

/** Collapse whitespace so a preview stays one readable line. */
function oneLine(text, limit) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > limit ? flat.slice(0, limit) + '…' : flat;
}

/**
 * One row per tool definition: its own heuristic price (name + description +
 * JSON of the parameter schema), so the card can rank the schemas that eat
 * the prompt. The rows do not sum to `estimateToolsTokens` exactly — that
 * total prices the whole array including its separators — so a caller shows
 * the total from {@link estimateToolsTokens} and treats these as shares.
 */
export function toolRowsOf(header) {
  const tools = header?.tools;
  if (!Array.isArray(tools) || tools.length === 0) return [];
  const rows = [];
  for (const tool of tools) {
    if (tool === null || typeof tool !== 'object') continue;
    const name = String(tool.name ?? '?');
    // The schema as the model receives it: this is what "what is in the
    // context" means for a tool — its name, description and parameter JSON.
    const body = JSON.stringify(tool, null, 1);
    const chars = body.length;
    rows.push({
      name,
      tokens: Math.max(1, Math.ceil(chars / CHARS_PER_TOKEN)),
      chars,
      description: oneLine(tool.description, TOOL_DESC_PREVIEW),
      body: body.length > TOOL_BODY ? body.slice(0, TOOL_BODY) + '\n…（已截断）' : body,
      truncated: body.length > TOOL_BODY,
    });
    if (rows.length >= MAX_TOOL_ROWS) break;
  }
  // Bodies are assigned under one budget, largest schemas first, so the reader
  // gets whole definitions for the expensive tools instead of 86 fragments.
  const ranked = [...rows].sort((a, b) => b.chars - a.chars);
  let left = TOOL_BODY_BUDGET;
  const keep = new Set();
  for (const row of ranked) {
    if (left <= 0) break;
    keep.add(row.name);
    left -= Math.min(row.chars, TOOL_BODY);
  }
  for (const row of rows) {
    if (keep.has(row.name)) continue;
    row.body = '';
    row.truncated = row.chars > 0;
  }
  return rows;
}

/** A rule/banner line: decoration, never a section label itself. */
function isRuleLine(line) {
  const text = line.trim();
  return /^[═─━=*_~-]{4,}$/.test(text);
}

/** A line that names the block it opens: markdown heading, tag line, 【…】. */
function isHeadingLine(line) {
  const text = line.trim();
  if (text === '' || text.length > 120) return false;   // prose, not a heading
  if (/^#{1,4}\s/.test(text)) return true;               // markdown heading
  if (/^<\/?[A-Za-z][\w.:-]*>?$/.test(text)) return true; // <project_instructions>
  if (/^【[^】]{1,40}】/.test(text)) return true;          // 【门禁】style heading
  if (/^\*\*[^*]{1,60}\*\*:?$/.test(text)) return true;  // **Bold label**
  return false;
}

/** A line that only ends a block: a rule, or a closing tag of its own. */
function isBoundaryLine(line) {
  const text = line.trim();
  if (isRuleLine(text)) return true;
  return /^<\/[A-Za-z][\w.:-]*>$/.test(text) || /^\/+[A-Za-z][\w.:-]*$/.test(text);
}

/** Readable label for one section: the heading line, stripped of decoration. */
function sectionLabel(line) {
  const text = String(line ?? '').trim()
    .replace(/^#{1,4}\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/^<\/?|>$/g, '')
    .replace(/^\/+/, '')
    .trim();
  return text === '' ? '(段落)' : oneLine(text, 60);
}

/**
 * Split a rendered system prompt into sections with per-section price, so the
 * composition card can say which part of a 30K-char prompt costs what.
 *
 * Splitting is line-based: a heading line ({@link isHeadingLine}) opens a
 * section and is named after itself; a rule or closing tag
 * ({@link isBoundaryLine}) closes one without naming anything; a bare
 * `(段落)` label is used only for a block that neither opened nor closed with a
 * name. Prompts with no recognizable structure stay one section rather than
 * fragmenting per line.
 *
 * `tokens` is the section's text density only (no role framing) — the caller
 * shows `estimateSystemMessage` as the total.
 */
export function systemSectionsOf(text) {
  const body = typeof text === 'string' ? text : '';
  if (body.trim() === '') return [];
  const sections = [];
  let label = '(开头)';
  let named = false;         // whether the current block already carries a label
  let lines = [];
  let chars = 0;
  const flush = () => {
    if (chars > 0) {
      const content = lines.join('\n');
      if (content.trim() !== '') {
        sections.push({
          label,
          chars,
          tokens: Math.ceil(chars / CHARS_PER_TOKEN),
          preview: oneLine(content, SECTION_PREVIEW),
          // The section's own text, so the card can show what it actually says
          // instead of a truncated single line.
          body: content.length > SECTION_BODY ? content.slice(0, SECTION_BODY) + '\n…（已截断）' : content,
          truncated: content.length > SECTION_BODY,
        });
      }
    }
    lines = [];
    chars = 0;
  };
  const raw = body.split('\n');
  const hasStructure = raw.some(line => isHeadingLine(line) || isRuleLine(line));
  if (!hasStructure) {
    // No structure to find: one row, honestly labelled.
    const chars0 = body.length + 1;
    return [{
      label: '(开头)', chars: chars0,
      tokens: Math.ceil(chars0 / CHARS_PER_TOKEN), preview: oneLine(body, SECTION_PREVIEW),
      body: body.length > SECTION_BODY ? body.slice(0, SECTION_BODY) + '\n…（已截断）' : body,
      truncated: body.length > SECTION_BODY,
    }];
  }

  /**
   * A banner is `rule / label / rule` — the shape long harness prompts use for
   * their top-level sections. It is read as one opener named after its middle
   * line, so a 12-section prompt does not turn into 12 anonymous `(段落)` rows.
   * Returns the number of lines consumed (0 when this is not a banner).
   */
  function bannerAt(index) {
    if (!isRuleLine(raw[index])) return 0;
    const middle = index + 1;
    if (middle >= raw.length) return 0;
    const text = raw[middle].trim();
    if (text === '' || text.length > 80 || isRuleLine(text) || isHeadingLine(text)) return 0;
    if (!isRuleLine(raw[middle + 1] ?? '')) return 0;
    return 3;
  }

  for (let index = 0; index < raw.length; index += 1) {
    const line = raw[index];
    const full = sections.length >= MAX_SECTIONS - 1;

    const banner = full ? 0 : bannerAt(index);
    if (banner > 0) {
      flush();
      named = false;
      label = sectionLabel(raw[index + 1]);
      named = true;
      for (let taken = 0; taken < banner; taken += 1) {
        lines.push(raw[index + taken]);
        chars += raw[index + taken].length + 1;
      }
      index += banner - 1;
      continue;
    }

    if (!full && isHeadingLine(line)) {
      flush();
      label = sectionLabel(line);
      named = true;
      lines = [line];
      chars = line.length + 1;
      continue;
    }

    if (!full && isBoundaryLine(line) && !isHeadingLine(line)) {
      // A rule or closing tag ends the block without naming the next one; the
      // next block keeps its own heading if it has one.
      if (chars > 0 && named) {
        lines.push(line);
        chars += line.length + 1;
      }
      flush();
      named = false;
      label = '(段落)';
      continue;
    }

    lines.push(line);
    chars += line.length + 1;
  }
  flush();
  // One shared body budget, largest sections first (same reasoning as tools).
  const ranked = [...sections].sort((a, b) => b.chars - a.chars);
  let left = SECTION_BODY_BUDGET;
  const keep = new Set();
  for (const section of ranked) {
    if (left <= 0) break;
    keep.add(section);
    left -= Math.min(section.chars, SECTION_BODY);
  }
  for (const section of sections) {
    if (keep.has(section)) continue;
    section.body = '';
    section.truncated = section.chars > 0;
  }
  // Report in prompt order, not budget order.
  return sections;
}

/** Text of a system message's content blocks (the rendered prompt body). */
export function systemTextOf(message) {
  const content = Array.isArray(message?.content) ? message.content : [];
  const parts = [];
  for (const block of content) {
    if (block?.type === 'text') parts.push(String(block.text ?? ''));
    else if (block !== null && block !== undefined) parts.push(JSON.stringify(block));
  }
  return parts.join('\n');
}
