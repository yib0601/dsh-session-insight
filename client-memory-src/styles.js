/**
 * CSS 层：从原 rolldown bundle 中提取的压缩 CSS 与 hashed 类名映射。
 *
 * 为什么保留原样：CSS Modules 的类名是构建期 hashed 的（i54Wjq_ 前缀），
 * 手写组件不可能重新生成同一套 hash。直接复用同一份字符串与映射表，
 * 保证视觉与原来逐像素一致，也避免重写 1019 行 CSS 引入回归。
 *
 * 三份样式分别对应 TaskPanel.module.css / TaskCommandNode.module.css /
 * SettingsCard.module.css，与原包一一对应。
 */

export const PANEL_CSS = ".i54Wjq_panel{pointer-events:auto;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#fff));border:1px solid var(--dsw-alias-border-l2,#7f7f7f4d);border-radius:14px;flex-direction:column;width:380px;max-width:calc(100vw - 24px);max-height:min(70vh,640px);font-family:inherit;animation:.18s ease-out i54Wjq_panelIn;display:flex;position:fixed;overflow:hidden;box-shadow:0 12px 32px #00000029,0 2px 8px #00000014}@keyframes i54Wjq_panelIn{0%{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}.i54Wjq_dragHandle{cursor:grab;z-index:1;justify-content:center;align-items:center;height:12px;display:flex;position:absolute;top:0;left:0;right:0}.i54Wjq_dragHandle:active{cursor:grabbing}.i54Wjq_handleGrip{background:var(--dsw-alias-separator-primary,#7f7f7f59);opacity:.8;border-radius:2px;width:32px;height:3px}.i54Wjq_header{border-bottom:1px solid var(--dsw-alias-border-l1,#7f7f7f2e);-webkit-user-select:none;user-select:none;justify-content:space-between;align-items:center;gap:8px;padding:10px 10px 8px 14px;display:flex}.i54Wjq_headerLeft{align-items:center;gap:6px;min-width:0;display:flex}.i54Wjq_headerIcon{color:var(--dsw-alias-label-secondary);flex:none}.i54Wjq_headerTitle{color:var(--dsw-alias-label-primary);white-space:nowrap;margin:0;font-size:13px;font-weight:600;line-height:20px}.i54Wjq_headerRight{align-items:center;gap:2px;margin-left:auto;display:flex}.i54Wjq_hintsOff{opacity:.45}.i54Wjq_hintsOff:hover{opacity:.75}.i54Wjq_counts{color:var(--dsw-alias-label-tertiary);white-space:nowrap;margin-right:4px;font-size:11px;line-height:16px}.i54Wjq_boundBadge{color:var(--dsw-alias-label-primary-foreground,#fff);background:var(--dsw-alias-button-primary-fill,#3a6ef5);white-space:nowrap;border-radius:7px;flex:none;padding:0 6px;font-size:10px;line-height:14px}.i54Wjq_notice{color:var(--dsw-alias-state-warn-label,#b7791f);background:var(--dsw-alias-interactive-bg-hover,#7f7f7f1a);word-break:break-all;border-radius:8px;margin:8px 12px 0;padding:6px 10px;font-size:12px;line-height:18px}.i54Wjq_taskList{scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2,transparent) transparent;flex-direction:column;gap:6px;padding:8px;display:flex;overflow-y:auto}.i54Wjq_emptyState{text-align:center;color:var(--dsw-alias-label-secondary);padding:36px 24px 30px}.i54Wjq_emptyTitle{color:var(--dsw-alias-label-primary);margin:0 0 6px;font-size:13px;font-weight:600}.i54Wjq_emptyDesc{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:20px}.i54Wjq_syncHint{color:var(--dsw-alias-label-dimmed);justify-content:center;align-items:center;gap:6px;margin:10px 0 0;font-size:11px;display:flex}.i54Wjq_card{border:1px solid var(--dsw-alias-border-l1,#7f7f7f29);background:var(--dsw-alias-bg-base,transparent);content-visibility:auto;contain-intrinsic-size:auto 140px;border-radius:10px;transition:border-color .15s;overflow:hidden}.i54Wjq_cardBound{border-color:var(--dsw-alias-border-l3,#7f7f7f59);box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l3,transparent)}.i54Wjq_cardHead{cursor:pointer;text-align:left;background:0 0;border:none;justify-content:space-between;align-items:center;gap:8px;width:100%;padding:8px 10px 7px;display:flex}.i54Wjq_cardHead:hover{background:var(--dsw-alias-interactive-bg-hover,#7f7f7f14)}.i54Wjq_cardTitleRow{align-items:center;gap:6px;min-width:0;display:flex}.i54Wjq_cardTitle{color:var(--dsw-alias-label-primary);white-space:nowrap;text-overflow:ellipsis;font-size:13px;font-weight:500;line-height:20px;overflow:hidden}.i54Wjq_cardMeta{color:var(--dsw-alias-label-tertiary);flex:none;align-items:center;gap:8px;display:flex}.i54Wjq_progressText{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}.i54Wjq_updated{color:var(--dsw-alias-label-dimmed);font-size:10px;line-height:14px}.i54Wjq_chevron{color:var(--dsw-alias-label-tertiary);display:inline-flex}.i54Wjq_track{background:var(--dsw-alias-interactive-bg-hover,#7f7f7f1f);border-radius:1px;height:2px;margin:0 10px 6px;overflow:hidden}.i54Wjq_trackFill{background:var(--dsw-alias-label-primary-bluish,var(--dsw-alias-button-primary-fill,#3a6ef5));border-radius:1px;height:100%;transition:width .2s}.i54Wjq_cardBody{border-top:1px solid var(--dsw-alias-border-l1,#7f7f7f24);overscroll-behavior:contain;max-height:300px;padding:8px 10px 10px;overflow-y:auto}.i54Wjq_section{margin-bottom:8px}.i54Wjq_section:last-child{margin-bottom:0}.i54Wjq_sectionLabel{color:var(--dsw-alias-label-secondary);align-items:center;gap:6px;margin-bottom:4px;font-size:11px;line-height:16px;display:flex}.i54Wjq_sectionCount{background:var(--dsw-alias-interactive-bg-hover,#7f7f7f1a);color:var(--dsw-alias-label-tertiary);border-radius:6px;padding:0 5px;font-size:10px;line-height:14px}.i54Wjq_stepsList{flex-direction:column;gap:1px;margin:0;padding:0;list-style:none;display:flex}.i54Wjq_stepRow{align-items:flex-start;gap:7px;padding:3px 2px;display:flex}.i54Wjq_stepRow>svg{flex:none;margin-top:2px}.i54Wjq_stepDone{color:var(--dsw-alias-label-dimmed)}.i54Wjq_stepRun{color:var(--dsw-alias-label-primary-bluish,#3a6ef5)}.i54Wjq_stepPending{background:var(--dsw-alias-border-l3,#7f7f7f80);border-radius:50%;flex:none;width:8px;height:8px;margin:5px 3px}.i54Wjq_stepContent{color:var(--dsw-alias-label-secondary);word-break:break-word;white-space:pre-wrap;font-size:12px;line-height:20px}.i54Wjq_stepContentDone{color:var(--dsw-alias-label-dimmed);text-decoration:line-through}.i54Wjq_stepContentRun{color:var(--dsw-alias-label-primary)}.i54Wjq_muted{color:var(--dsw-alias-label-dimmed);font-size:11px;line-height:18px}.i54Wjq_filesList{flex-direction:column;margin:0;padding:0;list-style:none;display:flex}.i54Wjq_fileRow{cursor:pointer;text-align:left;background:0 0;border:none;border-radius:6px;align-items:center;gap:6px;width:100%;padding:3px 4px;display:flex}.i54Wjq_fileRow:hover{background:var(--dsw-alias-interactive-bg-hover,#7f7f7f14)}.i54Wjq_fileDot{background:var(--dsw-alias-border-l3,#7f7f7f80);border-radius:50%;flex:none;width:5px;height:5px}.i54Wjq_filePath{color:var(--dsw-alias-label-secondary);white-space:nowrap;text-overflow:ellipsis;text-align:left;direction:rtl;font-family:ui-monospace,SF Mono,Menlo,Consolas,monospace;font-size:11px;line-height:18px;overflow:hidden}.i54Wjq_fileLine{color:var(--dsw-alias-label-dimmed);flex:none;font-size:10px;line-height:18px}.i54Wjq_cardFooter{gap:6px;margin-top:8px;display:flex}@media (prefers-reduced-motion:reduce){.i54Wjq_panel{animation:none}.i54Wjq_trackFill,.i54Wjq_card{transition:none}}.i54Wjq_miniBar{border:1px solid var(--dsw-alias-border-l3,#7f7f7f4d);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#fff));max-width:min(46vw,340px);height:34px;color:var(--dsw-alias-label-primary);cursor:grab;-webkit-user-select:none;user-select:none;pointer-events:auto;border-radius:999px;align-items:center;gap:7px;padding:0 12px;font-size:12px;line-height:18px;transition:background .15s,border-color .15s;display:inline-flex;position:fixed;box-shadow:0 6px 20px #00000024,0 1px 4px #00000014}.i54Wjq_miniBar:active{cursor:grabbing}.i54Wjq_miniBar:hover{background:var(--dsw-alias-interactive-bg-hover,#7f7f7f14)}.i54Wjq_miniIcon{color:var(--dsw-alias-label-secondary);flex:none}.i54Wjq_miniText{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.i54Wjq_miniChevron{color:var(--dsw-alias-label-tertiary);flex:none}.i54Wjq_taskList{flex:auto;min-height:0}.i54Wjq_card{flex-direction:column;display:flex}.i54Wjq_boundaryFallback{border:1px solid var(--dsw-alias-border-l3,#7f7f7f4d);background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-secondary);cursor:pointer;pointer-events:auto;border-radius:999px;padding:4px 10px;font-size:12px;line-height:18px;position:fixed;top:64px;right:16px}.i54Wjq_stepToggle{cursor:pointer;background:0 0;border:none;border-radius:4px;flex:none;align-items:center;margin-top:2px;padding:0;display:inline-flex}.i54Wjq_stepToggle:hover{background:var(--dsw-alias-interactive-bg-hover,#7f7f7f1f)}.i54Wjq_stepToggle:disabled{cursor:default;opacity:.5}.i54Wjq_stepEditable{cursor:text;border-radius:3px}.i54Wjq_stepEditable:hover{outline:1px dashed var(--dsw-alias-border-l3,#7f7f7f66);outline-offset:1px}.i54Wjq_stepInput{box-sizing:border-box;width:auto;min-width:0;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base,transparent);border:1px solid var(--dsw-alias-border-l3,#7f7f7f73);border-radius:5px;flex:auto;padding:0 5px;font-size:12px;line-height:20px}.i54Wjq_editorArea{box-sizing:border-box;min-width:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base,transparent);border:1px solid var(--dsw-alias-border-l3,#7f7f7f73);resize:none;vertical-align:middle;cursor:text;white-space:pre-wrap;word-break:break-word;border-radius:5px;flex:1;margin:0;padding:2px 5px;font-family:inherit;font-size:12px;line-height:20px;overflow:hidden}.i54Wjq_editorArea:focus{border-color:var(--dsw-alias-border-l3,#7f7f7f99);outline:none}.i54Wjq_stepDragging{opacity:.3;background:var(--dsw-alias-interactive-bg-hover,#7f7f7f14)}.i54Wjq_cardTitleEditable{cursor:text;border-radius:3px}.i54Wjq_cardTitleEditable:hover{outline:1px dashed var(--dsw-alias-border-l3,#7f7f7f66);outline-offset:1px}.i54Wjq_panel[data-theme=glass],.i54Wjq_miniBar[data-theme=glass]{background:color-mix(in srgb, var(--dsw-alias-bg-layer-2,#fff) 90%, transparent);-webkit-backdrop-filter:blur(18px)saturate(1.2);border:1px solid color-mix(in srgb, var(--dsw-alias-border-l2,#7f7f7f4d) 80%, transparent)}.i54Wjq_panel[data-theme=glass] .i54Wjq_card{background:color-mix(in srgb, var(--dsw-alias-bg-base,transparent) 84%, transparent);border-color:color-mix(in srgb, var(--dsw-alias-border-l1,#7f7f7f29) 60%, transparent)}.i54Wjq_panel[data-theme=glass] .i54Wjq_cardBody{border-top-color:color-mix(in srgb, var(--dsw-alias-border-l1,#7f7f7f24) 60%, transparent)}@media (prefers-reduced-transparency:reduce){.i54Wjq_panel[data-theme=glass],.i54Wjq_miniBar[data-theme=glass]{background:var(--dsw-alias-bg-layer-2,#fff);-webkit-backdrop-filter:none;backdrop-filter:none}.i54Wjq_panel[data-theme=glass] .i54Wjq_card{background:var(--dsw-alias-bg-base,transparent)}}@supports not ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.i54Wjq_panel[data-theme=glass],.i54Wjq_miniBar[data-theme=glass]{background:var(--dsw-alias-bg-layer-2,#fff)}}.i54Wjq_panel[data-theme=brutal]{box-shadow:none;border-width:1px;border-radius:6px}.i54Wjq_panel[data-theme=brutal] .i54Wjq_card{border:1px solid var(--dsw-alias-border-l3,#7f7f7f6b);background:var(--dsw-alias-bg-base,transparent);box-shadow:none;border-radius:3px}.i54Wjq_panel[data-theme=brutal] .i54Wjq_cardHead{padding:7px 10px 6px}.i54Wjq_panel[data-theme=brutal] .i54Wjq_cardTitle{letter-spacing:.01em;font-weight:650}.i54Wjq_panel[data-theme=brutal] .i54Wjq_headerTitle{letter-spacing:.03em}.i54Wjq_panel[data-theme=brutal] .i54Wjq_boundBadge{border-radius:2px}.i54Wjq_panel[data-theme=brutal] .i54Wjq_track{border-radius:0;height:3px}.i54Wjq_panel[data-theme=brutal] .i54Wjq_trackFill{border-radius:0}.i54Wjq_panel[data-theme=brutal] .i54Wjq_cardBody{border-top:1px solid var(--dsw-alias-border-l2,#7f7f7f3d)}.i54Wjq_panel[data-theme=mono] .i54Wjq_headerTitle,.i54Wjq_panel[data-theme=mono] .i54Wjq_counts,.i54Wjq_panel[data-theme=mono] .i54Wjq_cardTitle,.i54Wjq_panel[data-theme=mono] .i54Wjq_progressText,.i54Wjq_panel[data-theme=mono] .i54Wjq_stepContent,.i54Wjq_panel[data-theme=mono] .i54Wjq_filePath{font-family:ui-monospace,SF Mono,Menlo,Consolas,Liberation Mono,monospace}.i54Wjq_panel[data-theme=mono] .i54Wjq_cardTitle{font-size:12px}.i54Wjq_panel[data-theme=mono] .i54Wjq_stepContent{font-size:11.5px}.i54Wjq_panel[data-theme=mono] .i54Wjq_card{border-radius:5px}.i54Wjq_panel[data-theme=mono] .i54Wjq_trackFill{border-radius:0}.i54Wjq_panel[data-theme=mono] .i54Wjq_stepPending{border-radius:1px}.i54Wjq_panel[data-theme=mono] .i54Wjq_updated{letter-spacing:.02em}.i54Wjq_headerIconBtn{color:inherit;cursor:pointer;background:0 0;border:none;border-radius:0;flex:none;justify-content:center;align-items:center;margin:0;padding:0;display:inline-flex}.i54Wjq_headerIcon{color:var(--dsw-alias-label-secondary);flex:none;display:block}.i54Wjq_headerLeft{min-width:0}.i54Wjq_headerTitle{text-overflow:ellipsis;flex:0 auto;min-width:0;overflow:hidden}.i54Wjq_headerRight{min-width:0}.i54Wjq_counts{text-overflow:ellipsis;flex:none;max-width:45%;margin-left:auto;overflow:hidden}.i54Wjq_dragGhost{pointer-events:none;z-index:9999;transition:left 50ms,top 50ms;position:fixed;transform:translate(-50%,-50%)}.i54Wjq_dragGhostCard{background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#fff));border:1px solid var(--dsw-alias-border-l3,#7f7f7f59);color:var(--dsw-alias-label-primary);white-space:nowrap;border-radius:8px;align-items:center;gap:8px;max-width:280px;padding:8px 12px;font-size:12px;line-height:20px;display:inline-flex;transform:scale(.9);box-shadow:0 8px 24px #0000002e,0 2px 8px #0000001a}.i54Wjq_dragGhostContent{text-overflow:ellipsis;word-break:break-word;flex:1;min-width:0;overflow:hidden}.i54Wjq_dragGhostClose{width:20px;height:20px;color:var(--dsw-alias-label-tertiary);cursor:pointer;opacity:.6;background:0 0;border:none;border-radius:4px;flex:none;justify-content:center;align-items:center;margin-left:8px;font-size:16px;line-height:1;transition:opacity .15s,background .15s,color .15s;display:inline-flex}.i54Wjq_dragGhostClose:hover{opacity:1;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover,#7f7f7f1f)}.i54Wjq_dropTargetBefore{position:relative}.i54Wjq_dropTargetBefore:before{content:\"\";background:var(--dsw-alias-button-primary-fill,#3a6ef5);height:2px;box-shadow:0 0 4px var(--dsw-alias-button-primary-fill,#3a6ef5);border-radius:1px;animation:.8s ease-in-out infinite i54Wjq_dropPulse;position:absolute;top:-1px;left:0;right:0}.i54Wjq_dropTargetAfter{position:relative}.i54Wjq_dropTargetAfter:after{content:\"\";background:var(--dsw-alias-button-primary-fill,#3a6ef5);height:2px;box-shadow:0 0 4px var(--dsw-alias-button-primary-fill,#3a6ef5);border-radius:1px;animation:.8s ease-in-out infinite i54Wjq_dropPulse;position:absolute;bottom:-1px;left:0;right:0}@keyframes i54Wjq_dropPulse{0%,to{opacity:.6}50%{opacity:1}}.i54Wjq_memoryPane{flex-direction:column;gap:6px;max-height:480px;padding:8px 10px 10px;display:flex;overflow:auto}.i54Wjq_memToolbar{justify-content:space-between;align-items:center;gap:8px;display:flex}.i54Wjq_memCount{opacity:.75;font-size:12px;font-weight:600}.i54Wjq_memList{flex-direction:column;gap:6px;display:flex}.i54Wjq_memSentinel{flex:none;height:1px}.i54Wjq_memFooter{flex-direction:column;align-items:center;gap:4px;padding:6px 0 2px;font-size:12px;display:flex}.i54Wjq_memRow{border:1px solid var(--dsw-border-weak,#80808040);background:color-mix(in srgb, var(--dsw-bg-secondary,#f5f5f5) 45%, transparent);content-visibility:auto;contain-intrinsic-size:auto 76px;border-radius:6px;flex-direction:column;gap:4px;padding:6px 8px;display:flex}.i54Wjq_memRowArchived{opacity:.55}.i54Wjq_memRowMain{flex-direction:column;gap:2px;display:flex}.i54Wjq_memTitle{word-break:break-word;align-items:flex-start;gap:6px;font-size:13px;line-height:1.35;display:flex}.i54Wjq_kindBadge{background:var(--dsw-accent-soft,#5078ff26);color:var(--dsw-accent,#4d6bfe);border-radius:4px;flex:none;padding:0 5px;font-size:11px;line-height:1.5}.i54Wjq_memMeta{flex-wrap:wrap;align-items:center;gap:4px;display:flex}.i54Wjq_badge{background:color-mix(in srgb, var(--dsw-fg,#222) 8%, transparent);border-radius:4px;padding:0 5px;font-size:11px;line-height:1.5}.i54Wjq_badgeDraft{color:#b26a00;background:#ffb40029}.i54Wjq_badgeArchived{opacity:.8}.i54Wjq_memBody{opacity:.8;word-break:break-word;font-size:12px}.i54Wjq_memActs{flex-wrap:wrap;gap:4px;display:flex}.i54Wjq_memToolbarActs{align-items:center;gap:6px;display:flex}.i54Wjq_memNew{border:1px solid var(--dsw-border-weak,#80808040);border-radius:6px;flex-direction:column;gap:6px;padding:8px;display:flex}.i54Wjq_memNewRow{align-items:center;gap:8px;display:flex}.i54Wjq_memLabel{opacity:.8;align-items:center;gap:6px;font-size:12px;display:inline-flex}.i54Wjq_memNew select,.i54Wjq_memNew textarea{box-sizing:border-box;width:100%}";
export const CMD_CSS = "._9r5h7a_row{max-width:100%;color:var(--dsw-alias-label-tertiary);white-space:nowrap;text-overflow:ellipsis;align-items:center;gap:6px;padding:2px 0;font-size:12px;line-height:20px;display:inline-flex;overflow:hidden}._9r5h7a_row[data-variant=ok]{color:var(--dsw-alias-label-secondary)}._9r5h7a_row[data-variant=error]{color:var(--dsw-alias-state-warn-label,#b7791f)}._9r5h7a_row[data-variant=running]{color:var(--dsw-alias-label-dimmed)}._9r5h7a_icon{color:var(--dsw-alias-label-tertiary);flex:none}";
export const SETTINGS_CSS = ".CSjuLW_card{box-sizing:border-box;border:.5px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l4,#00000029));border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-alias-bg-layer-3,#fff);transition:border-color .16s,background .16s}.CSjuLW_card:hover{border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}.CSjuLW_cardOpen{background:var(--dsw-alias-bg-layer-2,#f7f8fa);border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}.CSjuLW_header{-webkit-appearance:none;appearance:none;border-radius:inherit;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:12px;padding:14px 16px;display:flex}.CSjuLW_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:-2px}.CSjuLW_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.CSjuLW_name{color:var(--dsw-alias-label-primary,#1f2328);font-size:15px;font-weight:600;line-height:1.4}.CSjuLW_desc{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:13px;line-height:1.5}.CSjuLW_unsaved{color:var(--dsw-alias-label-secondary,#6b7280);background:var(--dsw-alias-bg-module-platform,#eef0f4);border-radius:9px;flex:none;padding:0 6px;font-size:11px;font-weight:600;line-height:17px}.CSjuLW_chevron{color:var(--dsw-alias-label-tertiary,#8b93a1);flex:none;transition:transform .16s;display:inline-flex}.CSjuLW_chevronOpen{transform:rotate(180deg)}.CSjuLW_body{border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);margin:0 16px;padding-bottom:8px}.CSjuLW_row{align-items:center;gap:12px;padding:12px 0;display:flex}.CSjuLW_row+.CSjuLW_row{border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb)}.CSjuLW_labelBox{flex-direction:column;flex:1;gap:3px;min-width:0;display:flex}.CSjuLW_label{color:var(--dsw-alias-label-primary,#1f2328);font-size:13px;line-height:20px}.CSjuLW_hint{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:12px;line-height:18px}.CSjuLW_control{flex:none;align-items:center;gap:6px;display:flex}.CSjuLW_number{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#d1d5db);background:var(--dsw-alias-bg-layer-3,#fff);width:84px;font:inherit;color:var(--dsw-alias-label-primary,#1f2328);text-align:right;border-radius:7px;padding:6px 8px;font-size:12px;line-height:18px}.CSjuLW_number:disabled{opacity:.5;cursor:default}.CSjuLW_number:focus{border-color:var(--dsw-alias-brand-primary,#4f6ef7);outline:2px solid color-mix(in srgb, var(--dsw-alias-brand-primary,#4f6ef7) 18%, transparent)}.CSjuLW_number[aria-invalid=true]{border-color:var(--dsw-alias-state-error-primary,#dc2626)}.CSjuLW_unit{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:12px;line-height:18px}.CSjuLW_actions{border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}.CSjuLW_failed{min-width:0;color:var(--dsw-alias-label-error,#dc2626);flex:1;margin:0;font-size:12px;line-height:18px}.CSjuLW_notice{color:var(--dsw-alias-label-tertiary,#8b93a1);margin:0;padding:12px 0;font-size:12px;line-height:18px}";

const TAG_PREFIX = "@local/dsh-turn-cost/memory";

/** 注入一份 CSS（幂等：同 id 复用同一个 <style>，更新时只换 textContent）。 */
function injectStyle(id, css, plugin) {
  if (typeof document === "undefined") return;
  const selector = "style[data-plugin-css=" + JSON.stringify(id) + "]";
  const existing = document.querySelector(selector);
  if (existing) { existing.textContent = css; return; }
  const tag = document.createElement("style");
  tag.dataset.plugin = plugin;
  tag.dataset.pluginCss = id;
  tag.textContent = css;
  document.head.appendChild(tag);
}

export function ensureMemoryStyles() {
  injectStyle(TAG_PREFIX + "/TaskPanel.module.css", PANEL_CSS, "@local/dsh-turn-cost");
  injectStyle(TAG_PREFIX + "/TaskCommandNode.module.css", CMD_CSS, "@local/dsh-turn-cost");
  injectStyle(TAG_PREFIX + "/SettingsCard.module.css", SETTINGS_CSS, "@local/dsh-turn-cost");
}

/** TaskPanel.module.css 的 hashed 类名映射（88 项）。 */
export const css = {
  "badge": "i54Wjq_badge",
  "badgeArchived": "i54Wjq_badgeArchived",
  "badgeDraft": "i54Wjq_badgeDraft",
  "boundBadge": "i54Wjq_boundBadge",
  "boundaryFallback": "i54Wjq_boundaryFallback",
  "card": "i54Wjq_card",
  "cardBody": "i54Wjq_cardBody",
  "cardBound": "i54Wjq_cardBound",
  "cardFooter": "i54Wjq_cardFooter",
  "cardHead": "i54Wjq_cardHead",
  "cardMeta": "i54Wjq_cardMeta",
  "cardTitle": "i54Wjq_cardTitle",
  "cardTitleEditable": "i54Wjq_cardTitleEditable",
  "cardTitleRow": "i54Wjq_cardTitleRow",
  "chevron": "i54Wjq_chevron",
  "counts": "i54Wjq_counts",
  "dragGhost": "i54Wjq_dragGhost",
  "dragGhostCard": "i54Wjq_dragGhostCard",
  "dragGhostClose": "i54Wjq_dragGhostClose",
  "dragGhostContent": "i54Wjq_dragGhostContent",
  "dragHandle": "i54Wjq_dragHandle",
  "dropPulse": "i54Wjq_dropPulse",
  "dropTargetAfter": "i54Wjq_dropTargetAfter",
  "dropTargetBefore": "i54Wjq_dropTargetBefore",
  "editorArea": "i54Wjq_editorArea",
  "emptyDesc": "i54Wjq_emptyDesc",
  "emptyState": "i54Wjq_emptyState",
  "emptyTitle": "i54Wjq_emptyTitle",
  "fileDot": "i54Wjq_fileDot",
  "fileLine": "i54Wjq_fileLine",
  "filePath": "i54Wjq_filePath",
  "fileRow": "i54Wjq_fileRow",
  "filesList": "i54Wjq_filesList",
  "handleGrip": "i54Wjq_handleGrip",
  "header": "i54Wjq_header",
  "headerIcon": "i54Wjq_headerIcon",
  "headerIconBtn": "i54Wjq_headerIconBtn",
  "headerLeft": "i54Wjq_headerLeft",
  "headerRight": "i54Wjq_headerRight",
  "headerTitle": "i54Wjq_headerTitle",
  "hintsOff": "i54Wjq_hintsOff",
  "kindBadge": "i54Wjq_kindBadge",
  "memActs": "i54Wjq_memActs",
  "memBody": "i54Wjq_memBody",
  "memCount": "i54Wjq_memCount",
  "memFooter": "i54Wjq_memFooter",
  "memLabel": "i54Wjq_memLabel",
  "memList": "i54Wjq_memList",
  "memMeta": "i54Wjq_memMeta",
  "memNew": "i54Wjq_memNew",
  "memNewRow": "i54Wjq_memNewRow",
  "memRow": "i54Wjq_memRow",
  "memRowArchived": "i54Wjq_memRowArchived",
  "memRowMain": "i54Wjq_memRowMain",
  "memSentinel": "i54Wjq_memSentinel",
  "memTitle": "i54Wjq_memTitle",
  "memToolbar": "i54Wjq_memToolbar",
  "memToolbarActs": "i54Wjq_memToolbarActs",
  "memoryPane": "i54Wjq_memoryPane",
  "miniBar": "i54Wjq_miniBar",
  "miniChevron": "i54Wjq_miniChevron",
  "miniIcon": "i54Wjq_miniIcon",
  "miniText": "i54Wjq_miniText",
  "muted": "i54Wjq_muted",
  "notice": "i54Wjq_notice",
  "panel": "i54Wjq_panel",
  "panelIn": "i54Wjq_panelIn",
  "progressText": "i54Wjq_progressText",
  "section": "i54Wjq_section",
  "sectionCount": "i54Wjq_sectionCount",
  "sectionLabel": "i54Wjq_sectionLabel",
  "stepContent": "i54Wjq_stepContent",
  "stepContentDone": "i54Wjq_stepContentDone",
  "stepContentRun": "i54Wjq_stepContentRun",
  "stepDone": "i54Wjq_stepDone",
  "stepDragging": "i54Wjq_stepDragging",
  "stepEditable": "i54Wjq_stepEditable",
  "stepInput": "i54Wjq_stepInput",
  "stepPending": "i54Wjq_stepPending",
  "stepRow": "i54Wjq_stepRow",
  "stepRun": "i54Wjq_stepRun",
  "stepToggle": "i54Wjq_stepToggle",
  "stepsList": "i54Wjq_stepsList",
  "syncHint": "i54Wjq_syncHint",
  "taskList": "i54Wjq_taskList",
  "track": "i54Wjq_track",
  "trackFill": "i54Wjq_trackFill",
  "updated": "i54Wjq_updated"
};
/** TaskCommandNode.module.css 的 hashed 类名映射。 */
export const cmdCss = {
  "icon": "_9r5h7a_icon",
  "row": "_9r5h7a_row"
};
/** SettingsCard.module.css 的 hashed 类名映射（20 项）。 */
export const settingsCss = {
  "actions": "CSjuLW_actions",
  "body": "CSjuLW_body",
  "card": "CSjuLW_card",
  "cardOpen": "CSjuLW_cardOpen",
  "chevron": "CSjuLW_chevron",
  "chevronOpen": "CSjuLW_chevronOpen",
  "control": "CSjuLW_control",
  "desc": "CSjuLW_desc",
  "failed": "CSjuLW_failed",
  "headText": "CSjuLW_headText",
  "header": "CSjuLW_header",
  "hint": "CSjuLW_hint",
  "label": "CSjuLW_label",
  "labelBox": "CSjuLW_labelBox",
  "name": "CSjuLW_name",
  "notice": "CSjuLW_notice",
  "number": "CSjuLW_number",
  "row": "CSjuLW_row",
  "unit": "CSjuLW_unit",
  "unsaved": "CSjuLW_unsaved"
};
