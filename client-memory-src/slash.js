import { translatorFor } from './i18n.js';
import { IconChecklistOutline16, IconGlobeOutline16, IconLightOutline16 } from './icons.js';
/** 源的稳定标识：同一 trigger 内唯一，重复注册会抛错。 */
export const SLASH_SOURCE_NAME = 'project-memory';
/**
 * 组的排序权重（越小越靠前，未设时默认 0）。宿主内置源都取默认 0，所以 1 = 排在
 * 「指令 / 技能 / 子智能体」之后；其他插件若也留默认 0 会排在我们前面，1 是最接近的折中。
 */
export const SLASH_SOURCE_ORDER = 1;
/** 菜单三行。顺序即渲染顺序；标题复用面板已有的 view.* 文案，保证与面板视图名一致。 */
const ROWS = [
    {
        labelKey: 'view.task',
        descriptionKey: 'slash.tasks-desc',
        icon: IconChecklistOutline16,
        match: ['tasks', 'task'],
        view: 'task',
    },
    {
        labelKey: 'view.project',
        descriptionKey: 'slash.project-desc',
        icon: IconLightOutline16,
        match: ['memory', 'project', 'insight'],
        view: 'project',
    },
    {
        labelKey: 'view.global',
        descriptionKey: 'slash.global-desc',
        icon: IconGlobeOutline16,
        match: ['memory', 'global', 'insight'],
        view: 'global',
    },
];
/**
 * 一轮候选：把三行装配成菜单行，再按查询与位置过滤。
 * 三行都不接参数（动作全在面板卡片里），所以位置过滤只做一件事：非 leading 位置不弹这一整组
 * （行内出现的 `/` 多半是路径）。
 * @param t - 翻译函数。
 * @param req - 宿主给的候选请求（query / position）。
 * @returns 菜单行；永不抛出。
 */
export function buildSlashCandidates(t, req) {
    if (req?.position !== undefined && req.position !== 'leading')
        return [];
    const query = typeof req?.query === 'string' ? req.query.trim().toLowerCase() : '';
    const rows = ROWS.map((row) => {
        const title = t(row.labelKey);
        return {
            name: title,
            // label 与 name 相同 → MenuView 不渲染尾随别名（这些是视图入口，不是命令名）
            label: title,
            description: t(row.descriptionKey),
            icon: row.icon,
            // 每一行都带 section → MenuView 不渲染组标题行，只渲染这个标题。
            section: t('slash.group'),
            // **不带 line**：这三行不是命令，是打开面板某一页；动作在 onPick 里按 name 查表得到。
            terms: [title, ...row.match].map((term) => term.toLowerCase()),
        };
    });
    return rows
        .filter((row) => query === '' || row.terms.some((term) => term.startsWith(query)))
        .map(({ terms: _terms, ...candidate }) => candidate);
}
/**
 * 把触发 token 从草稿里删掉（span 做 CAS：草稿被改过就拒绝，什么都不动）。
 * 与宿主 command 源消费菜单点击是同一条契约事件。
 * @returns true 表示确实消费掉了。
 */
function consumeSpan(deps, pick) {
    try {
        const scope = deps.sessions?.scope?.(pick?.session?.sessionId);
        if (!scope || typeof scope.bail !== 'function')
            return false;
        return scope.bail(scope, 'slash/input-consume-token', {
            guard: { kind: 'span', span: pick.span },
        }) === true;
    }
    catch (err) {
        console.warn('[dsh-project-memory] slash token consume failed:', err);
        return false;
    }
}
/**
 * 一次菜单点击：消费掉触发 token 后**直接打开面板的对应页** —— 这三行是「打开某个视图」不是
 * 「执行命令」，`closed`/`view` 是浏览器侧状态；不返回 claim 是因为没有参数要填，消费失败仍切页。
 * @param t - 翻译函数（按当前语言把候选 name 映射回 ROWS）。
 * @param deps - 会话服务与 UI store 动作。
 * @param pick - 宿主给的点击载荷。
 * @returns PickOutcome；拿不到可用形状时返回 undefined（菜单照常关闭，草稿不动）。
 */
export function dispatchSlashPick(t, deps, pick) {
    const title = pick?.candidate?.name;
    if (typeof title !== 'string' || title === '')
        return undefined;
    const row = ROWS.find((candidate) => t(candidate.labelKey) === title);
    if (row === undefined)
        return undefined;
    consumeSpan(deps, pick);
    try {
        deps.openView(row.view);
    }
    catch (err) {
        console.warn(`[dsh-project-memory] open view ${row.view} failed:`, err);
    }
    return 'handled';
}
/**
 * 造出注册给 `ctx.inputTriggers.registerSource` 的源对象。
 * @param ctx - client 根上下文（只读 locale）。
 * @param deps - 会话服务与命令执行通道。
 * @returns 触发器源；只依赖宿主的公开契约字段。
 */
export function createSlashSource(ctx, deps) {
    const t = translatorFor(ctx);
    return {
        trigger: '/',
        name: SLASH_SOURCE_NAME,
        order: SLASH_SOURCE_ORDER,
        // 组标题不渲染：行上都有 section，MenuView 会用 section 标题取代它。
        showGroupTitle: false,
        candidates: async (_session, req) => buildSlashCandidates(t, req),
        onPick: (pick) => dispatchSlashPick(t, deps, pick),
    };
}
