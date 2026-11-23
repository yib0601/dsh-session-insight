/**
 * 宿主图标兼容层（dsh 0.1.5 ↔ 0.1.7+）。
 *
 * 命名契约变过一次：
 *   - dsh 0.1.5（含 0.1.5-rc.x）：尺寸写进名字，如 `IconFolderOpenOutline16`；
 *   - dsh 0.1.7+：去掉尺寸后缀、改为字重后缀，如 `IconFolderOpenOutlineRegular` /
 *     `IconFolderOpenOutlineMedium`，尺寸改由 `size` prop 传入。
 * ui-primitives 是 web shell 的冻结 seed 模块（不是插件行），插件无法固定它，
 * 同一份产物会拿到宿主那一版的导出；直接按某一版的名字解构会在另一版上得到
 * `undefined`，React 渲染时抛 "Element type is invalid" 把面板整个打崩。
 *
 * 因此这里按旧名导出同名组件，运行时在两个名字里取存在的那个，并把旧名里的
 * 尺寸作为默认 `size`（两版的图标都接受 `size` prop，0.1.5 的默认值正是旧名后缀）。
 * 两版都没有该名字时降级为空组件并告警，而不是让面板崩溃。
 */
import { createElement } from 'react';
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives';
const table = primitives;
function resolveIcon(names) {
    for (const name of names) {
        const candidate = table[name];
        if (typeof candidate === 'function' || (typeof candidate === 'object' && candidate !== null)) {
            return candidate;
        }
    }
    return null;
}
function icon(legacyName, currentName, defaultSize) {
    const impl = resolveIcon([legacyName, currentName]);
    if (impl === null) {
        console.warn(`[dsh-project-memory] host ui-primitives exports neither ${legacyName} nor ${currentName}; that icon renders nothing`);
        return function MissingIcon() {
            return null;
        };
    }
    function CompatIcon({ size = defaultSize, ...rest }) {
        return createElement(impl, { size, ...rest });
    }
    CompatIcon.displayName = legacyName;
    return CompatIcon;
}
export const IconChevronDownOutline14 = icon('IconChevronDownOutline14', 'IconChevronDownOutlineRegular', 14);
export const IconChevronUpOutline14 = icon('IconChevronUpOutline14', 'IconChevronUpOutlineRegular', 14);
export const IconQuestionOutline14 = icon('IconQuestionOutline14', 'IconQuestionOutlineRegular', 14);
export const IconCloseOutline16 = icon('IconCloseOutline16', 'IconCloseOutlineRegular', 16);
export const IconFolderOpenOutline16 = icon('IconFolderOpenOutline16', 'IconFolderOpenOutlineRegular', 16);
export const IconCheckOutline16 = icon('IconCheckOutline16', 'IconCheckOutlineRegular', 16);
export const IconPlayOutline16 = icon('IconPlayOutline16', 'IconPlayOutlineRegular', 16);
// `/` 菜单行图标。旧名的尺寸后缀两版并不一致（有的是 14 有的是 16），
// 所以这里的默认 size 只影响"宿主两版都没有该名字"的降级路径——正常路径由宿主自己决定。
export const IconChecklistOutline16 = icon('IconChecklistOutline14', 'IconChecklistOutlineRegular', 14);
export const IconLightOutline16 = icon('IconLightOutline16', 'IconLightOutlineRegular', 16);
export const IconGlobeOutline16 = icon('IconGlobeOutline14', 'IconGlobeOutlineRegular', 14);
