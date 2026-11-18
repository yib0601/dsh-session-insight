/**
 * Host half of the turn-cost / context-insight bundle.
 *
 * The Client half owns all rendering and pricing. This half only registers the
 * three `tc*` session projections that fold the durable Session log into
 * per-request context history, request-header metadata and daily activity.
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
 * (Host touch 6 — forces a module reload after host/ edits.)
 */
import { contextProjections } from './host/projections.js';

export function apply(ctx) {
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
