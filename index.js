/**
 * Host half of the turn-cost / context-insight / project-memory bundle.
 *
 * The Client half owns all rendering and pricing. This half registers the
 * three `tc*` session projections that fold the durable Session log into
 * per-request context history, request-header metadata and daily activity,
 * **and** installs the project-memory engine (insights, TaskBridge, recall
 * injection, memory tools).
 *
 * `ctx.inject(['sessionProjections'])` is required, not decorative: the bundle
 * row may be loaded before the projection service exists, and a direct
 * `ctx.get('sessionProjections')` then returns undefined for the whole session,
 * leaving every context card empty. `inject` defers activation until the
 * service is provided and re-runs if it is re-declared.
 *
 * Activation stays defensive: a projection failure must never take down the
 * already-working per-turn / session cost features, so failures are recorded on
 * `ctx.logger` instead of thrown. Registrations are released on plugin unload
 * so HMR reloads do not leak refs.
 * (Host touch 10 — forces a module reload after host/ edits.)
 */
import Schema from '@deepseek-ai/schemastery';
import { contextProjections } from './host/projections.js';
import { createQuotaReader, mountQuotaRoute, resolveGateway } from './host/quota.js';
import { mountModelSync, resolveSyncOptions } from './host/model-sync/mount.js';
import { Config as memoryConfig, apply as applyMemory } from './src/memory/index.js';

/**
 * The bundle's own config = memory engine config. Everything the memory engine
 * used to read from its own profile row (`roots`, `insight`, `autoContext`,
 * `watchInterval`, …) now lives on this single row, so one settings surface
 * controls both halves.
 */
export const Config = memoryConfig;

/**
 * `tools` 和 `llm` 必须在这里声明，不能只留在 memory 模块里。
 *
 * cordis 的 inject 是**装配期门控**：`ctx.tools` / `ctx.llm` 这类属性访问在不声明
 * inject 时读不到（memory 引擎原本作为独立插件时靠自己的顶层 inject 拿到它们）。
 * 合并成库之后那个 inject 不再被 loader 读，于是 `ctx.tools` 变成 undefined ——
 * 12 个记忆工具全部注册失败，而且失败是"静默"的（我加的守卫只 console.warn，
 * 不进 dsh 日志）。2026-11-23 实测日志原文：
 *
 *   [dsh-project-memory] tools service unavailable; memory tools not registered
 *
 * 两者都是 dsh web 的核心服务，恒定存在，因此这里硬声明不会让成本半边被拖住；
 * 反过来（不声明）的代价是整个记忆引擎形同不存在。
 */
export const inject = ['llm', 'tools'];

export function apply(ctx, config) {
  // ---- project-memory engine -------------------------------------------------
  // Mounted first and in its own try/catch: a memory failure must not disable
  // cost tracking, and vice versa. The engine resolves its own optional
  // services (skills / commands / webServer) through `ctx.inject`, so a bare
  // Host still gets the cost half.
  //
  // `applyMemory` needs a config object; when the row carries none (a bare
  // bundle load), fall back to the schema defaults so `cfgValue()` reads real
  // values instead of undefined.
  try {
    const resolved = config && typeof config === 'object' ? config : (Config ? Config({}) : {});
    applyMemory(ctx, resolved);
  } catch (error) {
    ctx.logger?.error?.(
      `[dsh-turn-cost] memory engine failed to mount: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Subscription balance route: one same-origin GET that the Client renders at
  // the sidebar foot. `webServer` and `credentials` are both optional for this
  // plugin — without either, the route is simply absent and the Client keeps a
  // plain overview button, so a bare Host still gets the cost features.
  ctx.inject(['webServer', 'credentials'], (scoped) => {
    const webServer = scoped.get ? scoped.get('webServer') : scoped.webServer;
    const credentials = scoped.get ? scoped.get('credentials') : scoped.credentials;
    if (webServer === undefined || webServer === null || typeof webServer.register !== 'function') return;
    if (credentials === undefined || credentials === null || typeof credentials.resolve !== 'function') return;
    // The self-hosted gateway (`ai-shim`) answers first when `DSH_TURN_COST_GATEWAY_URL`
    // is set: it owns both halves of the question — which backend a route bills
    // (`/v1/models` rows carry `quota.source`) and what is left on it (`/v1/quota`).
    // Unset keeps the three direct vendor reads; see host/quota.js.
    const gateway = resolveGateway(process.env);
    if (gateway !== null) {
      ctx.logger?.info?.(`[dsh-turn-cost] quota via gateway ${gateway.baseURL}`);
    }
    const reader = createQuotaReader(gateway === null ? {} : { gateway });
    // The route names a credential reference per source; resolution happens on
    // every read so a rotated key reaches the next poll without a restart.
    const readKey = async (ref) => {
      const resolved = await credentials.resolve(ref);
      return resolved === undefined || resolved === null ? undefined : resolved.value;
    };
    scoped.effect(() => mountQuotaRoute(scoped, reader, readKey), 'dsh-turn-cost: quota route');
  });

  // Model-catalog sync: a route the installed pi-ai catalog does not describe
  // (a self-hosted gateway) has no runtime model directory, so the profile's
  // `models` list *is* the picker. This loop keeps that list equal to the
  // gateway's own `/v1/models`, writing through the settings service — the only
  // writer that validates the entries, persists the profile patch and rebuilds
  // the route in one transaction. `settings` is required; `credentials` and
  // `webServer` are optional, so a bare Host still syncs a keyless route.
  ctx.inject(['settings'], (scoped) => {
    const settings = scoped.get ? scoped.get('settings') : scoped.settings;
    if (settings === undefined || settings === null || typeof settings.update !== 'function') {
      ctx.logger?.warn?.('[dsh-turn-cost] settings service unusable; model sync skipped');
      return;
    }
    const options = resolveSyncOptions(process.env);
    if (!options.enabled) {
      ctx.logger?.info?.('[dsh-turn-cost] model sync disabled by DSH_TURN_COST_MODEL_SYNC');
      return;
    }
    try {
      mountModelSync(scoped, options);
    } catch (error) {
      ctx.logger?.warn?.(`[dsh-turn-cost] model sync not mounted: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ctx.inject(['sessionProjections'], (scoped) => {
    const projections = scoped.get
      ? scoped.get('sessionProjections')
      : scoped.sessionProjections;
    if (projections === undefined || projections === null || typeof projections.register !== 'function') {
      ctx.logger?.warn?.('[dsh-turn-cost] sessionProjections unusable; context projections skipped');
      return;
    }

    const handles = [];
    let disposed = false;

    const ready = Promise.all(contextProjections.map(async (definition) => {
      try {
        const handle = await projections.register(definition);
        if (disposed) { await handle.dispose(); return; }
        handles.push(handle);
        ctx.logger?.info?.(`[dsh-turn-cost] projection ${definition.key} registered`);
      } catch (error) {
        ctx.logger?.warn?.(`[dsh-turn-cost] projection ${definition.key} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));

    scoped.effect(() => () => {
      disposed = true;
      void ready.then(() => {
        for (const handle of handles) void handle.dispose();
      });
    }, 'dsh-turn-cost: context projections');
  });
}
