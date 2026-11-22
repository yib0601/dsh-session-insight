/**
 * dsh-turn-cost — Client half. Prices each completed turn's exact DSH token
 * usage with the vendor's official list price, and shows the running session
 * total in the composer dock. The context-insight surfaces live in the lazy
 * sibling chunk `client.context.js`, fed by the Host's `tc*` projections.
 *
 * HMR note: the Host watches this entry file only. After editing
 * `client.context.js`, touch this file too so the owner revision (and thus the
 * chunk URL) changes and the browser loads the fresh chunk. (rev 39 — the
 * "context items" card was restructured into four visual levels: window
 * summary band, tab bar with item counts, per-bucket scale strip, and labelled
 * item rows with a one-line gist, a magnitude bar and a share column.)
 * Touch this file after every `client.context.js` edit.
 *
 * Sections (a static dsh.client bundle must be one file):
 *   §1 pricing (pure) · §1.5 preferences · §2 presentation (React) · §3 composition (locale + slot)
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-turn-cost',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');   // baseline platform module (used by shipped chat bundle)
    const h = React.createElement;

    // ─────────────────────────────────────────────────────────────────────────
    // §1 pricing — pure, independently testable (see test/pricing.test.js)
    // ─────────────────────────────────────────────────────────────────────────

    /** Prices are USD per 1,000,000 tokens. `cacheWrite` = 5-minute write. */
    const DEEPSEEK_SOURCE = 'https://api-docs.deepseek.com/quick_start/pricing';
    const OFFICIAL = {
      // https://api-docs.deepseek.com/quick_start/pricing (retrieved 2026-11-15)
      // Off-peak = half of peak. Peak = Beijing Mon–Fri 09:00–12:00, 14:00–18:00.
      'deepseek-flash': { vendor: 'DeepSeek', currency: 'USD', peak: true, source: DEEPSEEK_SOURCE,
        peakRates: { input: 0.30, cacheRead: 0.006, cacheWrite: 0, output: 1.20 },
        offPeakRates: { input: 0.15, cacheRead: 0.003, cacheWrite: 0, output: 0.60 },
        cnyPeak: { input: 2, cacheRead: 0.04, cacheWrite: 0, output: 8 },
        cnyOffPeak: { input: 1, cacheRead: 0.02, cacheWrite: 0, output: 4 },
        note: '官方高峰/空闲两档；空闲价为高峰价一半。旧名 deepseek-chat / deepseek-reasoner 已下线，不再单独计价。' },
      'deepseek-v4-pro': { vendor: 'DeepSeek', currency: 'USD', peak: true, source: DEEPSEEK_SOURCE,
        peakRates: { input: 1.32, cacheRead: 0.044, cacheWrite: 0, output: 3.96 },
        offPeakRates: { input: 0.66, cacheRead: 0.022, cacheWrite: 0, output: 1.98 },
        cnyPeak: { input: 9, cacheRead: 0.30, cacheWrite: 0, output: 27 },
        cnyOffPeak: { input: 4.5, cacheRead: 0.15, cacheWrite: 0, output: 13.5 },
        note: '官方高峰/空闲两档；空闲价为高峰价一半。' },

      // https://docs.anthropic.com/en/docs/about-claude/pricing (retrieved 2026-11-15)
      // Cache write 1.25x / cache read 0.1x of base input, unless a model fixes them.
      'claude-fable-5-2':  { vendor: 'Anthropic', currency: 'USD', rates: { input: 8,    cacheRead: 0.20, cacheWrite: 10,    output: 40 }, source: 'https://docs.anthropic.com/en/docs/about-claude/pricing' },
      'claude-opus-5-5':   { vendor: 'Anthropic', currency: 'USD', rates: { input: 4,    cacheRead: 0.20, cacheWrite: 5,     output: 20 }, source: 'https://docs.anthropic.com/en/docs/about-claude/pricing' },
      'claude-sonnet-5-5': { vendor: 'Anthropic', currency: 'USD', rates: { input: 2,    cacheRead: 0.10, cacheWrite: 2.50,  output: 10 }, source: 'https://docs.anthropic.com/en/docs/about-claude/pricing' },
      'claude-haiku-5-5':  { vendor: 'Anthropic', currency: 'USD', rates: { input: 0.10, cacheRead: 0.01, cacheWrite: 0.125, output: 0.50 }, longContextRates: { input: 0.50, cacheRead: 0.05, cacheWrite: 0.625, output: 2.50 }, source: 'https://docs.anthropic.com/en/docs/about-claude/pricing', note: '超过 100K 上下文提示词按 long-context 档计价。' },
      'claude-sonnet-5':   { vendor: 'Anthropic', currency: 'USD', rates: { input: 2,    cacheRead: 0.20, cacheWrite: 2.50,  output: 10 }, source: 'https://docs.anthropic.com/en/docs/about-claude/pricing' },
      'claude-opus-4-5':   { vendor: 'Anthropic', currency: 'USD', rates: { input: 5,    cacheRead: 0.50, cacheWrite: 6.25,  output: 25 }, source: 'https://docs.anthropic.com/en/docs/about-claude/pricing' },
      'claude-haiku-4-5':  { vendor: 'Anthropic', currency: 'USD', rates: { input: 1,    cacheRead: 0.10, cacheWrite: 1.25,  output: 5 },  source: 'https://docs.anthropic.com/en/docs/about-claude/pricing' },

      // https://platform.openai.com/docs/pricing — Standard tier, short context (≤272K)
      // OpenAI reports cached input but no separate cache-write token count; cacheWrite = 0.
      'gpt-6-astra':   { vendor: 'OpenAI', currency: 'USD', rates: { input: 10,   cacheRead: 1,    cacheWrite: 0, output: 50 }, source: 'https://platform.openai.com/docs/pricing' },
      'gpt-6.1-sol':   { vendor: 'OpenAI', currency: 'USD', rates: { input: 2,    cacheRead: 0.10, cacheWrite: 0, output: 10 }, source: 'https://platform.openai.com/docs/pricing' },
      'gpt-6.1-terra': { vendor: 'OpenAI', currency: 'USD', rates: { input: 1,    cacheRead: 0.05, cacheWrite: 0, output: 5 },  source: 'https://platform.openai.com/docs/pricing' },
      'gpt-6-luna':    { vendor: 'OpenAI', currency: 'USD', rates: { input: 0.10, cacheRead: 0.01, cacheWrite: 0, output: 0.50 }, source: 'https://platform.openai.com/docs/pricing' },
      'gpt-6-sol':     { vendor: 'OpenAI', currency: 'USD', rates: { input: 2,    cacheRead: 0.20, cacheWrite: 0, output: 10 }, source: 'https://platform.openai.com/docs/pricing' },
      'gpt-5.5':       { vendor: 'OpenAI', currency: 'USD', rates: { input: 5,    cacheRead: 0.50, cacheWrite: 0, output: 30 }, source: 'https://platform.openai.com/docs/pricing' },
      'gpt-5.1':       { vendor: 'OpenAI', currency: 'USD', rates: { input: 1.25, cacheRead: 0.125,cacheWrite: 0, output: 10 }, source: 'https://platform.openai.com/docs/pricing' },

      // https://ai.google.dev/gemini-api/docs/pricing — Standard paid tier, synchronous
      // Thinking tokens are billed as output; no separate cache-write token count.
      'gemini-4-carbon':       { vendor: 'Google', currency: 'USD', rates: { input: 2,    cacheRead: 0.10,  cacheWrite: 0, output: 10 },   source: 'https://ai.google.dev/gemini-api/docs/pricing', note: '2026-12-01 起调整为 4 / 0.20 / 20。' },
      'gemini-4-argon':        { vendor: 'Google', currency: 'USD', rates: { input: 2,    cacheRead: 0.10,  cacheWrite: 0, output: 10 },   source: 'https://ai.google.dev/gemini-api/docs/pricing', note: '2026-11-30 前有效。' },
      'gemini-4-hydrogen':     { vendor: 'Google', currency: 'USD', rates: { input: 1.50, cacheRead: 0.075, cacheWrite: 0, output: 7.50 }, source: 'https://ai.google.dev/gemini-api/docs/pricing' },
      'gemini-3.8-flash':      { vendor: 'Google', currency: 'USD', rates: { input: 0.75, cacheRead: 0.075, cacheWrite: 0, output: 3.75 }, source: 'https://ai.google.dev/gemini-api/docs/pricing', note: '2027-01-01 起调整为 1.50 / 0.15 / 7.50。' },
      'gemini-3.5-flash-lite': { vendor: 'Google', currency: 'USD', rates: { input: 0.30, cacheRead: 0.03,  cacheWrite: 0, output: 2.50 }, source: 'https://ai.google.dev/gemini-api/docs/pricing' },
      'gemini-3.1-flash-lite': { vendor: 'Google', currency: 'USD', rates: { input: 0.25, cacheRead: 0.025, cacheWrite: 0, output: 1.50 }, source: 'https://ai.google.dev/gemini-api/docs/pricing' },
      // Served through a gateway/reseller with no public per-token list price:
      // WorkBuddy bills Hy4 in credits (`usage.credit` per call), so no token
      // price can be derived. Kept as an explicit row so the badge can say why
      // instead of a bare "price unknown".
      'hy4': { vendor: 'WorkBuddy', currency: 'USD', unpriced: true, note: '该供应商按 credits 计费（每次调用记 usage.credit），没有公开的 per-token 官方价，故不估算金额。' },
      'hy4-preview': { vendor: 'WorkBuddy', currency: 'USD', unpriced: true, note: '该供应商按 credits 计费（每次调用记 usage.credit），没有公开的 per-token 官方价，故不估算金额。' },
    };

    /**
     * Display currencies. A vendor that publishes an official CNY list price
     * (DeepSeek) is shown at that exact price, never at a converted one; a
     * USD-only vendor is converted with `USD_TO_CNY` and flagged as a
     * conversion, so a CNY number never pretends to be a vendor list price.
     */
    const CURRENCIES = ['CNY', 'USD'];
    const CURRENCY_SYMBOL = { CNY: '¥', USD: '$' };
    const USD_TO_CNY = 7.2;

    /** @returns {'CNY'|'USD'} a validated display currency (default CNY). */
    function normalizeCurrency(currency) {
      return currency === 'USD' ? 'USD' : 'CNY';
    }

    /**
     * A priced amount expressed in `currency`: the official CNY price when the
     * vendor publishes one, else the USD amount converted at `USD_TO_CNY`.
     * `fx` marks the converted case so the UI can say so.
     * @param {{usd?:number, cny?:number}} priced
     * @param {'CNY'|'USD'} currency
     */
    function moneyOf(priced, currency) {
      if (normalizeCurrency(currency) === 'USD') {
        return { currency: 'USD', amount: count(priced?.usd), fx: false };
      }
      if (priced?.cny !== undefined) return { currency: 'CNY', amount: priced.cny, fx: false };
      const usd = count(priced?.usd);
      // A zero amount needs no conversion note, so `fx` stays false there.
      return { currency: 'CNY', amount: usd * USD_TO_CNY, fx: usd > 0 };
    }

    /**
     * Rate row in the display currency: the vendor's own CNY row, or its USD
     * row scaled by the same `USD_TO_CNY` used for the amount.
     */
    function displayRateRow(rates, cnyRates, currency) {
      if (normalizeCurrency(currency) === 'USD') return rates;
      if (cnyRates !== undefined) return cnyRates;
      const scaled = {};
      for (const key of Object.keys(rates)) scaled[key] = rates[key] * USD_TO_CNY;
      return scaled;
    }

    /**
     * Routes the provider itself lists as free (its picker says 免费) and that
     * have no first-party per-token list price. Priced $0 with a `free` flag —
     * never confused with "price unknown". Gateway free tiers are promotions and
     * change wholesale, so this list stays a flat set, not a derived guess.
     */
    const FREE_MODELS = new Set([
      'hy3', 'hy3-b', 'hy3-c', 'hy4-flash', 'hy4flash-free', 'hy4-flash-free',
      'deepseek-v4.1-flash-free', 'big-pickle', 'beam-free', 'flint-40b-free',
      'glm-5.3-flash-free', 'iceman-free', 'iceman-contributor-free',
      'inkling-2-small-free', 'longcat-2.5-free', 'mimo-v2.6-flash-free',
      'minimax-m3.1-flash-free', 'nemotron-3.5-lightning-free',
      'nemotron-3.5-super-vl-free',
      // `openrouter/free` normalizes to the bare id `free`.
      'free',
    ]);

    function freeRow() {
      return {
        vendor: 'provider-free', currency: 'USD', free: true, source: '',
        rates: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
        note: '提供方在模型选择器中标注免费；按 $0 计，非第一方 API 刊例价。',
      };
    }

    /** Extra Beijing-date (UTC+8) public holidays, `YYYY-MM-DD`. Fill to be exact. */
    const HOLIDAYS_UTC8 = [];

    /**
     * Peak hours are Beijing Mon–Fri 09:00–12:00 and 14:00–18:00, excluding
     * Chinese public holidays. All other hours (weekends, holidays) are off-peak.
     * @param {number} ms epoch milliseconds
     * @returns {boolean}
     */
    function isPeak(ms) {
      const bj = new Date(ms + 8 * 3600 * 1000);
      const day = bj.getUTCDay();                  // 0=Sun .. 6=Sat
      if (day === 0 || day === 6) return false;
      const date = bj.toISOString().slice(0, 10);
      if (HOLIDAYS_UTC8.indexOf(date) !== -1) return false;
      const hour = bj.getUTCHours();
      return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
    }

    /** Strip API date suffixes and provider prefixes so `claude-sonnet-4-5-20250929` matches. */
    function normalizeModelId(raw) {
      if (typeof raw !== 'string') return '';
      let id = raw.trim().toLowerCase();
      const slash = id.lastIndexOf('/');
      if (slash !== -1) id = id.slice(slash + 1);
      id = id.replace(/-\d{8}$/, '');
      id = id.replace(/@[^@]+$/, '');
      return id;
    }

    const ALIASES = {
      // DeepSeek's official docs: "Use deepseek-flash as the model name ... it is
      // now served by DeepSeek-V4.1-Flash-1017" and the retired legacy names are
      // served by that model and billed at the Flash price. Gateway catalogs
      // (opencode-go / ai-router) expose the same model under its version name.
      'deepseek-v4.1-flash': 'deepseek-flash',
      'deepseek-v4.1-flash-1017': 'deepseek-flash',
      'deepseek-v4-flash': 'deepseek-flash',
      'deepseek-v4-flash-vision-exp': 'deepseek-flash',
      'deepseek-v4-pro-official': 'deepseek-v4-pro',
      'deepseek-v4.1-pro': 'deepseek-v4-pro',
    };

    /** @returns {object|undefined} a price row keyed by model id. */
    function lookupPrice(model) {
      let id = normalizeModelId(model);
      if (ALIASES[id] !== undefined) id = ALIASES[id];
      const row = OFFICIAL[id];
      if (row !== undefined) return row;
      if (FREE_MODELS.has(id) || id.endsWith(':free')) return freeRow();
      return undefined;
    }

    function count(value) {
      return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
    }

    /**
     * Price one exact per-turn usage. `fallbackModel` supplies a route when the
     * log omitted one; `tier` overrides the automatic peak/off-peak detection
     * for vendors with time-of-day pricing ('auto' | 'peak' | 'offPeak');
     * `currency` (default CNY) picks the display currency of `amount`.
     */
    function computeTurnCost(usage, time, fallbackModel, tier, currency) {
      if (usage === undefined || usage === null) return { status: 'no-usage' };
      const routes = Array.isArray(usage.routes) ? usage.routes : [];
      let route = routes[0];
      let inferredModel = false;
      if (route === undefined && fallbackModel) {
        route = { provider: '', model: fallbackModel };
        inferredModel = true;
      }
      if (route === undefined) return { status: 'no-route' };
      const price = lookupPrice(route.model);
      if (price === undefined) {
        return { status: 'unknown', model: route.model, vendor: route.provider };
      }
      if (price.unpriced === true) {
        return { status: 'unknown', model: route.model, vendor: price.vendor, note: price.note, unpriced: true };
      }

      const hasTimeTiers = price.peak === true;
      const peak = hasTimeTiers
        ? (tier === 'peak' ? true : tier === 'offPeak' ? false : isPeak(time))
        : false;
      const rates = price.rates !== undefined
        ? price.rates
        : (peak ? price.peakRates : price.offPeakRates);
      const cnyRates = price.cnyPeak !== undefined
        ? (peak ? price.cnyPeak : price.cnyOffPeak)
        : undefined;

      const input = count(usage.uncachedInputTokens);
      const output = count(usage.outputTokens);
      const cacheRead = count(usage.cacheReadTokens);
      const cacheWrite = count(usage.cacheWriteTokens);
      // When an attempt omits a cache bucket DSH leaves it undefined, but the
      // exact prompt total is known: charge the remainder at the cache-read
      // rate (conservative lower bound) and flag the result as approximate.
      const totalPrompt = Math.max(0, count(usage.totalTokens) - output);
      const unaccounted = Math.max(0, totalPrompt - input - cacheRead - cacheWrite);
      // Several routes only make the aggregate approximate when they do not all
      // resolve to the same price row: a turn served under two names of one
      // model (deepseek-flash / deepseek-v4.1-flash) prices exactly.
      const mixedPrices = new Set(routes.map((r) => lookupPrice(r.model))).size > 1;
      const approximate = unaccounted > 0 || mixedPrices;

      const parts = { input, cacheRead: cacheRead + unaccounted, cacheWrite, output };
      const usd = (parts.input * rates.input + parts.cacheRead * rates.cacheRead
        + parts.cacheWrite * rates.cacheWrite + parts.output * rates.output) / 1e6;
      const cny = cnyRates === undefined ? undefined
        : (parts.input * cnyRates.input + parts.cacheRead * cnyRates.cacheRead
          + parts.cacheWrite * cnyRates.cacheWrite + parts.output * cnyRates.output) / 1e6;
      const money = moneyOf({ usd, cny }, currency);

      return {
        status: 'ok', usd, cny, ...money,
        displayRates: displayRateRow(rates, cnyRates, currency),
        rates, parts,
        approximate: approximate || inferredModel, inferredModel,
        free: price.free === true,
        ...hasTimeTiers ? { peak } : {},
        model: route.model, vendor: price.vendor,
        source: price.source, note: price.note,
        mixedRoutes: mixedPrices ? routes.map(r => r.model) : undefined,
      };
    }

    function trimZeros(text) {
      return text.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
    }

    /**
     * Format an amount in `currency`. Precision tracks magnitude: sub-cent
     * amounts keep 4–6 decimals so a running total never reads as 0, while
     * whole-unit amounts settle at the usual two.
     */
    function formatMoney(amount, currency) {
      const display = normalizeCurrency(currency);
      const symbol = CURRENCY_SYMBOL[display];
      const value = Number.isFinite(amount) ? amount : 0;
      if (value <= 0) return symbol + '0';
      if (value < 0.0001) return '<' + symbol + '0.0001';
      if (value >= 1) return symbol + value.toFixed(2);
      return symbol + trimZeros(value.toFixed(value >= 0.01 ? 4 : 6));
    }

    function formatUsd(usd) {
      return formatMoney(usd, 'USD');
    }

    function formatCny(cny) {
      return formatMoney(cny, 'CNY');
    }

    function formatInt(n) {
      return Number(n || 0).toLocaleString('en-US');
    }

    /** Whole-session cumulative buckets from the `tokenUsage` projection. */
    function projectionBuckets(p) {
      return {
        input: count(p.uncachedInputTokens), cacheRead: count(p.cacheReadTokens),
        cacheWrite: count(p.cacheWriteTokens), output: count(p.outputTokens),
      };
    }

    /** Price an arbitrary bucket set with one model (used for the in-progress remainder). */
    function priceBucketsResult(b, model, time, tier) {
      if (!model) return null;
      const r = computeTurnCost({
        uncachedInputTokens: b.input, outputTokens: b.output,
        totalTokens: b.input + b.cacheRead + b.cacheWrite + b.output,
        cacheReadTokens: b.cacheRead, cacheWriteTokens: b.cacheWrite,
        routes: [{ provider: '', model }],
      }, time, undefined, tier);
      return r.status === 'ok' ? r : null;
    }

    function priceBuckets(b, model, time, tier) {
      const result = priceBucketsResult(b, model, time, tier);
      return result === null ? null : result.usd;
    }

    /**
     * Whole-session money total. Completed turns are priced exactly per turn
     * (so the sum equals the visible badges); a turn whose log omitted its
     * provider/model route falls back to the session's current model. Tokens
     * not yet in a completed turn (running turn / paged-out history) come from
     * the durable `tokenUsage` projection and are priced at the current model's
     * rate, scaled by the whole-log bucket proportions. Pure: plain data only.
     *
     * @param {Array<{usage:object,time:number}>} turns loaded `turn-tail` usages
     * @param {object|undefined} cumulative whole-log token-usage projection
     * @param {string|null} model current model id (from `modelSelection`)
     * @param {number} now epoch ms for DeepSeek peak/off-peak
     * @param {'auto'|'peak'|'offPeak'|undefined} tier billing-tier preference
     * @param {'CNY'|'USD'|undefined} currency display currency of `amount` (default CNY)
     */
    function computeSessionTotal(turns, cumulative, model, now, tier, currency) {
      const display = normalizeCurrency(currency);
      let completedUsd = 0, completedAmount = 0, fx = false;
      let loadedTokens = 0, pricedTokens = 0;
      let countedTurns = 0, unknownTurns = 0, inferredTurns = 0;
      for (const turn of turns) {
        const tokens = Math.max(0, count(turn.usage.totalTokens));
        const r = computeTurnCost(turn.usage, turn.time, model, tier);
        if (r.status === 'ok') {
          const money = moneyOf(r, display);
          completedUsd += r.usd; completedAmount += money.amount;
          if (money.fx) fx = true;
          countedTurns += 1; pricedTokens += tokens;
          if (r.inferredModel) inferredTurns += 1;
        } else unknownTurns += 1;
        loadedTokens += tokens;
      }
      const cumulativeTokens = cumulative === undefined || cumulative === null ? 0
        : (() => { const b = projectionBuckets(cumulative); return b.input + b.cacheRead + b.cacheWrite + b.output; })();
      const missingTokens = Math.max(0, cumulativeTokens - loadedTokens);
      let remainderUsd = null, remainderAmount = null;
      if (missingTokens > 0 && cumulative) {
        const b = projectionBuckets(cumulative);
        const scale = cumulativeTokens > 0 ? missingTokens / cumulativeTokens : 0;
        const priced = priceBucketsResult({
          input: b.input * scale, cacheRead: b.cacheRead * scale,
          cacheWrite: b.cacheWrite * scale, output: b.output * scale,
        }, model, now, tier);
        if (priced !== null) {
          const money = moneyOf(priced, display);
          remainderUsd = priced.usd; remainderAmount = money.amount;
          if (money.fx) fx = true;
        } else if (pricedTokens > 0) {
          remainderUsd = missingTokens * (completedUsd / pricedTokens);
          remainderAmount = missingTokens * (completedAmount / pricedTokens);
        }
      }
      const totalTokens = Math.max(loadedTokens, cumulativeTokens);
      const usd = completedUsd + (remainderUsd ?? 0);
      const amount = completedAmount + (remainderAmount ?? 0);
      const hasBasis = countedTurns > 0 || remainderUsd !== null;
      if (totalTokens === 0) return { status: 'empty', usd: 0, amount: 0, currency: display, fx: false, countedTurns, unknownTurns, inferredTurns, approximate: false, free: false, missingTokens, loadedTokens, cumulativeTokens };
      if (!hasBasis) return { status: 'unknown', usd: 0, amount: 0, currency: display, fx: false, countedTurns, unknownTurns, inferredTurns, approximate: false, free: false, missingTokens, loadedTokens, cumulativeTokens };
      return {
        status: 'ok', usd, amount, currency: display, fx, countedTurns, unknownTurns, inferredTurns,
        approximate: missingTokens > 0 || inferredTurns > 0 || unknownTurns > 0,
        free: usd === 0, missingTokens, loadedTokens, cumulativeTokens,
      };
    }

    /**
     * Exact whole-log session total from the Host `tcTimeline` request log.
     * The Host folds every request of the session — not just the page of turns
     * the chat view has loaded — so this is the authoritative money total and
     * matches the Context tab's own cost card. Returns `null` when the log has
     * no priceable request (the caller then falls back to the turn-tail path).
     *
     * @param {Array<object>} requests `tcTimeline.requests` entries
     * @param {'auto'|'peak'|'offPeak'|undefined} tier billing-tier preference
     * @param {number} cumulativeTokens durable whole-log token total, if known
     * @param {'CNY'|'USD'|undefined} currency display currency of `amount` (default CNY)
     */
    function computeRequestsTotal(requests, tier, cumulativeTokens, currency) {
      if (!Array.isArray(requests) || requests.length === 0) return null;
      const display = normalizeCurrency(currency);
      let usd = 0, amount = 0, fx = false;
      let requestTokens = 0, unknown = 0, unknownTokens = 0, priced = 0, approximate = false;
      const turns = new Set();
      for (const request of requests) {
        if (request === null || typeof request !== 'object') continue;
        const usage = {
          uncachedInputTokens: request.input, outputTokens: request.output,
          cacheReadTokens: request.cacheRead, cacheWriteTokens: request.cacheWrite,
          totalTokens: request.totalTokens,
          routes: request.model ? [{ provider: request.provider || '', model: request.model }] : [],
        };
        const result = computeTurnCost(usage, request.time, null, tier);
        if (result.status === 'ok') {
          const money = moneyOf(result, display);
          usd += result.usd; amount += money.amount;
          if (money.fx) fx = true;
          priced += 1;
          if (result.approximate === true) approximate = true;
        } else {
          unknown += 1;
          unknownTokens += count(request.totalTokens);
        }
        requestTokens += count(request.totalTokens);
        if (Number.isFinite(request.turn)) turns.add(request.turn);
      }
      if (priced === 0) return null;
      const total = Math.max(requestTokens, count(cumulativeTokens));
      const gap = total - requestTokens;
      // The fold and DSH's own durable usage derivation account for retries
      // slightly differently, so a sub-2% gap is accounting noise rather than
      // unpriced tokens. A larger gap means the Host request-log cap dropped
      // the oldest requests: scale the money up to still cover every token.
      const material = gap > total * 0.02;
      const missing = material ? gap : 0;
      const scaled = material && requestTokens > 0 ? usd * (total / requestTokens) : usd;
      const scaledAmount = material && requestTokens > 0 ? amount * (total / requestTokens) : amount;
      return {
        status: 'ok', usd: scaled, amount: scaledAmount, currency: display, fx, source: 'requests',
        countedTurns: turns.size, unknownTurns: unknown, inferredTurns: 0,
        approximate: approximate || unknown > 0 || material,
        free: scaled === 0, unknownTokens,
        missingTokens: missing, loadedTokens: requestTokens, cumulativeTokens: total,
      };
    }

    /**
     * Exact cost of ONE turn from the Host request log. Each request is priced
     * with its own model and its own peak/off-peak moment — the same basis the
     * session total uses — so the turn badge and the session pill show the same
     * money for the same work and agree on the `≈` marker.
     *
     * Returns `null` when the log cannot carry the turn on its own: no rows for
     * that turn, no priceable row, or a row set that covers materially less than
     * the aggregated turn usage (the Host keeps only the newest 1200 requests).
     * The caller then falls back to pricing the aggregated `turn-tail` usage.
     *
     * @param {Array<object>} requests `tcTimeline.requests` entries
     * @param {number} turn turn number
     * @param {'auto'|'peak'|'offPeak'|undefined} tier billing-tier preference
     * @param {'CNY'|'USD'|undefined} currency display currency
     * @param {number} [tailTokens] aggregated turn tokens, for coverage
     */
    function computeTurnRequestsTotal(requests, turn, tier, currency, tailTokens) {
      if (!Array.isArray(requests) || requests.length === 0) return null;
      if (turn === undefined || turn === null) return null;
      const display = normalizeCurrency(currency);
      const rows = requests.filter((r) => r !== null && typeof r === 'object'
        && Number(r.turn) === Number(turn));
      if (rows.length === 0) return null;

      let usd = 0, amount = 0, fx = false, tokens = 0, unknown = 0, priced = 0, approximate = false;
      const parts = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
      const models = new Set();
      const tiers = new Set();
      for (const request of rows) {
        tokens += count(request.totalTokens);
        if (!request.model) { unknown += 1; continue; }
        const result = computeTurnCost({
          uncachedInputTokens: request.input, outputTokens: request.output,
          cacheReadTokens: request.cacheRead, cacheWriteTokens: request.cacheWrite,
          totalTokens: request.totalTokens,
          routes: [{ provider: request.provider || '', model: request.model }],
        }, request.time, null, tier, display);
        if (result.status !== 'ok') { unknown += 1; continue; }
        const money = moneyOf(result, display);
        usd += result.usd; amount += money.amount;
        if (money.fx) fx = true;
        if (result.approximate === true) approximate = true;
        parts.input += result.parts.input;
        parts.cacheRead += result.parts.cacheRead;
        parts.cacheWrite += result.parts.cacheWrite;
        parts.output += result.parts.output;
        models.add(result.model);
        tiers.add(result.peak === undefined ? 'flat' : (result.peak ? 'peak' : 'offPeak'));
        priced += 1;
      }
      if (priced === 0) return null;
      // A truncated log would under-count the turn: defer to the aggregated tail.
      if (count(tailTokens) > 0 && tokens < count(tailTokens) * 0.98) return null;

      // Rate rows only make sense when one model and one tier produced them.
      const single = models.size === 1 && tiers.size === 1;
      const sample = single ? computeTurnCost({
        uncachedInputTokens: parts.input, outputTokens: parts.output,
        totalTokens: parts.input + parts.cacheRead + parts.cacheWrite + parts.output,
        cacheReadTokens: parts.cacheRead, cacheWriteTokens: parts.cacheWrite,
        routes: [{ provider: rows[rows.length - 1].provider || '', model: rows[rows.length - 1].model }],
      }, rows[rows.length - 1].time, null, tier, display) : null;

      return {
        status: 'ok', usd, amount, currency: display, fx, source: 'requests',
        parts, approximate: approximate || unknown > 0,
        displayRates: single && sample !== null ? sample.displayRates : undefined,
        rates: single && sample !== null ? sample.rates : undefined,
        cny: single && sample !== null ? sample.cny : undefined,
        model: single && sample !== null ? sample.model : undefined,
        vendor: single && sample !== null ? sample.vendor : undefined,
        models: [...models],
        peak: single && sample !== null ? sample.peak : undefined,
        tierMixed: single ? undefined : true,
        unknownRequests: unknown, countedRequests: priced,
        free: amount === 0,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // §1.5 preferences (client-local; no Host config form needed)
    // ─────────────────────────────────────────────────────────────────────────

    const PREF_KEY = 'dsh-turn-cost:prefs';
    // `budget` is a soft cap in the display currency: 0 switches it off.
    const PREF_DEFAULTS = Object.freeze({
      badge: true, pill: true, tier: 'auto', currency: 'CNY', budget: 0,
    });
    const TIERS = ['auto', 'peak', 'offPeak'];

    /** A soft budget: 0 = off, otherwise 0.01–1e6 rounded to two decimals. */
    function normalizeBudget(value) {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n) || n <= 0) return 0;
      return Math.min(1e6, Math.round(n * 100) / 100);
    }

    function sanitizePrefs(raw) {
      const next = { ...PREF_DEFAULTS };
      if (raw !== null && typeof raw === 'object') {
        if (typeof raw.badge === 'boolean') next.badge = raw.badge;
        if (typeof raw.pill === 'boolean') next.pill = raw.pill;
        if (TIERS.includes(raw.tier)) next.tier = raw.tier;
        if (CURRENCIES.includes(raw.currency)) next.currency = normalizeCurrency(raw.currency);
        next.budget = normalizeBudget(raw.budget);
      }
      return Object.freeze(next);
    }

    function loadPrefs() {
      try {
        const raw = window.localStorage.getItem(PREF_KEY);
        return sanitizePrefs(raw === null ? undefined : JSON.parse(raw));
      } catch { return sanitizePrefs(undefined); }
    }

    /** `useSyncExternalStore`-compatible preference store, persisted per browser. */
    const prefs = (() => {
      let snapshot = loadPrefs();
      const listeners = new Set();
      return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener);
          return () => { listeners.delete(listener); };
        },
        set(patch) {
          const next = sanitizePrefs({ ...snapshot, ...patch });
          const unchanged = Object.keys(PREF_DEFAULTS).every(key => next[key] === snapshot[key]);
          if (unchanged) return;
          snapshot = next;
          try { window.localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* storage disabled */ }
          for (const listener of listeners) listener();
        },
        reset() { prefs.set(PREF_DEFAULTS); },
      };
    })();

    /** Subscribe a component to the preference store. */
    function usePrefs() {
      return React.useSyncExternalStore(prefs.subscribe, prefs.getSnapshot, () => PREF_DEFAULTS);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // §2 presentation
    // ─────────────────────────────────────────────────────────────────────────

    const STYLES = `
/* Turn-tail seat: only Turns without an action row keep the chip on its own line. */
.dsh-turn-cost-root{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin:2px 0 6px;font-size:calc(var(--dsh-content-font-size-secondary, 13px) - 1px);line-height:1.5}
/* Action-row seat: same line as usage / clock, trailing the meta instead of
   taking a line of its own. */
.dsh-turn-cost-chip{position:relative;display:inline-flex;align-items:center;order:99;margin:0 0 0 2px}
/* Match the host's Turn-usage pill: transparent resting, small radius, tertiary label. */
.dsh-turn-cost-badge{display:inline-flex;align-items:center;gap:4px;min-width:0;padding:2px 8px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:calc(24px + var(--dsh-content-font-delta, 0px));white-space:nowrap;cursor:pointer}
.dsh-turn-cost-badge[aria-expanded='true']{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary)}
@media (hover:hover){.dsh-turn-cost-badge:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary)}}
.dsh-turn-cost-badge:focus-visible{outline-width:var(--dsw-focus-ring-width,2px);outline-style:solid;outline-color:var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.dsh-turn-cost-badge[data-unknown="true"]{border:1px dashed var(--dsw-alias-border-l1)}
/* One money skin for both surfaces: the transcript badge and the composer pill
   must read as the same number in the same type, size and colour. The size
   matches the host's own dock pills (activity / usage) and the transcript meta. */
.dsh-turn-cost-amount,.dsh-turn-cost-pill-amount{font-family:inherit;font-size:calc(var(--dsh-content-font-size-secondary, 13px) - 1px);font-weight:500;font-variant-numeric:tabular-nums;letter-spacing:.01em;color:var(--dsw-alias-label-primary)}
.dsh-turn-cost-approx{opacity:.7;margin-right:1px}
/* Details disclosure: the shipped stat-dialog skin (Turn-usage / session
   stats), so a cost panel reads as one more DSH statistics card. */
.dsh-turn-cost-details{box-sizing:border-box;width:max-content;min-width:min(300px,calc(100vw - 24px));max-width:min(440px,calc(100vw - 24px));padding:16px;border:0;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);cursor:default;max-height:calc(100dvh - 24px);overflow-y:auto}
/* Heading row: section name left, its headline figure right, both primary weight. */
.dsh-turn-cost-head{display:flex;justify-content:space-between;gap:16px;margin-bottom:8px;color:var(--dsw-alias-label-primary);font-weight:500}
.dsh-turn-cost-head-label{display:inline-flex;align-items:center;gap:6px;min-width:0}
.dsh-turn-cost-head-label svg{width:14px;height:14px;flex:none}
.dsh-turn-cost-head-value{font-variant-numeric:tabular-nums;white-space:nowrap}
.dsh-turn-cost-rule{margin-bottom:10px;border-top:.5px solid var(--dsw-alias-border-l2)}
.dsh-turn-cost-details dl{display:grid;grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;color:var(--dsw-alias-label-tertiary)}
.dsh-turn-cost-details dt,.dsh-turn-cost-details dd{min-width:0;margin:0}
.dsh-turn-cost-details dd{text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}
.dsh-turn-cost-details p{margin:8px 0 0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.dsh-turn-cost-details a{color:var(--dsw-alias-brand-primary);text-decoration:none}
.dsh-turn-cost-details a:hover{text-decoration:underline}
/* Composer-dock session total: same pill skin as the host's activity/usage pills. */
.dsh-turn-cost-dock{display:inline-flex;position:relative;min-width:0}
.dsh-turn-cost-pill{display:inline-flex;align-items:center;min-width:0;padding:1px 8px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:calc(var(--dsh-content-font-size-secondary, 13px) - 1px);line-height:20px;white-space:nowrap;cursor:pointer}
.dsh-turn-cost-pill-amount{min-width:0;overflow:hidden;text-overflow:ellipsis}
.dsh-turn-cost-pill:focus-visible{outline-width:var(--dsw-focus-ring-width,2px);outline-style:solid;outline-color:var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
/* Budget gauge: with a cap set the pill reads amount / cap plus a hairline bar. */
.dsh-turn-cost-pill[data-over='true'] .dsh-turn-cost-pill-amount{color:var(--dsw-alias-state-error-primary)}
.dsh-turn-cost-gauge{display:inline-block;width:32px;height:3px;margin-left:6px;border-radius:2px;overflow:hidden;vertical-align:middle;background:var(--dsw-alias-bg-layer-3)}
.dsh-turn-cost-gauge i{display:block;height:100%;background:var(--dsw-alias-state-business-primary)}
.dsh-turn-cost-pill[data-over='true'] .dsh-turn-cost-gauge i{background:var(--dsw-alias-state-error-primary)}
.dsh-turn-cost-budget{position:relative;height:4px;margin-top:10px;border-radius:2px;overflow:hidden;background:var(--dsw-alias-bg-layer-2)}
.dsh-turn-cost-budget i{display:block;height:100%;background:var(--dsw-alias-state-business-primary)}
.dsh-turn-cost-budget[data-over='true'] i{background:var(--dsw-alias-state-error-primary)}
/* The inline seat has no room to grow: the details panel floats above it. */
.dsh-turn-cost-chip .dsh-turn-cost-details{position:absolute;right:0;bottom:calc(100% + 8px);z-index:60}
`;

    /** No-op selector, so the hooks below stay unconditional off their own seat. */
    const NO_SELECT = () => undefined;

    /**
     * The shipped `database-outline` glyph (16px, 1px stroke), inlined so the
     * cost panels need no icon module of their own.
     */
    const COST_ICON_PATHS = [
      'M13.1967 5.1869C13.7232 4.77378 14.0003 4.30517 14.0001 3.82819C14.0003 3.3512 13.7232 2.88259 13.1967 2.46947C12.6702 2.05635 11.9128 1.71328 11.0006 1.47475C10.0885 1.23621 9.05371 1.11062 8.00039 1.1106C6.94707 1.11057 5.9123 1.23612 5.00009 1.47461C4.08742 1.71301 3.32948 2.05604 2.80249 2.46919C2.2755 2.88235 1.99805 3.35106 1.99805 3.82819C1.99805 4.30531 2.2755 4.77402 2.80249 5.18718C3.32948 5.60033 4.08742 5.94336 5.00009 6.18176C5.9123 6.42025 6.94707 6.5458 8.00039 6.54578C9.05371 6.54575 10.0885 6.42016 11.0006 6.18163C11.9128 5.94309 12.6702 5.60002 13.1967 5.1869Z',
      'M2 3.80371V11.7848',
      'M14 3.80371V11.7848',
      'M2 7.81396C2 8.60524 2.63214 9.36411 3.75736 9.92363C4.88258 10.4832 6.4087 10.7975 8 10.7975C9.5913 10.7975 11.1174 10.4832 12.2426 9.92363C13.3679 9.36411 14 8.60524 14 7.81396',
      'M2 11.7847C2 12.6081 2.63214 13.3977 3.75736 13.98C4.88258 14.5622 6.4087 14.8893 8 14.8893C9.5913 14.8893 11.1174 14.5622 12.2426 13.98C13.3679 13.3977 14 12.6081 14 11.7847',
    ];

    function costIcon() {
      return h('svg', {
        viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1, 'aria-hidden': 'true',
      }, ...COST_ICON_PATHS.map((d, i) => h('path', { key: i, d, stroke: 'currentColor' })));
    }

    /** Section heading + headline figure, then the hairline rule above the rows. */
    function panelHeading(label, value) {
      return [
        h('div', { key: 'head', className: 'dsh-turn-cost-head' },
          h('span', { className: 'dsh-turn-cost-head-label' }, costIcon(), label),
          value === undefined || value === null ? null
            : h('span', { className: 'dsh-turn-cost-head-value' }, value)),
        h('div', { key: 'rule', className: 'dsh-turn-cost-rule', 'aria-hidden': 'true' }),
      ];
    }

    /**
     * The one currency the panels show. The other currency is still priced
     * internally (so switching preference never reprices), but a single
     * headline figure keeps the card as readable as the shipped stat dialogs.
     */
    function displayMoney(result) {
      return formatMoney(result.amount, result.currency);
    }

    /** Cache-hit share of billed prompt tokens, shown as a whole percent. */
    function cacheHitPercent(parts) {
      const billed = parts.input + parts.cacheRead + parts.cacheWrite;
      if (billed <= 0) return null;
      const pct = parts.cacheRead / billed * 100;
      if (pct >= 100) return '100';
      const rounded = Math.round(pct);
      return rounded < 100 ? String(rounded) : (Math.round(pct * 10) / 10).toFixed(1);
    }

    /**
     * Turn number owning one finalized assistant message. The action-row seat is
     * keyed by `messageId` only, and the assistant row it closes carries the Turn.
     */
    function useMessageTurn(useChat, messageId) {
      return useChat((snapshot) => {
        if (typeof messageId !== 'string' || messageId === '') return undefined;
        for (const node of snapshot.nodes.values()) {
          if (node.kind !== 'assistant-step') continue;
          if (node.data?.finalNode?.messageId === messageId) return node.data.turn;
        }
        return undefined;
      });
    }

    /** The Host's `turn-tail` payload for one Turn: exact usage, end time, closing. */
    function useTurnTailOf(useChat, turn) {
      return useChat((snapshot) => {
        if (typeof turn !== 'number') return undefined;
        for (const node of snapshot.nodes.values()) {
          if (node.kind === 'turn-tail' && node.data?.turn === turn) return node.data;
        }
        return undefined;
      });
    }

    /**
     * The per-Turn money chip, mounted from two seats that split the Turn space:
     * `conversation.chat.assistant-actions` carries every Turn with a closing
     * message (inline beside usage / clock), and `conversation.chat.turnTail`
     * covers the rest — an interrupted Turn has no action row to ride.
     * @param {{turn?:object, messageId?:string, t:function, useChat?:function, useProjection?:function}} props
     */
    function TurnCostBadge(props) {
      const openState = React.useState(false);
      const open = openState[0];
      const setOpen = openState[1];
      const idState = React.useState(() => 'dsh-turn-cost-' + Math.random().toString(36).slice(2, 10));
      const detailsId = idState[0];
      const rootRef = React.useRef(null);
      const t = props.t;
      const inline = typeof props.messageId === 'string' && props.messageId !== '';
      const useChat = typeof props.useChat === 'function' ? props.useChat : NO_SELECT;
      const preference = usePrefs();
      const selection = props.useProjection ? props.useProjection('modelSelection') : undefined;
      const fallbackModel = selection?.next?.model || selection?.lastUsed?.model || null;

      const timeline = props.useProjection ? props.useProjection('tcTimeline') : undefined;

      // Match the host's stat-dialog disclosure: Escape / outside click closes.
      React.useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false);
        };
        const onPointerDown = (event) => {
          if (event.target instanceof Node && rootRef.current?.contains(event.target) !== true) {
            setOpen(false);
          }
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => {
          document.removeEventListener('keydown', onKeyDown);
          document.removeEventListener('pointerdown', onPointerDown, true);
        };
      }, [open, setOpen]);

      // Inline: messageId -> Turn -> that Turn's tail payload. Standalone: the
      // Turn location itself carries the payload.
      const messageTurn = useMessageTurn(useChat, inline ? props.messageId : undefined);
      const snapshotTail = useTurnTailOf(useChat, inline ? messageTurn : undefined);
      const turn = inline ? undefined : props.turn;
      const turnNumber = inline ? messageTurn : turn?.turn;
      const tail = inline
        ? snapshotTail
        : (turn !== null && turn !== undefined && typeof turn.data?.get === 'function'
          ? turn.data.get('turn-tail')
          : undefined);
      const usage = tail !== undefined && tail !== null ? tail.tokenUsage : undefined;

      // The request log is the authoritative source (same as the session pill);
      // the aggregated turn tail is only the fallback. Memoised ahead of the early
      // returns so a late snapshot cannot change this render's hook count.
      const requests = timeline?.requests;
      const fromRequests = React.useMemo(() => computeTurnRequestsTotal(
        requests, turnNumber, preference.tier, preference.currency, usage?.totalTokens,
      ), [requests, turnNumber, preference.tier, preference.currency, usage?.totalTokens]);

      if (usage === undefined || usage === null || preference.badge !== true) return null;
      // A closed Turn has an action row that already carries the chip.
      if (!inline && tail.closing !== null) return null;
      const result = fromRequests
        ?? computeTurnCost(usage, tail.time, fallbackModel, preference.tier, preference.currency);
      const isUnknown = result.status !== 'ok';
      const amount = isUnknown ? null : formatMoney(result.amount, result.currency);
      const label = isUnknown
        ? t('unknown')
        : (result.free === true ? t('labelFree', { amount })
          : t('label', { amount }));
      const title = isUnknown
        ? t('unknownTip')
        : (result.free === true ? t('tipFree') : t('tip'));

      const badge = h('button', {
        type: 'button',
        className: 'dsh-turn-cost-badge',
        'data-unknown': isUnknown ? 'true' : 'false',
        'data-turn': String(turnNumber === undefined ? '' : turnNumber),
        'aria-expanded': open ? 'true' : 'false',
        'aria-controls': open ? detailsId : undefined,
        title,
        'aria-label': label + ' · ' + title,
        onClick: () => { setOpen(!open); },
      },
        // Keep the approximation marker adjacent to the number it qualifies.
        h('span', { className: 'dsh-turn-cost-amount' },
          result.approximate === true && !isUnknown
            ? h('span', { className: 'dsh-turn-cost-approx', 'aria-hidden': true }, '≈') : null,
          label,
        ),
      );

      const containerClass = inline ? 'dsh-turn-cost-chip' : 'dsh-turn-cost-root';
      if (!open) return h('div', { className: containerClass, ref: rootRef }, badge);

      const rows = [];
      rows.push(...panelHeading(t('detailsLabel'), isUnknown ? t('unknown') : displayMoney(result)));
      if (isUnknown) {
        rows.push(h('p', { key: 'unknown' }, t('unknownDetail', { model: result.model || '—' })));
        if (result.note !== undefined) rows.push(h('p', { key: 'unpriced' }, result.note));
      } else {
        const dl = [];
        const row = (label, value) => {
          dl.push(h('dt', { key: dl.length }, label), h('dd', { key: dl.length }, value));
        };
        // Rate rows use the same currency as the badge amount, so the
        // multiplication in the panel matches the number above it. A turn that
        // mixed models or tiers has no single rate row: show the models instead.
        const symbol = CURRENCY_SYMBOL[result.currency];
        // Each bucket row carries its own money, so the panel answers "which
        // bucket costs the money" without the reader doing the multiplication.
        const line = (label, bucket, key) => {
          const rate = Number(result.displayRates[key]) || 0;
          const bucketMoney = formatMoney(bucket * rate / 1e6, result.currency);
          return row(label, formatInt(bucket) + ' × ' + symbol + trimZeros(rate.toFixed(6))
            + '/M = ' + bucketMoney);
        };
        if (result.displayRates === undefined) {
          row(t('model'), (result.models ?? []).join(', ') || '—');
        } else {
          row(t('model'), result.vendor + ' / ' + result.model);
        }
        const hit = cacheHitPercent(result.parts);
        if (hit !== null) row(t('cacheHit'), hit + '%');
        if (result.displayRates !== undefined) {
          line(t('input'), result.parts.input, 'input');
          line(t('cacheRead'), result.parts.cacheRead, 'cacheRead');
          // A vendor that never writes cache (DeepSeek) would print a zero row.
          if (result.parts.cacheWrite > 0) line(t('cacheWrite'), result.parts.cacheWrite, 'cacheWrite');
          line(t('output'), result.parts.output, 'output');
        }
        if (result.peak !== undefined) row(t('rateTier'), result.peak ? t('peak') : t('offPeak'));
        if (result.tierMixed === true) row(t('rateTier'), t('mixedTier'));
        rows.push(h('dl', { key: 'dl' }, ...dl));
        if (result.source === 'requests') rows.push(h('p', { key: 'src-turn' }, t('sessionSourceRequests')));
        if (result.unknownRequests > 0) rows.push(h('p', { key: 'unknown-req' }, t('unknownRequests', { requests: result.unknownRequests })));
        if (result.fx === true) rows.push(h('p', { key: 'fx' }, t('fx', { rate: USD_TO_CNY })));
        if (result.mixedRoutes !== undefined) rows.push(h('p', { key: 'mixed' }, t('mixed', { models: result.mixedRoutes.join(', ') })));
        if (result.approximate === true) rows.push(h('p', { key: 'approx' }, t('approx')));
        if (result.inferredModel === true) rows.push(h('p', { key: 'inferred' }, t('inferred')));
        if (result.note !== undefined) rows.push(h('p', { key: 'note' }, result.note));
        if (result.source !== undefined && result.source !== '') {
          rows.push(h('p', { key: 'src' }, t('source', { date: '2026-11-15' }), ' ',
            h('a', { href: result.source, target: '_blank', rel: 'noopener noreferrer' }, result.vendor)));
        }
        rows.push(h('p', { key: 'estimate' }, t('estimate')));
      }
      return h('div', { className: containerClass, ref: rootRef },
        badge,
        h('div', {
          id: detailsId, className: 'dsh-turn-cost-details',
          role: 'region', 'aria-label': t('detailsLabel'),
        }, ...rows),
      );
    }

    /** A `conversation.composer.dock` pill: whole-session accumulated cost. */
    function SessionCostPill(props) {
      const { useChat, useProjection, t } = props;
      const openState = React.useState(false);
      const open = openState[0];
      const setOpen = openState[1];
      const rootRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const anchorState = React.useState(null);
      const anchor = anchorState[0];
      const setAnchor = anchorState[1];
      const detailsId = React.useState(() => 'dsh-session-cost-' + Math.random().toString(36).slice(2, 10))[0];

      React.useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (event) => { if (event.key === 'Escape') setOpen(false); };
        const onPointerDown = (event) => {
          if (event.target instanceof Node
            && rootRef.current?.contains(event.target) !== true
            && panelRef.current?.contains(event.target) !== true) setOpen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => {
          document.removeEventListener('keydown', onKeyDown);
          document.removeEventListener('pointerdown', onPointerDown, true);
        };
      }, [open, setOpen]);

      // Both sources are identity-stable per change, so useSyncExternalStore
      // does not loop and the memo only recomputes on a real session change.
      const preference = usePrefs();
      const nodes = useChat(snapshot => snapshot.nodes.values());
      const cumulative = useProjection('tokenUsage');
      const selection = useProjection('modelSelection');
      // The Host request log covers the whole session log, not just the page of
      // turns the chat view has loaded, so it yields the exact money total.
      const timeline = useProjection('tcTimeline');
      const turnData = React.useMemo(() => nodes
        .filter(node => node.kind === 'turn-tail' && node.data && node.data.tokenUsage)
        .map(node => ({ usage: node.data.tokenUsage, time: node.data.time })), [nodes]);
      const model = selection?.next?.model || selection?.lastUsed?.model
        || (turnData.length > 0 ? (turnData[turnData.length - 1].usage.routes || [])[0]?.model : null)
        || null;
      const cumulativeTokens = React.useMemo(() => {
        if (cumulative === undefined || cumulative === null) return 0;
        const b = projectionBuckets(cumulative);
        return b.input + b.cacheRead + b.cacheWrite + b.output;
      }, [cumulative]);
      const cacheHit = React.useMemo(() => (cumulative === undefined || cumulative === null
        ? null : cacheHitPercent(projectionBuckets(cumulative))), [cumulative]);
      const result = React.useMemo(() => {
        const exact = computeRequestsTotal(timeline?.requests, preference.tier, cumulativeTokens, preference.currency);
        if (exact !== null) return exact;
        return computeSessionTotal(turnData, cumulative, model, Date.now(), preference.tier, preference.currency);
      }, [timeline, turnData, cumulative, cumulativeTokens, model, preference.tier, preference.currency]);

      if (result.status === 'empty' || preference.pill !== true) return null;
      const unknown = result.status === 'unknown';
      const amount = unknown ? t('unknown') : formatMoney(result.amount, result.currency);
      // A soft budget turns the pill into a gauge: amount / cap, red past the cap.
      const budget = preference.budget > 0 ? preference.budget : 0;
      const overBudget = budget > 0 && !unknown && result.amount > budget;
      const gaugeRatio = budget > 0 && !unknown ? Math.min(100, result.amount / budget * 100) : 0;
      const label = budget > 0 && !unknown
        ? t('sessionLabelBudget', { amount, budget: formatMoney(budget, result.currency) })
        : (unknown
          ? t('sessionLabelUnknown')
          : (result.free === true ? t('sessionLabelFree', { amount }) : t('sessionLabel', { amount })));
      const toggle = () => {
        if (open) { setOpen(false); return; }
        const rect = rootRef.current?.getBoundingClientRect();
        setAnchor(rect ? { left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)), bottom: window.innerHeight - rect.top + 8 } : null);
        setOpen(true);
      };
      const summary = t('sessionTip') + ' · ' + t('sessionTurns', { turns: result.countedTurns })
        + (unknown ? '' : ' · ' + t('sessionTokens', { tokens: formatInt(result.cumulativeTokens) }))
        + (budget > 0 && !unknown
          ? ' · ' + t('sessionBudgetLabel') + ' ' + formatMoney(budget, result.currency)
            + (overBudget ? ' · ' + t('sessionOverBudget') : '')
          : '');

      const pill = h('button', {
        type: 'button', className: 'dsh-turn-cost-pill',
        'data-composer-stat': 'session-cost', 'data-over': overBudget ? 'true' : 'false',
        'aria-expanded': open ? 'true' : 'false',
        'aria-controls': open ? detailsId : undefined, 'aria-label': label + ' · ' + summary, title: summary,
        onClick: toggle,
      },
        h('span', { className: 'dsh-turn-cost-pill-amount' },
          result.approximate === true && !unknown
            ? h('span', { className: 'dsh-turn-cost-approx', 'aria-hidden': true }, '≈') : null,
          label),
        budget > 0 && !unknown
          ? h('span', { className: 'dsh-turn-cost-gauge', 'aria-hidden': 'true' },
            h('i', { style: { width: gaugeRatio.toFixed(1) + '%' } }))
          : null,
      );

      const rows = panelHeading(t('sessionDetailsLabel'), unknown ? t('unknown') : displayMoney(result));
      const dl = [];
      const row = (key, label, value) => {
        dl.push(h('dt', { key: key + '-t' }, label), h('dd', { key: key + '-d' }, value));
      };
      if (cacheHit !== null) row('hit', t('cacheHit'), cacheHit + '%');
      row('turns', t('sessionTurnsLabel'), String(result.countedTurns));
      if (!unknown) row('tokens', t('sessionTokensLabel'), t('sessionTokens', { tokens: formatInt(result.cumulativeTokens) }));
      if (budget > 0 && !unknown) {
        row('budget', t('sessionBudgetLabel'), formatMoney(budget, result.currency));
        row('remain', t('sessionBudgetRemain'), overBudget
          ? t('sessionBudgetOver', { amount: formatMoney(result.amount - budget, result.currency) })
          : formatMoney(budget - result.amount, result.currency));
      }
      rows.push(h('dl', { key: 'dl' }, ...dl));
      if (budget > 0 && !unknown) {
        rows.push(h('div', {
          key: 'budget-bar', className: 'dsh-turn-cost-budget',
          'data-over': overBudget ? 'true' : 'false',
        }, h('i', { style: { width: gaugeRatio.toFixed(1) + '%' } })));
      }
      if (result.fx === true) rows.push(h('p', { key: 'fx' }, t('sessionFx', { rate: USD_TO_CNY })));
      if (result.source === 'requests') rows.push(h('p', { key: 'src' }, t('sessionSourceRequests')));
      if (result.approximate === true && result.missingTokens > 0) {
        rows.push(h('p', { key: 'approx' }, t('sessionApprox', { tokens: formatInt(result.missingTokens) })));
      }
      if (result.inferredTurns > 0) rows.push(h('p', { key: 'inferred' }, t('sessionInferred', { turns: result.inferredTurns })));
      if (result.unknownTurns > 0) {
        rows.push(h('p', { key: 'unknown' }, result.source === 'requests'
          ? t('sessionUnknownRequests', {
            requests: result.unknownTurns, tokens: formatInt(result.unknownTokens ?? 0),
          })
          : t('sessionUnknown', { turns: result.unknownTurns })));
      }
      if (result.free === true) rows.push(h('p', { key: 'free' }, t('sessionFree')));
      if (result.source !== 'requests') rows.push(h('p', { key: 'estimate' }, t('sessionEstimate')));

      const panel = !open || anchor === null ? null : ReactDOM.createPortal(
        h('div', {
          ref: panelRef, id: detailsId, className: 'dsh-turn-cost-details',
          role: 'region', 'aria-label': t('sessionDetailsLabel'),
          style: { position: 'fixed', left: anchor.left + 'px', bottom: anchor.bottom + 'px', zIndex: 9999 },
        }, ...rows),
        document.body,
      );
      return h('span', { className: 'dsh-turn-cost-dock', ref: rootRef }, pill, panel);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // §3 composition
    // ─────────────────────────────────────────────────────────────────────────

    const LOCALE = {
      zh: {
        // Copy is deliberately terse: the amount is the label. Everything the
        // longer labels used to say lives in the tooltip and the details panel.
        label: '{amount}',
        labelFree: '{amount} · 免费',
        unknown: '价格未知',
        tip: '本轮消耗 · 官方价估算 · 点击看明细',
        tipFree: '本轮消耗 · 提供方标记免费 · 点击看明细',
        unknownTip: '本轮消耗 · 该模型无官方价，未计费',
        unknownDetail: '「{model}」没有官方单价，因此不显示金额（不按 ¥0 计）。',
        detailsLabel: '本轮消耗',
        model: '模型', input: '未缓存输入', cacheRead: '缓存读取', cacheWrite: '缓存写入', output: '输出',
        cacheHit: '缓存命中',
        rateTier: '计费时段', peak: '高峰', offPeak: '空闲（半价）', mixedTier: '高峰与空闲混合',
        mixed: '本轮用了多个模型（{models}），按首个模型计价。',
        approx: '≈ 部分尝试未上报缓存桶，未归属的提示词按缓存命中价计。',
        source: '官方价目表，核对于 {date}：',
        estimate: '官方价估算，非实际扣费。',
        fx: '≈ 该厂商只发布美元价，按 1 USD = {rate} CNY 折算。',
        sessionLabel: '{amount}',
        sessionLabelFree: '{amount} · 免费',
        sessionLabelUnknown: '价格未知',
        sessionTip: '对话消耗 · 官方价估算',
        sessionTurns: '{turns} 轮已计价',
        sessionTokens: '{tokens} tok',
        sessionDetailsLabel: '对话消耗',
        sessionTurnsLabel: '已计价轮次',
        sessionTokensLabel: '用量',
        sessionApprox: '≈ 含进行中约 {tokens} tok。',
        sessionInferred: '{turns} 轮未记录模型，按当前模型计价。',
        sessionUnknown: '{turns} 轮无官方价，未计入。',
        sessionUnknownRequests: '{requests} 次请求（{tokens} tok）无官方价，未计入。',
        sessionFree: '提供方标记免费，按 0 计。',
        sessionEstimate: '官方价估算，非实际扣费。',
        sessionSourceRequests: '按会话日志逐请求计价。',
        unknownRequests: '有 {requests} 次请求的模型无官方价，未计入。',
        sessionFx: '≈ 非人民币刊例价按 1 USD = {rate} CNY 折算。',
        inferred: '本轮未记录模型，按当前模型计价。',
        sessionLabelBudget: '{amount} / {budget}',
        sessionBudgetLabel: '会话预算',
        sessionBudgetRemain: '剩余额度',
        sessionBudgetOver: '已超出 {amount}',
        sessionOverBudget: '已超出预算',
      },
      en: {
        label: '{amount}',
        labelFree: '{amount} · free',
        unknown: 'price unknown',
        tip: 'This turn · list-price estimate · click for details',
        tipFree: 'This turn · marked free by the provider · click for details',
        unknownTip: 'This turn · no official price for this model; nothing estimated',
        unknownDetail: 'No official list price for "{model}", so no amount is shown (never ¥0).',
        detailsLabel: 'This turn',
        model: 'Model', input: 'Uncached input', cacheRead: 'Cached input', cacheWrite: 'Cache write', output: 'Output',
        cacheHit: 'Cache hit',
        rateTier: 'Rate tier', peak: 'Peak', offPeak: 'Off-peak (half)', mixedTier: 'Mixed peak / off-peak',
        mixed: 'Several models this turn ({models}); priced by the first.',
        approx: '≈ Some attempts reported no cache buckets; unattributed prompt tokens use the cache-hit rate.',
        source: 'Official price list, verified {date}:',
        estimate: 'List-price estimate, not actual billing.',
        fx: '≈ This vendor publishes USD only; converted at 1 USD = {rate} CNY.',
        sessionLabel: '{amount}',
        sessionLabelFree: '{amount} · free',
        sessionLabelUnknown: 'price unknown',
        sessionTip: 'Conversation cost · list-price estimate',
        sessionTurns: '{turns} priced turns',
        sessionTokens: '{tokens} tok',
        sessionDetailsLabel: 'Conversation cost',
        sessionTurnsLabel: 'Priced turns',
        sessionTokensLabel: 'Tokens',
        sessionApprox: '≈ includes ~{tokens} tok still running.',
        sessionInferred: '{turns} turns logged no model; priced at the current model.',
        sessionUnknown: '{turns} turns have no official price and are excluded.',
        sessionUnknownRequests: '{requests} requests ({tokens} tok) have no official price and are excluded from the amount.',
        sessionFree: 'Marked free by the provider; priced 0.',
        sessionEstimate: 'List-price estimate, not actual billing.',
        sessionSourceRequests: 'Priced request by request from the session log.',
        unknownRequests: '{requests} requests used models without an official price and are excluded.',
        sessionFx: '≈ Non-CNY list prices converted at 1 USD = {rate} CNY.',
        inferred: 'This turn logged no model; priced at the current model.',
        sessionLabelBudget: '{amount} / {budget}',
        sessionBudgetLabel: 'Session budget',
        sessionBudgetRemain: 'Remaining',
        sessionBudgetOver: '{amount} over',
        sessionOverBudget: 'over budget',
      },
    };

    /** Read-only pure pricing face shared with the sibling context chunk. */
    const PRICING_API = Object.freeze({
      OFFICIAL, lookupPrice, normalizeModelId, isPeak,
      computeTurnCost, computeTurnRequestsTotal, computeSessionTotal, computeRequestsTotal,
      priceBuckets, priceBucketsResult,
      formatMoney, formatUsd, formatCny, formatInt,
      moneyOf, normalizeCurrency, CURRENCIES, CURRENCY_SYMBOL, USD_TO_CNY,
      // The context chunk hosts the settings row, so it needs the same store.
      prefs, PREF_DEFAULTS, TIERS, normalizeBudget,
    });

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        // One package-owned stylesheet, removed with the plugin lifetime.
        ctx.effect(() => {
          const style = document.createElement('style');
          style.textContent = STYLES;
          style.setAttribute('data-dsh-turn-cost', '');
          document.head.appendChild(style);
          return () => { style.remove(); };
        }, 'dsh-turn-cost: styles');

        ctx.effect(() => ctx.locale.register('turnCost', LOCALE), 'dsh-turn-cost: dictionaries');

        // Per-Turn money on the message's action row (same line as usage / clock),
        // so it costs no vertical space of its own.
        ctx.effect(() => ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
          name: 'conversation.chat.assistant-actions',
          id: 'turn-cost',
          order: 90,
          label: 'Turn cost',
          locale: 'turnCost',
        }, TurnCostBadge)), 'dsh-turn-cost: assistant action entry');

        // The same chip for Turns that never finalized a message (no action row).
        ctx.effect(() => ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
          name: 'conversation.chat.turnTail',
          id: 'dsh-turn-cost',
          order: 90,
          label: 'Turn cost',
          locale: 'turnCost',
        }, TurnCostBadge)), 'dsh-turn-cost: turnTail entry');

        // Session-wide total in the composer's bottom stats row (after the
        // shipped `activity` / `usage` pills).
        ctx.effect(() => ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'session-cost',
          order: 2,
          label: 'Session cost',
          locale: 'turnCost',
        }, SessionCostPill)), 'dsh-turn-cost: composer dock pill');

        // The context-insight surfaces live in a lazily loaded sibling chunk so
        // this file stays focused on pricing. A chunk failure must never take
        // down the cost features above, so it is isolated and only logged.
        void require.async('./client.context.js').then((context) => {
          ctx.effect(() => context.apply(ctx, PRICING_API), 'dsh-turn-cost: context surfaces');
        }).catch((error) => {
          console.error('[dsh-turn-cost] context chunk failed to load:', error);
        });
      },

      /** Pure pricing face consumed by the sibling context chunk. */
      pricing: PRICING_API,
    };
  },
});
