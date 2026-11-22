/** The session projections powering the context views. */
import { identitySchema } from './schema.js';
import {
  initTimeline, applyTimeline, viewTimeline,
  initHeaders, applyHeaders, viewHeaders,
  initActivity, applyActivity, viewActivity,
} from './fold.js';
import { initSurface, applySurface, viewSurface } from './surface.js';

export const tcTimelineProjection = {
  // 7: tool-call counters, the command ledger, the file-op ledger, per-file line
  // deltas and the user/assistant/skill counters joined the timeline view.
  key: 'tcTimeline', stateVersion: 7, stateSchema: identitySchema,
  init: () => initTimeline(),
  apply: (state, event) => applyTimeline(state, event),
  wire: { viewSchema: identitySchema, view: viewTimeline, summary: false },
};

export const tcHeadersProjection = {
  key: 'tcHeaders', stateVersion: 1, stateSchema: identitySchema,
  init: () => initHeaders(),
  apply: (state, event) => applyHeaders(state, event),
  wire: { viewSchema: identitySchema, view: viewHeaders, summary: false },
};

export const tcActivityProjection = {
  // 4: each day also carries bounded tool / program / skill tallies for the
  // cross-session dashboard (3 added the peak / off-peak token split).
  key: 'tcActivity', stateVersion: 4, stateSchema: identitySchema,
  init: () => initActivity(),
  apply: (state, event) => applyActivity(state, event),
  wire: { viewSchema: identitySchema, view: viewActivity },
};

/**
 * Item-level context composition: the system prompt's sections, every tool
 * definition's own price, the message areas per kind, and the heaviest
 * surviving items. `contextBreakdown` gives the three bucket totals; this
 * answers what is inside them.
 */
export const tcSurfaceProjection = {
  key: 'tcSurface', stateVersion: 1, stateSchema: identitySchema,
  init: () => initSurface(),
  apply: (state, event) => applySurface(state, event),
  wire: { viewSchema: identitySchema, view: viewSurface, summary: false },
};

export const contextProjections = [
  tcTimelineProjection, tcHeadersProjection, tcActivityProjection, tcSurfaceProjection,
];
