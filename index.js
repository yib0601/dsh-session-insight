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
import { createModelsSurface, mountModelSync, resolveSyncOptions } from './host/model-sync/mount.js';
import { NotesBridge, bridgeKey, notesSettings } from './host/notes/provider.js';
import { NOT_CONFIGURED_MESSAGE, searchNotesTool } from './host/notes/tool.js';
import { Config as memoryConfig, apply as applyMemory } from './src/memory/index.js';
import { changedConfigKeys } from './src/memory/util/config.js';

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
  // ---- notes retrieval (原 search-notes MCP，现为本插件的 search_notes 工具) ----
  // 与成本、记忆并列的第三块能力。它替换掉记忆引擎的文档 chunk 层：两者覆盖同一批
  // Markdown，而 section 级混合检索的质量高出一个量级，留着文档层只会产生冲突结果。
  //
  // 常驻 Python 桥的内存成本很高（模型 ~1GB），所以：
  //   · `notes.repo` 为空 = 完全不启用，连进程都不拉；
  //   · 进程惰性启动 —— 第一次真正调用 search_notes 才 spawn；
  //   · 卸载时 dispose，emb_server 是其子进程会随之退出。
  //
  // 工具**恒注册**，不再"配置了才出现"：没配置就没有工具的时代，界面和模型两边都看不见
  // 这回事（用户的原话是"纯看界面都不知道有笔记检索"）。现在它始终在工具表里，调用时给出
  // 一句可执行的话（去哪个设置页填哪个格子），而不是让能力静默失踪。
  //
  // 目录/开关是 volatile 字段：设置页保存后 `loader/volatile-update` 一到就换桥（旧进程
  // dispose、新进程按需拉起），不用重启会话。
  let notesBridge = null;
  try {
    const holder = {
      get configured() {
        return notesBridge !== null;
      },
      async search(args) {
        if (notesBridge === null) throw new Error(NOT_CONFIGURED_MESSAGE);
        return notesBridge.search(args);
      },
    };
    if (typeof ctx.tools?.register === 'function') {
      ctx.tools.register(searchNotesTool(holder, config));
    }
    const mountNotes = (settings) => {
      notesBridge = settings.enabled ? new NotesBridge(settings) : null;
      if (notesBridge !== null) {
        ctx.logger?.info?.(`[dsh-session-insight] notes search enabled: ${settings.repo}`);
        // 预热只是 ping 进程（不加载模型），失败留给第一次真正的检索如实回报。
        notesBridge.ensureStarted().catch(() => {});
      }
    };
    mountNotes(notesSettings(config));

    const reconfigureNotes = () => {
      let next;
      try {
        next = notesSettings(config);
      } catch (error) {
        ctx.logger?.error?.(`[dsh-session-insight] notes settings unreadable: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      const before = notesBridge === null ? null : notesBridge.settings;
      if (before !== null && bridgeKey(before) === bridgeKey(next)) return;
      const previous = notesBridge;
      notesBridge = null;
      void previous?.dispose();
      mountNotes(next);
    };

    // 同一个 bundle 上还有 watchInterval 等 volatile 字段，只有 `notes` 那条路径才关这里的事。
    ctx.on?.('loader/volatile-update', (paths) => {
      const changed = changedConfigKeys(paths);
      if (changed === null || changed.has('notes')) reconfigureNotes();
    });

    ctx.effect(() => () => { void notesBridge?.dispose(); }, 'dsh-session-insight: notes bridge');
  } catch (error) {
    ctx.logger?.error?.(
      `[dsh-session-insight] notes bridge not mounted: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

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
      `[dsh-session-insight] memory engine failed to mount: ${error instanceof Error ? error.message : String(error)}`,
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
    // The self-hosted gateway (`ai-shim`) answers first when `DSH_SESSION_INSIGHT_GATEWAY_URL`
    // is set: it owns both halves of the question — which backend a route bills
    // (`/v1/models` rows carry `quota.source`) and what is left on it (`/v1/quota`).
    // Unset keeps the three direct vendor reads; see host/quota.js.
    const gateway = resolveGateway(process.env);
    if (gateway !== null) {
      ctx.logger?.info?.(`[dsh-session-insight] quota via gateway ${gateway.baseURL}`);
    }
    const reader = createQuotaReader(gateway === null ? {} : { gateway });
    // The route names a credential reference per source; resolution happens on
    // every read so a rotated key reaches the next poll without a restart.
    const readKey = async (ref) => {
      const resolved = await credentials.resolve(ref);
      return resolved === undefined || resolved === null ? undefined : resolved.value;
    };
    scoped.effect(() => mountQuotaRoute(scoped, reader, readKey), 'dsh-session-insight: quota route');
  });

  // Model-catalog sync: a route the installed pi-ai catalog does not describe
  // (a self-hosted gateway) has no runtime model directory, so the profile's
  // `models` list *is* the picker. This loop keeps that list equal to the
  // gateway's own `/v1/models`, writing through the settings service — the only
  // writer that validates the entries, persists the profile patch and rebuilds
  // the route in one transaction. `settings` is required; `credentials` and
  // `webServer` are optional, so a bare Host still syncs a keyless route.
  // The route is claimed from a `webServer`-scoped pass, then the loop attaches
  // from a `settings`-scoped one. Splitting them matters: a route registered only
  // from inside `inject(['settings'])` silently does not exist when that pass
  // never runs, and the path 404s while the rest of the plugin works. Claiming it
  // early also keeps the client readable — it gets `syncUnavailable` + a reason
  // instead of a 404 it can only report as an error.
  ctx.inject(['webServer'], (web) => {
    const options = resolveSyncOptions(process.env);
    if (!options.enabled) {
      ctx.logger?.info?.('[dsh-session-insight] model sync disabled by DSH_SESSION_INSIGHT_MODEL_SYNC');
      return;
    }
    let surface;
    try {
      surface = createModelsSurface(web, options);
    } catch (error) {
      ctx.logger?.warn?.(`[dsh-session-insight] model route not registered: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    ctx.inject(['settings'], (scoped) => {
      const settings = scoped.get ? scoped.get('settings') : scoped.settings;
      if (settings === undefined || settings === null || typeof settings.update !== 'function') {
        ctx.logger?.warn?.('[dsh-session-insight] settings service unusable; model sync skipped (route answers sync-unavailable)');
        return;
      }
      try {
        mountModelSync(scoped, options, surface);
      } catch (error) {
        ctx.logger?.warn?.(`[dsh-session-insight] model sync not mounted: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  });

  ctx.inject(['sessionProjections'], (scoped) => {
    const projections = scoped.get
      ? scoped.get('sessionProjections')
      : scoped.sessionProjections;
    if (projections === undefined || projections === null || typeof projections.register !== 'function') {
      ctx.logger?.warn?.('[dsh-session-insight] sessionProjections unusable; context projections skipped');
      return;
    }

    const handles = [];
    let disposed = false;

    const ready = Promise.all(contextProjections.map(async (definition) => {
      try {
        const handle = await projections.register(definition);
        if (disposed) { await handle.dispose(); return; }
        handles.push(handle);
        ctx.logger?.info?.(`[dsh-session-insight] projection ${definition.key} registered`);
      } catch (error) {
        ctx.logger?.warn?.(`[dsh-session-insight] projection ${definition.key} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));

    scoped.effect(() => () => {
      disposed = true;
      void ready.then(() => {
        for (const handle of handles) void handle.dispose();
      });
    }, 'dsh-session-insight: context projections');
  });
}
