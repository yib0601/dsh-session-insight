# Official price table — provenance

Verified **2026-11-15 (GMT+8)** against each vendor's official pricing page. Unit: **USD per 1,000,000 tokens**, Standard / synchronous tier. The table is the accounting unit; the UI displays CNY by default (see [Display currency](#display-currency)). `cacheWrite` = 5-minute cache write where the vendor prices it separately; 0 where the API does not report cache-write tokens.

## DeepSeek — <https://api-docs.deepseek.com/quick_start/pricing>

Off-peak = half of peak. Peak hours: **01:00–04:00 and 06:00–10:00 UTC, Monday–Friday, excluding Chinese public holidays** = Beijing 09:00–12:00 / 14:00–18:00. All other hours are off-peak. Source footnote (2).

| model | tier | input (cache miss) | cache hit | output |
|---|---|---|---|---|
| `deepseek-flash` | peak | 0.30 | 0.006 | 1.20 |
| `deepseek-flash` | off-peak | 0.15 | 0.003 | 0.60 |
| `deepseek-v4-pro` | peak | 1.32 | 0.044 | 3.96 |
| `deepseek-v4-pro` | off-peak | 0.66 | 0.022 | 1.98 |

Official CNY page: <https://api-docs.deepseek.com/zh-cn/quick_start/pricing> — `deepseek-flash` peak ¥2 / ¥0.04 / ¥8, off-peak ¥1 / ¥0.02 / ¥4; `deepseek-v4-pro` peak ¥9 / ¥0.30 / ¥27, off-peak ¥4.5 / ¥0.15 / ¥13.5. These rows are stored as `cnyPeak` / `cnyOffPeak` and used verbatim whenever the display currency is CNY, so the CNY amount is the vendor's own number rather than a conversion.

`deepseek-chat` / `deepseek-reasoner` are **retired** and absent from the current official page — not priced. Legacy `deepseek-v4-flash` / `deepseek-v4-flash-vision-exp` are served by V4.1-Flash and billed at the Flash price (official footnote (1)), so they are aliased to `deepseek-flash`.

## Anthropic — <https://docs.anthropic.com/en/docs/about-claude/pricing>

Cache write = 1.25× base input (5m) / 2× (1h); cache read = 0.1× base input on most models. The plugin uses the 5m write rate.

| model | input | cache read | cache write | output |
|---|---|---|---|---|
| `claude-fable-5-2` | 8 | 0.20 | 10 | 40 |
| `claude-opus-5-5` | 4 | 0.20 | 5 | 20 |
| `claude-sonnet-5-5` | 2 | 0.10 | 2.50 | 10 |
| `claude-haiku-5-5` (≤100K) | 0.10 | 0.01 | 0.125 | 0.50 |
| `claude-haiku-5-5` (>100K) | 0.50 | 0.05 | 0.625 | 2.50 |
| `claude-sonnet-5` | 2 | 0.20 | 2.50 | 10 |
| `claude-opus-4-5` | 5 | 0.50 | 6.25 | 25 |
| `claude-haiku-4-5` | 1 | 0.10 | 1.25 | 5 |

## OpenAI — <https://platform.openai.com/docs/pricing>

Standard tier, short context (≤272K input). `openai.com/api/pricing` returned 403, so the official platform docs page was used. OpenAI reports cached input tokens but no separate cache-write token count, so `cacheWrite = 0`.

| model | input | cached input | output |
|---|---|---|---|
| `gpt-6-astra` | 10 | 1 | 50 |
| `gpt-6.1-sol` | 2 | 0.10 | 10 |
| `gpt-6.1-terra` | 1 | 0.05 | 5 |
| `gpt-6-luna` | 0.10 | 0.01 | 0.50 |
| `gpt-6-sol` | 2 | 0.20 | 10 |
| `gpt-5.5` | 5 | 0.50 | 30 |
| `gpt-5.1` | 1.25 | 0.125 | 10 |

## Google Gemini — <https://ai.google.dev/gemini-api/docs/pricing>

Standard paid tier, synchronous. Thinking tokens are billed as output. Cache-write tokens are not separately reported, so `cacheWrite = 0`.

| model | input | cached input | output | note |
|---|---|---|---|---|
| `gemini-4-carbon` | 2.00 | 0.10 | 10.00 | until 2026-11-30; then 4 / 0.20 / 20 |
| `gemini-4-argon` | 2.00 | 0.10 | 10.00 | until 2026-11-30 |
| `gemini-4-hydrogen` | 1.50 | 0.075 | 7.50 | free tier available |
| `gemini-3.8-flash` | 0.75 | 0.075 | 3.75 | until 2026-12-31; then 1.50 / 0.15 / 7.50 |
| `gemini-3.5-flash-lite` | 0.30 | 0.03 | 2.50 | |
| `gemini-3.1-flash-lite` | 0.25 | 0.025 | 1.50 | |
| `gemini-3-flash-preview` | 0.50 | 0.05 | 3.00 | free tier available |

## Aliases — gateway model names mapped to the official model

This installation routes most turns through `ai-router` / `opencode-go`, whose catalog names the same first-party models differently. `ALIASES` in `client.js` maps these **only when the official docs identify the same model**:

| gateway id | official price row | why |
|---|---|---|
| `deepseek-v4.1-flash`, `DeepSeek-V4.1-Flash(-1017)`, `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp` | `deepseek-flash` | Official footnote (1): `deepseek-flash` is served by DeepSeek-V4.1-Flash-1017; retired legacy names are billed at the Flash price. |
| `deepseek-v4-pro-official`, `deepseek-v4.1-pro` | `deepseek-v4-pro` | Same V4-Pro model. |

A `provider` different from the vendor (gateway) does **not** change the price: the badge shows the model's first-party official list rate, with the explicit note that it is an estimate, not actual billing.

## Provider-marked free models

WorkBuddy / OpenCode Zen 的混元与网关模型逐模型区分计费，免费名额是**运营活动**（会整批切换），所以这组标记不是静态表：shim 自报的 `billing` 由 `billing_sync.py` 按上游目录 + `usage.credit` 实测定时刷新，provider 目录里的显示名随之变成「免费 / 付费」。

现态：

- **免费**（显示名带「免费」，`usage.credit=0`）：`hy4-flash`、`hy4flash-free`、`hy3` / `hy3-b` / `hy3-c`、`hy4-flash-free`、`deepseek-v4.1-flash-free`、`openrouter/free`、`big-pickle`、`beam-free`、`flint-40b-free`、`glm-5.3-flash-free`、`iceman-free` / `iceman-contributor-free`、`inkling-2-small-free`、`longcat-2.5-free`、`mimo-v2.6-flash-free`、`minimax-m3.1-flash-free`、`nemotron-3.5-lightning-free` / `nemotron-3.5-super-vl-free`，以及所有 `…:free` 路由。这些记全零费率并打 `free` 标记，显示 `¥0 · 免费`；这是供应商自己的标价，不是一方 API 目录价，徽标详情里已注明。名单在 `client.js#FREE_MODELS`（`lookupPrice` 另外识别 `:free` 后缀）。
- **付费但无 per-token 官方价**：`hy4`、`hy4-preview`（目录 `credits x0.29`，实测每次调用 `usage.credit=0.01`）。供应商按 credits 计费，没有公开的每 token 单价，DSH 的 token 用量里也不含 credit 数，因此这两行是 `unpriced`：显示「价格未知」，徽标详情给出上述原因，**不会**按 `0` 计。
- **有第一方刊例价的网关同名模型**（如 `models/gemini-4-carbon`）即使 provider 目录标「免费」也按其厂商官方价计：需求是「各厂商官方价」，provider 的免费标签只用于没有第一方价格的模型。

## Not covered / unverified

- DSH's pi-ai adapter lists 42 provider ids; 38 are gateways, resellers or CNY-priced vendors with no single first-party token price. They return `status: unknown` and the UI says "价格未知".
- Batch / Flex / Priority / Fast / long-context (>272K) tiers are excluded. A turn is priced at Standard synchronous rates.
- Chinese public holidays are not auto-detected; fill `HOLIDAYS_UTC8` in `client.js` for exact DeepSeek peak classification.
- Prices change. Re-verify each row before a release and update the `date` shown in the badge details.

## Display currency

The preference `currency` (`设置 → 费用 → 金额币种`) picks CNY (default) or USD. It only changes presentation; both official amounts stay available on every result (`usd` and, where published, `cny`).

- **CNY with an official row** (DeepSeek): `cny` is used as-is. `fx = false`.
- **CNY without an official row** (Anthropic / OpenAI / Google, and any USD-published row): `usd × USD_TO_CNY`, with `USD_TO_CNY = 7.2` in `client.js`. `fx = true`, and both the badge panel and the session panel print the conversion note. A zero amount (free model) is never marked as converted.
- **USD**: identical to the table above; DeepSeek's official CNY then appears as the secondary amount.

Rate rows in the details panel follow the same currency, so `tokens × ¥rate /M` always reproduces the amount next to it. `formatMoney(amount, currency)` keeps 4–6 decimals below ¥1 so a running total never rounds to `¥0`, and 2 decimals at ¥1 and above.
