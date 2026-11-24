/**
 * dsh-session-insight — context-insight surfaces (lazy sibling chunk).
 *
 * Supersedes dsh-context: the same surfaces, rebuilt on DSH's own built-in
 * projections plus our official-price cost engine — a `/context` command with a
 * centered modal, a session Context tab, a right-sidebar Context tab, a
 * cross-session dashboard opened from the sidebar foot, and its own settings
 * page for the cost preferences. Internal ids stay `tc*` so they never collide
 * with a co-installed plugin of similar name.
 *
 * Visual system: every surface uses the host's own semantic tokens (`--dsw-*`):
 * label-primary/secondary/tertiary for type, card-fill / settings-card-fill for
 * surfaces, chart-* and state-* for data colour. Nothing here hardcodes a hex
 * colour, so light and dark themes both read correctly.
 *
 * Sections: §1 locale · §2 stores/helpers · §3 primitives · §4 cards · §5 views
 * · §6 composition.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-session-insight',
  chunk: 'client.context.js',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;

    const COMMAND_LINE = '/context';
    const NS = 'tcContext';
    const TAB_ID = 'tc-context';
    const SIDEBAR_KIND = 'tc-context';
    /** Rows / cards rendered per page; "show more" grows by one page. */
    const PAGE_SIZE = 60;

    // ── §1 locale ────────────────────────────────────────────────────────────
    const LOCALE = {
      zh: {
        tab: '上下文', entry: '用量总览', dashboard: '用量总览',
        cmdLabel: '上下文', cmdDesc: '查看当前上下文构成与费用', cmdSection: '上下文',
        close: '关闭', loading: '读取中…',
        kpiSessions: '会话', kpiSessionsSub: '共 {total} 个会话', kpiTokens: '计费 tokens', kpiCost: '估算费用', kpiCache: '缓存命中',
        turns: '轮次', steps: '步骤', requests: '请求',
        currentTitle: '当前上下文构成', used: '已用', free: '空闲', window: '上下文窗口',
        system: '系统提示词', tools: '工具定义', messages: '消息与工具结果',
        tokenTitle: 'Token 统计', input: '输入（未缓存）', cacheRead: '缓存命中', cacheWrite: '缓存写入', output: '输出',
        tokenShare: '占比', tokenCost: '金额', tokenTotal: '合计',
        costTitle: '费用（官方刊例价）', costTip: '按各模型官方刊例价估算，非实际扣费', unknown: '价格未知',
        costByBucket: '费用构成', peakShort: '高峰', offPeakShort: '空闲', mixedTierShort: '高峰+空闲',
        costSecondary: '另一币种',
        modelTitle: '按模型花费', modelEmpty: '暂无请求记录', modelShare: '花费占比', modelRequests: '请求',
        trendTitle: '上下文趋势', trendEmpty: '暂无请求记录',
        trendTokens: 'Tokens', trendCost: '费用', trendCache: '缓存命中', trendPeak: '峰值', trendNow: '最新',
        eventsTitle: '上下文事件', eventsEmpty: '暂无上下文变化事件',
        evCompact: '压缩', evPrune: '剪枝', evInject: '注入', evSwitch: '模型切换', evMode: '模式切换',
        activityTitle: '近 7 日用量', noSessions: '暂无会话数据', openSession: '打开会话',
        modalTitle: '当前上下文', modalHint: 'Esc 或点击遮罩关闭',
        estimateNote: '构成数字来自 DSH 内置 contextBreakdown 估算（约 4 字符 ≈ 1 token），不等于供应商上报用量。',
        timingTitle: '时序统计', timingLlm: '模型耗时', timingTool: '工具耗时', timingTtft: '首字延迟',
        timingTps: '解码速度', timingDecode: '解码耗时',
        filesTitle: '文件活动', filesEmpty: '本会话暂无文件读写',
        statsTitle: '上下文统计', userMsgs: '用户输入', answers: '助手消息', skillLoads: '技能加载',
        toolCalls: '工具调用',
        statsTools: '工具调用分布', statsCommands: '命令程序分布',
        toolsEmpty: '暂无工具调用',
        cmdTitle: '命令执行', cmdEmpty: '本会话没有执行命令', cmdSearch: '筛选程序或命令',
        cmdPrograms: '程序分布', cmdStatus: '状态', cmdOk: '成功', cmdError: '失败', cmdRunning: '进行中',
        cmdAll: '全部', cmdNoMatch: '没有匹配的命令',
        filesFilter: '搜索路径', filesAll: '全部', filesRead: '读取', filesWrite: '写入', filesSearch: '搜索',
        filesNoMatch: '没有匹配的文件', filesOps: '操作日志', filesDelta: '行数变化',
        eventsAll: '全部', donutTotal: '合计',
        rangeToday: '今天', range7: '近 7 天', range30: '近 30 天',
        contentTitle: '请求内容', contentUser: '用户', contentAnswer: '回答', contentReasoning: '思考',
        contentCall: '调用', contentResult: '结果', contentMore: '展开', contentLess: '收起',
        tallyTools: '工具调用排行', tallyPrograms: '命令程序排行', tallySkills: '技能加载',
        tallyEmpty: '所选时间范围内没有记录', tallyPending: '统计字段要等 DSH 重启后由 Host 折叠出来',
        surfaceTitle: '上下文明细', surfacePending: '明细字段要等 DSH 重启后由 Host 折叠出来',
        surfaceSystem: '系统提示词', surfaceSystemEmpty: '本会话没有系统提示词',
        surfaceTools: '工具定义', surfaceToolsEmpty: '最新请求没有工具定义',
        surfaceKinds: '消息构成', surfaceTop: '占用最大', surfaceTopEmpty: '暂无消息',
        surfaceKindUser: '用户输入', surfaceKindAssistant: '助手回答', surfaceKindReasoning: '助手思考',
        surfaceKindCall: '工具参数', surfaceKindResult: '工具结果', surfaceKindDeveloper: '开发者消息',
        surfaceKindOther: '其他', surfaceSim: '按分区估算（约 4 字符 ≈ 1 token），分区合计不含角色开销',
        surfaceApprox: '压缩后部分条目已出保留窗口，构成拆分近似', surfaceSearch: '搜索名称或内容（含正文）',
        surfaceTapHint: '点一行展开正文', surfaceBodyEmpty: '这一条没有留下正文（已出保留窗口）',
        surfaceBodyTruncated: '正文已截断',
        surfaceSortTokens: '按大小', surfaceSortName: '按名称',
        surfaceCompose: '整个窗口', surfaceOfContext: '占上下文', surfaceOfBucket: '占本页签',
        surfaceUnitChars: '字符', surfaceUnitSections: '个分区', surfaceUnitTools: '条工具',
        surfaceUnitItems: '条消息', surfaceColName: '条目', surfaceColTokens: 'tokens',
        surfaceColShare: '占比',
        fleetCost: '家族费用', fleetSelf: '当前', fleetParent: '父级', fleetChild: '子级',
        fleetTaskNote: '家族成员来自会话树（父 / 子 / 孙），费用按各自会话日志的官方价目表估算；任务板数据不在本插件的读模型内。',
        agentsTitle: 'Agent 网络', agentsEmpty: '本会话暂无子智能体',
        agentsRunning: '运行中', agentsIdle: '空闲',
        browserTitle: '上下文浏览器', browserEmpty: '暂无请求记录',
        browserTurn: '轮/步', browserModel: '模型', browserTokens: 'Tokens', browserCost: '费用',
        browserProvider: '提供方', browserCache: '缓存命中', browserTier: '计费时段',
        browserPeak: '高峰', browserOffPeak: '空闲（半价）', browserTime: '时间', browserExpand: '展开请求明细',
        browserFilter: '筛选模型或轮次', browserSortTime: '按时间', browserSortCost: '按费用', browserSortTokens: '按 Tokens',
        browserCopy: '复制 CSV', browserCopied: '已复制', browserCopyFail: '复制失败', browserNoMatch: '没有匹配的请求', browserShown: '显示 {shown} / {total}',
        browserMore: '显示更多（还有 {remaining} 条）',
        heatTitle: '活跃热力图', heatLess: '少', heatMore: '多', heatRange: '近 12 周',
        dailyTitle: '近 7 日费用',
        boardTitle: '跨会话模型花费', boardEmpty: '暂无模型用量',
        sessionSearch: '搜索会话', sessionSortCost: '按费用', sessionSortTokens: '按 Tokens', sessionSortRecent: '按最近',
        sessionsTitle: '会话',
        nav: '费用', sectionIntro: '这里的偏好只作用于本浏览器：逐轮徽章、底部累计、金额币种、DeepSeek 计费时段与会话预算。',
        groupDisplay: '显示', groupPricing: '计价', groupBudget: '预算',
        prefBadge: '显示每轮费用徽章', prefBadgeDesc: '在每条回复底部显示该轮消耗金额',
        prefPill: '显示底部会话累计', prefPillDesc: '在输入框下方状态栏显示本会话累计消费',
        prefTier: 'DeepSeek 计费时段', prefTierDesc: 'DeepSeek 官方价分高峰与空闲两档，空闲为高峰半价',
        prefTierAuto: '自动（按北京时间）', prefTierPeak: '按高峰', prefTierOffPeak: '按空闲',
        prefCurrency: '金额币种', prefCurrencyDesc: 'DeepSeek 用官方人民币价；只发布美元价的厂商按汇率折算',
        prefCurrencyCny: '人民币', prefCurrencyUsd: '美元',
        prefBudget: '会话预算', prefBudgetDesc: '设成 0 表示不设上限；设置后底部累计显示「花费 / 预算」，超出转红',
        prefBudgetClear: '清除',
        sessionBudgetRemain: '剩余额度',
        sessionTitle: '本会话上下文',
        prefResetTitle: '重置偏好', prefResetDesc: '把上面各项恢复为默认值。',
        prefReset: '恢复默认',
        modelsNav: '模型目录',
        modelsTitle: '模型目录',
        modelsIntro: '这一页来自网关的 /v1/models：打开时先显示上一次的清单（缓存），随后在后台静默核对，只有真的变了才把新清单写回配置——所以你永远不用等网关。',
        modelsCount: '{n} 个模型',
        modelsSyncedJustNow: '刚刚同步',
        modelsSyncedAgo: '{age}前同步',
        modelsNeverSynced: '尚未同步，正在后台核对',
        modelsAgeMinutes: '{n} 分钟',
        modelsAgeHours: '{n} 小时',
        modelsAgeDays: '{n} 天',
        modelsRefreshing: '后台更新中…',
        modelsFailed: '更新失败：{reason}（仍显示上次的清单）',
        modelsSyncNow: '立即同步',
        modelsSyncBusy: '同步中…',
        modelsAdded: '新增',
        modelsEmpty: '还没有同步到模型清单；网关可达时下一次核对就会填上。',
        modelsNoRoute: '当前 profile 里没有可同步的网关路由',
        modelsCapImage: '图片',
        modelsReasoning: '思考',
        modelsWindow: '窗口',
        modelsOutput: '输出',
        modelsChip: '模型 {n} · {age}',
        modelsChipBusy: '模型 · 更新中',
        modelsChipFailed: '模型 · 读取失败',
        modelsChipTitle: '模型目录：点击立即向网关核对一次',
        modelsHint: '「新增」表示这次后台核对刚从网关带回来的模型。显示名由平台 / 计费 / 上下文窗口生成，能力取自网关声明；网关没声明的能力不会被补上。',
        quotaTitle: '订阅额度', quotaTileOf: '{source} 额度',
        quotaSourceDeepseek: 'DeepSeek', quotaSourceOpencode: 'OpenCode Go',
        quotaSourceWorkbuddy: 'WorkBuddy',
        quotaCreditsLine: '积分剩 {remain} / {total}',
        quotaWinRolling: '5h', quotaWinWeekly: '周', quotaWinMonthly: '月',
        quotaWinRollingLong: '5 小时', quotaWinWeeklyLong: '本周', quotaWinMonthlyLong: '本月',
        quotaWindowLine: '{label}：已用 {percent}%，{reset}',
        quotaLeftSuffix: '（{left}）',
        quotaWindowResets: '{time} 重置', quotaWindowResetUnknown: '重置时间未知',
        quotaCycleLine: '订阅周期 {time} 结束（{left}）',
        quotaRemainDays: '剩 {n} 天', quotaRemainHours: '剩 {n} 小时', quotaRemainMinutes: '剩 {n} 分',
        quotaDaysShort: '{n}天', quotaHoursShort: '{n}时', quotaExpiredShort: '过期',
        quotaExpired: '已到期', quotaCycleHint: '天数取最长额度窗口的重置时间：那个窗口重置即订阅周期结束',
        quotaTotal: '当前余额 {amount}', quotaSplit: '充值 {toppedUp} · 赠送 {granted}',
        quotaUnavailable: '余额不足，无法发起新任务',
        quotaUpdated: '{time} 更新', quotaLoading: '读取中…', quotaFailed: '额度不可用',
        quotaUnconfigured: '未配置密钥', quotaEmpty: '零余额', quotaRefresh: '点按刷新额度',
        quotaStale: '显示的是上次成功读数，正在后台重试', quotaCached: '缓存读数',
        quotaNoSource: '此供应商无额度可查',
        quotaNoSourceHint: '当前路由是自建网关：它按上游密钥分别计费，网关本身不设配额，所以没有可显示的额度或到期时间',
      },
      en: {
        tab: 'Context', entry: 'Usage overview', dashboard: 'Usage overview',
        cmdLabel: 'Context', cmdDesc: 'Inspect current context composition and cost', cmdSection: 'Context',
        close: 'Close', loading: 'Loading…',
        kpiSessions: 'Sessions', kpiSessionsSub: '{total} sessions in total', kpiTokens: 'Billed tokens', kpiCost: 'Estimated cost', kpiCache: 'Cache hit',
        turns: 'Turns', steps: 'Steps', requests: 'Requests',
        currentTitle: 'Current context composition', used: 'Used', free: 'Free', window: 'Context window',
        system: 'System prompt', tools: 'Tool schemas', messages: 'Messages & tool results',
        tokenTitle: 'Token stats', input: 'Input (uncached)', cacheRead: 'Cache hit', cacheWrite: 'Cache write', output: 'Output',
        tokenShare: 'share', tokenCost: 'cost', tokenTotal: 'Total',
        costTitle: 'Cost (official list prices)', costTip: 'Estimated at official list rates, not actual billing', unknown: 'Price unknown',
        costByBucket: 'Cost by bucket', peakShort: 'Peak', offPeakShort: 'Off-peak', mixedTierShort: 'Peak + off-peak',
        costSecondary: 'Other currency',
        modelTitle: 'Cost by model', modelEmpty: 'No requests yet', modelShare: 'share of cost', modelRequests: 'requests',
        trendTitle: 'Context trend', trendEmpty: 'No requests yet',
        trendTokens: 'Tokens', trendCost: 'Cost', trendCache: 'Cache hit', trendPeak: 'peak', trendNow: 'latest',
        eventsTitle: 'Context events', eventsEmpty: 'No context events yet',
        evCompact: 'Compact', evPrune: 'Prune', evInject: 'Inject', evSwitch: 'Model switch', evMode: 'Mode',
        activityTitle: 'Last 7 days', noSessions: 'No session data', openSession: 'Open session',
        modalTitle: 'Current context', modalHint: 'Esc or click the backdrop to close',
        estimateNote: 'Composition figures use DSH built-in contextBreakdown heuristic (~4 chars ≈ 1 token), not provider-reported usage.',
        timingTitle: 'Timing stats', timingLlm: 'Model time', timingTool: 'Tool time', timingTtft: 'First token',
        timingTps: 'Decode speed', timingDecode: 'Decode time',
        filesTitle: 'File activity', filesEmpty: 'No file reads or writes yet',
        statsTitle: 'Context stats', userMsgs: 'User input', answers: 'Assistant msgs', skillLoads: 'Skill loads',
        toolCalls: 'Tool calls',
        statsTools: 'Tool calls', statsCommands: 'Commands by program',
        toolsEmpty: 'No tool calls yet',
        cmdTitle: 'Command executions', cmdEmpty: 'No commands ran in this session', cmdSearch: 'Filter by program or command',
        cmdPrograms: 'By program', cmdStatus: 'Status', cmdOk: 'OK', cmdError: 'Failed', cmdRunning: 'Running',
        cmdAll: 'All', cmdNoMatch: 'No matching commands',
        filesFilter: 'Filter by path', filesAll: 'All', filesRead: 'Read', filesWrite: 'Written', filesSearch: 'Searched',
        filesNoMatch: 'No matching files', filesOps: 'Operation log', filesDelta: 'Line change',
        eventsAll: 'All', donutTotal: 'total',
        rangeToday: 'Today', range7: 'Last 7 days', range30: 'Last 30 days',
        contentTitle: 'Request content', contentUser: 'User', contentAnswer: 'Answer', contentReasoning: 'Reasoning',
        contentCall: 'Call', contentResult: 'Result', contentMore: 'More', contentLess: 'Less',
        tallyTools: 'Tool calls', tallyPrograms: 'Commands by program', tallySkills: 'Skill loads',
        tallyEmpty: 'Nothing in this range', tallyPending: 'Tallies need a DSH restart to be folded by the Host',
        surfaceTitle: 'Context items', surfacePending: 'Item rows need a DSH restart to be folded by the Host',
        surfaceSystem: 'System prompt', surfaceSystemEmpty: 'This session has no system prompt',
        surfaceTools: 'Tool definitions', surfaceToolsEmpty: 'The latest request declared no tools',
        surfaceKinds: 'Message composition', surfaceTop: 'Largest', surfaceTopEmpty: 'No messages yet',
        surfaceKindUser: 'User input', surfaceKindAssistant: 'Assistant text', surfaceKindReasoning: 'Reasoning',
        surfaceKindCall: 'Tool arguments', surfaceKindResult: 'Tool results', surfaceKindDeveloper: 'Developer message',
        surfaceKindOther: 'Other', surfaceSim: 'Section prices use the heuristic (~4 chars ≈ 1 token) without role framing',
        surfaceApprox: 'Compaction shadowed items beyond the retained window; the split is approximate',
        surfaceSearch: 'Filter by name, description or body',
        surfaceTapHint: 'Tap a row to read its text', surfaceBodyEmpty: 'No body retained for this item',
        surfaceBodyTruncated: 'body truncated', surfaceSortTokens: 'By size', surfaceSortName: 'By name',
        surfaceCompose: 'Whole window', surfaceOfContext: 'of context', surfaceOfBucket: 'of this tab',
        surfaceUnitChars: 'chars', surfaceUnitSections: 'sections', surfaceUnitTools: 'tools',
        surfaceUnitItems: 'items', surfaceColName: 'Item', surfaceColTokens: 'tokens',
        surfaceColShare: 'share',
        fleetCost: 'Family cost', fleetSelf: 'This agent', fleetParent: 'Parent', fleetChild: 'Child',
        fleetTaskNote: 'Members come from the session tree (parent / self / children / grandchildren) and each cost is estimated from that session\'s own log at official list prices; task-board data is outside this plugin\'s read model.',
        agentsTitle: 'Agent network', agentsEmpty: 'No sub-agent sessions',
        agentsRunning: 'running', agentsIdle: 'idle',
        browserTitle: 'Context browser', browserEmpty: 'No requests yet',
        browserTurn: 'Turn/step', browserModel: 'Model', browserTokens: 'Tokens', browserCost: 'Cost',
        browserProvider: 'Provider', browserCache: 'Cache hit', browserTier: 'Rate tier',
        browserPeak: 'Peak', browserOffPeak: 'Off-peak (half)', browserTime: 'Time', browserExpand: 'Expand request details',
        browserFilter: 'Filter by model or turn', browserSortTime: 'Time', browserSortCost: 'Cost', browserSortTokens: 'Tokens',
        browserCopy: 'Copy CSV', browserCopied: 'Copied', browserCopyFail: 'Copy failed', browserNoMatch: 'No matching requests', browserShown: '{shown} of {total}',
        browserMore: 'Show more ({remaining} left)',
        heatTitle: 'Activity heatmap', heatLess: 'less', heatMore: 'more', heatRange: 'last 12 weeks',
        dailyTitle: 'Cost per day (7d)',
        boardTitle: 'Cost by model (all sessions)', boardEmpty: 'No model usage yet',
        sessionSearch: 'Search sessions', sessionSortCost: 'Cost', sessionSortTokens: 'Tokens', sessionSortRecent: 'Recent',
        sessionsTitle: 'Sessions',
        nav: 'Cost', sectionIntro: 'These preferences apply to this browser only: per-turn badges, the session total, display currency, DeepSeek billing tiers and the session budget.',
        groupDisplay: 'Display', groupPricing: 'Pricing', groupBudget: 'Budget',
        prefBadge: 'Show the per-turn cost badge', prefBadgeDesc: 'Show the cost of each turn under its last message',
        prefPill: 'Show the session total', prefPillDesc: 'Show the accumulated session cost in the composer status bar',
        prefTier: 'DeepSeek rate tier', prefTierDesc: 'DeepSeek list price has peak and off-peak tiers; off-peak is half price',
        prefTierAuto: 'Automatic (Beijing time)', prefTierPeak: 'Peak only', prefTierOffPeak: 'Off-peak only',
        prefCurrency: 'Currency', prefCurrencyDesc: 'DeepSeek uses its official CNY price; USD-only vendors are converted at the configured rate',
        prefCurrencyCny: 'CNY', prefCurrencyUsd: 'USD',
        prefBudget: 'Session budget', prefBudgetDesc: 'Zero means no cap; with a cap the session total reads “spent / cap” and turns red past it',
        prefBudgetClear: 'Clear',
        sessionBudgetRemain: 'Remaining',
        sessionTitle: 'Session context',
        prefResetTitle: 'Reset preferences', prefResetDesc: 'Restore every setting above to its default.',
        prefReset: 'Reset to defaults',
        modelsNav: 'Model catalog',
        modelsTitle: 'Model catalog',
        modelsIntro: 'This page comes from the gateway\'s /v1/models: it paints the last list first (cache) and then revalidates in the background, writing the new list back to the configuration only when it actually changed — you never wait for the gateway.',
        modelsCount: '{n} models',
        modelsSyncedJustNow: 'synced just now',
        modelsSyncedAgo: 'synced {age} ago',
        modelsNeverSynced: 'not synced yet; checking in the background',
        modelsAgeMinutes: '{n} min',
        modelsAgeHours: '{n} h',
        modelsAgeDays: '{n} d',
        modelsRefreshing: 'Updating in the background…',
        modelsFailed: 'Update failed: {reason} (still showing the last list)',
        modelsSyncNow: 'Check now',
        modelsSyncBusy: 'Checking…',
        modelsAdded: 'new',
        modelsEmpty: 'No model list synced yet; the next check fills it in once the gateway answers.',
        modelsNoRoute: 'This profile has no gateway route to sync',
        modelsCapImage: 'image',
        modelsReasoning: 'thinking',
        modelsWindow: 'window',
        modelsOutput: 'out',
        modelsChip: 'models {n} · {age}',
        modelsChipBusy: 'models · updating',
        modelsChipFailed: 'models · read failed',
        modelsChipTitle: 'Model catalog: click to check the gateway now',
        modelsHint: '“new” marks models this background check just brought back. Display names are generated from platform / billing / window; capabilities come from the gateway\'s own declaration and are never invented.',
        quotaTitle: 'Subscription quota', quotaTileOf: '{source} quota',
        quotaSourceDeepseek: 'DeepSeek', quotaSourceOpencode: 'OpenCode Go',
        quotaSourceWorkbuddy: 'WorkBuddy',
        quotaCreditsLine: 'credits {remain} / {total} left',
        quotaWinRolling: '5h', quotaWinWeekly: 'wk', quotaWinMonthly: 'mo',
        quotaWinRollingLong: 'Rolling 5h', quotaWinWeeklyLong: 'This week', quotaWinMonthlyLong: 'This month',
        quotaWindowLine: '{label}: {percent}% used · {reset}',
        quotaLeftSuffix: ' ({left})',
        quotaWindowResets: 'resets {time}', quotaWindowResetUnknown: 'reset time unknown',
        quotaCycleLine: 'Billing period ends {time} ({left})',
        quotaRemainDays: '{n}d left', quotaRemainHours: '{n}h left', quotaRemainMinutes: '{n}m left',
        quotaDaysShort: '{n}d', quotaHoursShort: '{n}h', quotaExpiredShort: 'out',
        quotaExpired: 'expired', quotaCycleHint: 'Days left use the longest window\'s reset as the period end',
        quotaTotal: 'Balance {amount}', quotaSplit: 'top-up {toppedUp} · bonus {granted}',
        quotaUnavailable: 'No balance left for a new task',
        quotaUpdated: 'updated {time}', quotaLoading: 'Loading…', quotaFailed: 'Balance unavailable',
        quotaUnconfigured: 'No provider key', quotaEmpty: 'Zero balance', quotaRefresh: 'Tap to refresh the balance',
        quotaStale: 'Showing the last good reading; retrying in the background', quotaCached: 'cached reading',
        quotaNoSource: 'This provider has no quota to read',
        quotaNoSourceHint: 'The current route is your own gateway: it bills per upstream key and sets no allowance of its own, so there is no quota or expiry to show',
      },
    };

    // ── §2 stores and helpers ───────────────────────────────────────────────
    function createFlagStore() {
      let value = false;
      const listeners = new Set();
      return {
        getSnapshot: () => value,
        subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
        set(next) {
          if (next === value) return;
          value = next;
          for (const fn of listeners) fn();
        },
      };
    }

    /** One shared modal store: only one session's composer is visible at a time. */
    const modalStore = createFlagStore();
    function modalStoreOf() { return modalStore; }

    // Data colours: the host's own chart palette keeps both themes correct.
    const COLORS = {
      system: 'var(--dsw-alias-chart-system)',
      tools: 'var(--dsw-alias-chart-tools)',
      messages: 'var(--dsw-alias-chart-messages)',
      input: 'var(--dsw-alias-chart-messages)',
      cacheRead: 'var(--dsw-alias-chart-tools)',
      cacheWrite: 'var(--dsw-alias-chart-tools)',
      output: 'var(--dsw-alias-state-warn-primary)',
    };

    const STYLES = `
/* ── surface ─────────────────────────────────────────────────────────────── */
.tc-surface{font-size:13px;line-height:1.55;color:var(--dsw-alias-label-secondary);
  --tc-radius:var(--dsw-radius-md);--tc-radius-sm:var(--dsw-radius-sm)}
.tc-panel{box-sizing:border-box;height:100%;overflow:auto;padding:18px 22px 28px;background:var(--dsw-alias-bg-base)}
.tc-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 12px}
.tc-head h2{margin:0;font-size:15px;font-weight:600;line-height:22px;color:var(--dsw-alias-label-primary)}
.tc-head-meta{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
/* Rows must never end in a hole. A 12-column grid leaves one whenever a row's
   spans do not add up to 12 (a lone col-4 after a null card, or col-4 + col-4
   followed by nothing), so the row is laid out as flex instead: the basis
   encodes the span, the grow factor hands the leftover width of a short row
   back to the cards in it, and a row that is alone takes the full width. */
.tc-grid{display:flex;flex-wrap:wrap;align-items:stretch;gap:12px}
.tc-grid>*{min-width:0}
.tc-col-3{flex:3 1 calc(25% - 9.5px)}
.tc-col-4{flex:4 1 calc(33.3333% - 8.5px)}
.tc-col-6{flex:6 1 calc(50% - 6.5px)}
.tc-col-8{flex:8 1 calc(66.6667% - 4.5px)}
.tc-col-9{flex:9 1 calc(75% - 3.5px)}
.tc-col-12{flex:12 1 100%}
@media (max-width:1180px){.tc-col-3,.tc-col-4{flex-basis:calc(50% - 6.5px)}.tc-col-8,.tc-col-9{flex-basis:100%}}
@media (max-width:820px){.tc-grid>*{flex-basis:100% !important}}
/* ── cards ───────────────────────────────────────────────────────────────── */
.tc-card{box-sizing:border-box;min-width:0;display:flex;flex-direction:column;gap:10px;padding:14px 16px 16px;
  border:1px solid var(--dsw-alias-border-l1);border-radius:var(--tc-radius);background:var(--dsw-alias-card-fill);
  box-shadow:var(--dsw-elevation-panel)}
.tc-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:20px}
.tc-card-head h3{margin:0;font-size:13px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary)}
.tc-card-meta{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}
.tc-card-body{display:flex;flex-direction:column;gap:10px;min-width:0;container-type:inline-size}
.tc-empty{display:flex;align-items:center;gap:8px;margin:0;padding:14px 0;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.tc-note{margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
/* ── KPI tiles ───────────────────────────────────────────────────────────── */
.tc-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}
.tc-tile{box-sizing:border-box;display:flex;flex-direction:column;gap:2px;padding:11px 13px 12px;
  border:1px solid var(--dsw-alias-border-l1);border-radius:var(--tc-radius);background:var(--dsw-alias-card-fill)}
.tc-tile-top{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.tc-tile-top svg{width:12px;height:12px;flex:none;opacity:.85}
.tc-tile b{font-size:21px;line-height:26px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);letter-spacing:-.01em}
.tc-tile-sub{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.tc-tile[data-tone='cost'] b{color:var(--dsw-alias-state-business-primary)}
.tc-tile[data-tone='warn'] b{color:var(--dsw-alias-state-warn-primary)}
.tc-band{display:flex;align-items:center;gap:12px;margin:0 0 12px;padding:8px 12px;border-radius:var(--tc-radius);
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-card-tile-fill);font-size:12px;
  color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex-wrap:wrap}
.tc-band b{color:var(--dsw-alias-label-primary);font-weight:500}
.tc-band-title{color:var(--dsw-alias-label-secondary)}
.tc-band[data-over='true'] b{color:var(--dsw-alias-state-error-primary)}
/* ── data rows / legends ─────────────────────────────────────────────────── */
.tc-dl{display:grid;grid-template-columns:minmax(0,auto) minmax(0,1fr);gap:6px 14px;margin:0;font-size:12px;font-variant-numeric:tabular-nums}
.tc-dl dt{color:var(--dsw-alias-label-tertiary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tc-dl dd{margin:0;text-align:right;color:var(--dsw-alias-label-primary)}
.tc-rows{display:flex;flex-direction:column;gap:7px;margin:0;padding:0;min-width:0}
.tc-row2{display:grid;grid-template-columns:minmax(72px,1fr) minmax(48px,.9fr) auto;align-items:center;gap:10px;
  font-size:12px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);min-width:0}
.tc-row2>span:first-child{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tc-row2>span:last-child{text-align:right;color:var(--dsw-alias-label-primary);white-space:nowrap}
.tc-dot{width:7px;height:7px;border-radius:2px;flex:none}
.tc-mini{position:relative;height:5px;border-radius:3px;overflow:hidden;background:var(--dsw-alias-bg-layer-2)}
.tc-mini i{display:block;height:100%;border-radius:3px}
.tc-mini-lg{height:6px;border-radius:3px}
.tc-cap{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
/* ── stacked bar ─────────────────────────────────────────────────────────── */
.tc-bar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--dsw-alias-bg-layer-2)}
.tc-bar i{display:block;height:100%;min-width:0}
.tc-bar-lg{height:14px;border-radius:7px}
.tc-bar-sm{height:6px;border-radius:3px}
.tc-bar-sm i{border-radius:3px}
.tc-legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.tc-legend span{display:inline-flex;align-items:center;gap:5px}
.tc-legend b{font-weight:500;color:var(--dsw-alias-label-secondary)}
/* ── charts ──────────────────────────────────────────────────────────────── */
.tc-chart{display:flex;align-items:flex-end;gap:4px;height:86px;margin-top:2px;
  background:linear-gradient(to top,var(--dsw-alias-border-l1) 0 1px,transparent 1px) bottom/100% 1px no-repeat}
.tc-chart .col{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px;height:100%}
.tc-chart .col i{display:block;width:100%;max-width:22px;border-radius:3px 3px 1px 1px;background:var(--dsw-alias-state-business-primary);opacity:.9}
.tc-chart .col:hover i{opacity:1}
.tc-chart .col span{font-size:9px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;font-variant-numeric:tabular-nums}
.tc-chart .col strong{font-size:9px;font-weight:600;color:var(--dsw-alias-label-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}
.tc-spark{display:block;width:100%;height:88px;overflow:visible}
.tc-spark .area{fill:var(--dsw-alias-state-business-primary);opacity:.16}
.tc-spark .line{fill:none;stroke:var(--dsw-alias-state-business-primary);stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round}
.tc-spark .grid{stroke:var(--dsw-alias-border-l1);stroke-width:1;stroke-dasharray:3 3}
.tc-spark .dot{fill:var(--dsw-alias-state-business-primary)}
.tc-spark text{fill:var(--dsw-alias-label-tertiary);font-size:9px;font-variant-numeric:tabular-nums}
/* ── heatmap ─────────────────────────────────────────────────────────────── */
.tc-heat{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);grid-template-rows:repeat(7,auto);
  gap:3px;max-width:460px;padding:2px 0}
.tc-heat i{display:block;width:100%;aspect-ratio:1;border-radius:2px;background:var(--dsw-alias-bg-layer-2)}
.tc-heat i.blank{background:transparent}
/* ── lists ───────────────────────────────────────────────────────────────── */
.tc-list{list-style:none;margin:0;padding:0;max-height:220px;overflow:auto;display:flex;flex-direction:column}
.tc-list li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;min-width:0}
.tc-list li:last-child{border-bottom:none}
.tc-list .tc-strong{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;white-space:nowrap}
.tc-path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;direction:rtl;text-align:left}
.tc-chip{display:inline-flex;align-items:center;gap:4px;padding:0 6px;height:18px;border-radius:var(--dsw-radius-xs);
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap}
.tc-chip[data-tone='read']{color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent)}
.tc-chip[data-tone='write']{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent)}
.tc-chip[data-tone='ok']{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent)}
/* ── controls ────────────────────────────────────────────────────────────── */
.tc-btn{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--tc-radius-sm);
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;padding:4px 10px;cursor:pointer}
.tc-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.tc-btn:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.tc-btn[data-active='true']{background:var(--dsw-alias-button-primary-fill);border-color:transparent;color:var(--dsw-alias-label-primary-foreground)}
/* Sidebar foot: a two-row card — entry + countdown, then one gauge per window. */
.tc-entry{box-sizing:border-box;width:100%;display:flex;flex-direction:column;align-items:stretch;gap:7px;
  padding:8px 10px 9px;border-radius:var(--tc-radius-sm);border:1px solid transparent;background:transparent;
  font:inherit;text-align:left;line-height:1.3}
.tc-entry:hover{background:var(--dsw-alias-interactive-bg-hover)}
.tc-entry[aria-expanded='true']{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l1)}
.tc-entry-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.tc-entry-label{font-size:12px;color:var(--dsw-alias-label-secondary);min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tc-entry-remain{flex:none;padding:0 6px;height:16px;display:inline-flex;align-items:center;border-radius:9px;
  font-size:10px;font-weight:600;letter-spacing:.01em;font-variant-numeric:tabular-nums;white-space:nowrap;
  color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}
.tc-entry-remain[data-tone='warn']{color:var(--dsw-alias-state-warn-primary);
  background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 16%,transparent)}
.tc-entry-remain[data-tone='crit']{color:var(--dsw-alias-state-error-primary);
  background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 16%,transparent)}
.tc-entry-quota{font-size:15px;font-weight:600;line-height:20px;letter-spacing:-.01em;
  color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tc-entry-quota[data-state='ready']{color:var(--dsw-alias-label-primary)}
/* A remembered (or not-yet-reconfirmed) reading keeps its figure but drops the
   emphasis of a live one, so「旧数」and「刚读到」stay distinguishable at a glance. */
.tc-entry-quota[data-fresh='stale'],.tc-entry-gauges[data-fresh='stale']{opacity:.62}
/* A provider with no allowance is an explanation, not a figure: keep it quiet
   and let it wrap, so the sentence stays readable instead of truncating. */
.tc-entry-quota[data-state='nostore']{font-size:12px;font-weight:400;line-height:16px;
  color:var(--dsw-alias-label-tertiary);white-space:normal;overflow:visible;text-overflow:clip}
.tc-entry-gauges{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;min-width:0}
.tc-meter{display:flex;flex-direction:column;gap:4px;min-width:0;cursor:default}
.tc-meter-head{display:flex;align-items:baseline;justify-content:space-between;gap:2px;min-width:0}
.tc-meter-label{font-style:normal;font-size:11px;letter-spacing:.02em;color:var(--dsw-alias-label-tertiary);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc-meter-value{font-size:11px;font-weight:600;line-height:14px;color:var(--dsw-alias-label-secondary);
  font-variant-numeric:tabular-nums;white-space:nowrap}
.tc-meter-track{display:block;height:3px;border-radius:2px;overflow:hidden;background:var(--dsw-alias-bg-layer-2)}
.tc-meter-fill{display:block;height:100%;border-radius:2px;min-width:2px;
  background:var(--dsw-alias-state-business-primary);transition:width 180ms var(--ds-ease-in-out,ease-out)}
.tc-meter[data-tone='warn'] .tc-meter-value{color:var(--dsw-alias-state-warn-primary)}
.tc-meter[data-tone='warn'] .tc-meter-fill{background:var(--dsw-alias-state-warn-primary)}
.tc-meter[data-tone='crit'] .tc-meter-value{color:var(--dsw-alias-state-error-primary)}
.tc-meter[data-tone='crit'] .tc-meter-fill{background:var(--dsw-alias-state-error-primary)}
.tc-entry-rail{box-sizing:border-box;width:36px;height:36px;padding:0;gap:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;border-radius:var(--dsw-radius-sm)}
.tc-entry-rail b{max-width:32px;font-size:10px;font-weight:600;line-height:12px;color:var(--dsw-alias-label-primary);
  font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc-entry-rail b[data-tone='warn']{color:var(--dsw-alias-state-warn-primary)}
.tc-entry-rail b[data-tone='crit']{color:var(--dsw-alias-state-error-primary)}
.tc-entry-rail i{font-style:normal;font-size:8px;line-height:10px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.tc-entry-rail i[data-tone='warn']{color:var(--dsw-alias-state-warn-primary)}
.tc-entry-rail i[data-tone='crit']{color:var(--dsw-alias-state-error-primary)}
.tc-input{box-sizing:border-box;height:26px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--tc-radius-sm);
  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;min-width:0}
.tc-input::placeholder{color:var(--dsw-alias-label-tertiary)}
.tc-input:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.tc-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tc-toolbar .tc-input{flex:1 1 150px}
/* clickable chips double as list filters */
.tc-chip[role='button']{cursor:pointer;border:1px solid transparent}
.tc-chip[role='button']:hover{border-color:var(--dsw-alias-border-l1)}
.tc-chip[data-on='true']{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.tc-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-width:0}
/* ── donut ───────────────────────────────────────────────────────────────── */
.tc-donut{display:flex;align-items:center;gap:14px;min-width:0;flex-wrap:wrap}
.tc-donut svg{width:88px;height:88px;flex:none}
.tc-donut circle{fill:none;stroke-width:11}
.tc-donut .ring{stroke:var(--dsw-alias-bg-layer-2)}
.tc-donut .tc-legend{flex:1 1 120px;min-width:0}
.tc-donut text{font-size:9px;fill:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.tc-donut-center{font-size:15px;font-weight:600}
/* ── stat strip (context stats) ──────────────────────────────────────────── */
.tc-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:10px;min-width:0}
.tc-stat{padding:8px 10px;border-radius:var(--tc-radius-sm);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);min-width:0}
.tc-stat span{display:block;font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc-stat b{display:block;font-size:17px;line-height:22px;font-weight:600;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.tc-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;min-width:0}
.tc-sub{font-size:11px;font-weight:500;color:var(--dsw-alias-label-tertiary);margin:0 0 6px}
/* ── command ledger ──────────────────────────────────────────────────────── */
.tc-cmd{display:grid;grid-template-columns:minmax(56px,auto) minmax(0,1fr) auto;gap:10px;align-items:center;
  padding:5px 0;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;min-width:0}
.tc-cmd:last-child{border-bottom:none}
.tc-cmd code{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11px;color:var(--dsw-alias-label-secondary);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.tc-cmd .tc-meta{display:flex;align-items:center;gap:8px;white-space:nowrap;font-variant-numeric:tabular-nums}
.tc-log{list-style:none;margin:6px 0 0;padding:0 0 0 10px;border-left:2px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.tc-op{padding:4px 0;border-bottom:1px dashed var(--dsw-alias-border-l1)}
.tc-op:last-child{border-bottom:none}
.tc-delta{font-variant-numeric:tabular-nums;white-space:nowrap}
.tc-delta b{font-weight:600}
.tc-delta .add{color:var(--dsw-alias-state-success-primary)}
.tc-delta .del{color:var(--dsw-alias-state-error-primary)}
/* ── context items ───────────────────────────────────────────────────────── */
/* Reading order per row: caret → name → magnitude bar → tokens → share. The bar
   is relative to the largest row (a shape cue), the share is relative to the
   tab's own total (an absolute one) — so "which one is biggest" and "how much
   of this bucket is it" are both answered without hovering. */
.tc-item{--tc-item-accent:var(--dsw-alias-state-business-primary);
  display:flex;flex-direction:column;min-width:0;border-bottom:1px solid var(--dsw-alias-border-l1)}
.tc-item:last-child{border-bottom:none}
.tc-item-head,.tc-item-cols{display:grid;
  grid-template-columns:12px 7px minmax(0,1fr) minmax(0,1.3fr) minmax(36px,.4fr) minmax(52px,auto) 44px;
  align-items:center;gap:8px;min-width:0}
.tc-item-head{width:100%;padding:6px 4px 6px 0;border:none;background:transparent;
  font:inherit;font-size:12px;text-align:left;color:var(--dsw-alias-label-secondary);
  font-variant-numeric:tabular-nums;cursor:pointer;border-radius:var(--dsw-radius-xs)}
.tc-item-head:hover{background:var(--dsw-alias-interactive-bg-hover)}
.tc-item-head:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.tc-item-cols{padding:0 4px 4px 0;font-size:11px;letter-spacing:.02em;
  color:var(--dsw-alias-label-tertiary);border-bottom:1px solid var(--dsw-alias-border-l1)}
.tc-item-cols span:nth-child(6),.tc-item-cols span:nth-child(7){text-align:right}
.tc-item-caret{font-size:9px;color:var(--dsw-alias-label-tertiary);line-height:1}
.tc-item-dot{width:7px;height:7px;border-radius:2px;flex:none}
.tc-item-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:var(--dsw-alias-label-primary)}
/* The hint is the answer to "what is inside this one" without opening it; it is
   the quiet third level of type, and the first column to go when space runs out. */
.tc-item-hint{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:var(--dsw-alias-label-tertiary);font-size:11px}
.tc-item-bar{position:relative;height:4px;border-radius:2px;overflow:hidden;background:var(--dsw-alias-bg-layer-2)}
.tc-item-bar i{display:block;height:100%;border-radius:2px;background:var(--tc-item-accent);opacity:.42}
.tc-item-value{text-align:right;color:var(--dsw-alias-label-primary);white-space:nowrap;font-size:12px}
.tc-item-share{text-align:right;color:var(--dsw-alias-label-tertiary);white-space:nowrap;font-size:11px}
/* The lead row is the one that answers "what is it": it keeps the full-strength
   bar while every other row fades back, so the list has a head, not a plateau. */
.tc-item[data-lead='true'] .tc-item-bar i{opacity:.85}
.tc-item[data-lead='true'] .tc-item-value{font-weight:600}
/* The open row is the one being read: lift it off the list, not just recolor it. */
/* Tinted band + rail, with no horizontal padding change: a shifted header would
   knock the open row's columns out of line with every other row. */
.tc-item[data-open='true']{border-radius:var(--tc-radius-sm);border-bottom-color:transparent;
  background:color-mix(in srgb,var(--tc-item-accent) 7%,transparent)}
.tc-item[data-open='true'] .tc-item-name{white-space:normal;font-weight:600;color:var(--dsw-alias-label-primary)}
.tc-item[data-open='true'] .tc-item-value{font-weight:600;color:var(--dsw-alias-label-primary)}
.tc-item[data-open='true'] .tc-item-bar i{opacity:1}
.tc-item[data-open='true'] .tc-item-caret{color:var(--tc-item-accent)}
.tc-item-body{display:flex;flex-direction:column;gap:6px;min-width:0;
  margin:0 6px 8px 13px;padding:4px 0 4px 9px;border-left:2px solid var(--tc-item-accent)}
.tc-item-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0;min-width:0;
  font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.tc-item-tag{display:inline-flex;align-items:center;gap:4px;padding:0 6px;height:17px;
  border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-bg-layer-2);
  color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:nowrap}
.tc-item-tag b{font-weight:600;color:var(--dsw-alias-label-secondary)}
.tc-item-tag[data-tone='accent']{color:var(--tc-item-accent);
  background:color-mix(in srgb,var(--tc-item-accent) 13%,transparent)}
.tc-item-tag[data-tone='accent'] b{color:inherit}
.tc-item-tag[data-tone='warn']{color:var(--dsw-alias-state-warn-primary);
  background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent)}
.tc-item-text{margin:0;padding:8px 10px;max-height:320px;overflow:auto;border-radius:var(--tc-radius-sm);
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-markdown-code-block);
  font-family:var(--dsw-font-family-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;line-height:16px;
  color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}
.tc-item-text[data-empty='true']{font-family:inherit;font-size:12px;font-style:italic;line-height:18px;
  color:var(--dsw-alias-label-tertiary);background:transparent;border-style:dashed}
/* ── item list chrome: tab bar, per-tab strip, composition block ─────────── */
/* Navigation is an underline tab, a preference is a soft segmented control: two
   different jobs, two different shapes. Fill-based tabs fail here anyway: every
   bg-layer-* token resolves to white in the light theme and to a near-identical
   grey in the dark one, so a filled selected tab has no contrast in either. */
.tc-tabbar{display:flex;align-items:stretch;gap:4px;align-self:stretch;min-width:0;
  border-bottom:1px solid var(--dsw-alias-border-l1)}
.tc-tab{display:inline-flex;align-items:center;gap:6px;padding:5px 8px 6px;border:none;border-bottom:2px solid transparent;
  margin-bottom:-1px;background:transparent;font:inherit;font-size:12px;color:var(--dsw-alias-label-tertiary);
  cursor:pointer;white-space:nowrap}
.tc-tab:hover{color:var(--dsw-alias-label-secondary)}
.tc-tab:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.tc-tab[aria-pressed='true']{color:var(--dsw-alias-label-primary);font-weight:600;
  border-bottom-color:var(--dsw-alias-state-business-primary)}
.tc-tab-n{padding:0 5px;height:15px;display:inline-flex;align-items:center;border-radius:8px;
  font-size:10px;font-weight:600;font-variant-numeric:tabular-nums;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary)}
.tc-tab[aria-pressed='true'] .tc-tab-n{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 15%,transparent);
  color:var(--dsw-alias-state-business-primary)}
.tc-subbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;min-width:0}
.tc-subbar-text{display:flex;align-items:center;gap:4px 8px;flex-wrap:wrap;min-width:0;
  font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.tc-subbar-text b{font-size:13px;font-weight:600;line-height:18px;color:var(--dsw-alias-label-primary)}
.tc-subbar-text em{font-style:normal;color:var(--dsw-alias-label-secondary);max-width:26ch;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tc-subbar-sep{color:var(--dsw-alias-border-l2)}
.tc-subbar-tools{display:flex;align-items:center;gap:8px;flex:0 0 auto;margin-left:auto}
.tc-subbar .tc-input{flex:0 1 190px}
.tc-block{display:flex;flex-direction:column;gap:8px;min-width:0;container-type:inline-size}
.tc-compose{display:flex;align-items:center;gap:6px 12px;flex-wrap:wrap;min-width:0;
  padding:8px 10px;border-radius:var(--tc-radius-sm);border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-1)}
.tc-compose-label{display:inline-flex;align-items:baseline;gap:6px;flex:none;
  font-size:11px;color:var(--dsw-alias-label-tertiary)}
.tc-compose-label b{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);
  font-variant-numeric:tabular-nums}
.tc-compose-bar{flex:1 1 180px;min-width:120px;display:block}
.tc-compose .tc-legend{flex:0 1 auto}
.tc-legend b{padding-right:2px}
.tc-legend em{font-style:normal;opacity:.75;font-variant-numeric:tabular-nums}
.tc-kinds{display:flex;flex-direction:column;gap:5px;min-width:0}
.tc-kinds-label{display:inline-flex;align-items:baseline;gap:6px;
  font-size:11px;color:var(--dsw-alias-label-tertiary)}
.tc-kinds-label b{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);
  font-variant-numeric:tabular-nums}
.tc-kinds .tc-legend{padding-top:1px}
/* Narrow is a container fact, not a viewport one: the same card lives in a
   full-width tab and in the ~380px right sidebar, so the breakpoints must follow
   the list's own width (the .tc-block wrapper is the size container). Order:
   the gist column goes first, then the magnitude bar — the two numbers stay. */
@container (max-width:820px){
  .tc-item-head,.tc-item-cols{grid-template-columns:12px 7px minmax(0,1fr) minmax(36px,.4fr) minmax(52px,auto) 44px}
  .tc-item-cols span:nth-child(4),.tc-item-cols span:nth-child(5),.tc-item-hint{display:none}
}
@container (max-width:460px){
  /* Stack the summary: at this width an inline bar between label and legend
     shrinks to a stub that no longer shows a proportion. */
  .tc-compose{align-items:stretch;gap:6px}
  .tc-compose-bar{flex:1 1 100%;order:2}
  .tc-compose .tc-legend{order:3}
  .tc-compose-label{order:1}
  .tc-item-head,.tc-item-cols{grid-template-columns:12px 7px minmax(0,1fr) minmax(44px,auto) 40px}
  .tc-item-cols span:nth-child(4),.tc-item-cols span:nth-child(5),
  .tc-item-hint,.tc-item-bar{display:none}
  .tc-subbar .tc-input{flex:1 1 110px}
  .tc-tabbar{width:100%}
  .tc-tab{flex:1 1 auto;justify-content:center;padding-left:4px;padding-right:4px}
}
@media (max-width:640px){
  .tc-subbar .tc-input{flex:1 1 120px}
}
/* ── context browser content ─────────────────────────────────────────────── */
.tc-pre{margin:3px 0 0;padding:6px 8px;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11px;
  line-height:1.5;white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto}
.tc-content{display:flex;flex-direction:column;gap:2px;margin-top:2px}
.tc-more{align-self:center;margin-top:2px;font-size:11px;padding:3px 12px}
/* ── table (context browser) ─────────────────────────────────────────────── */
.tc-table{display:flex;flex-direction:column;gap:1px;max-height:320px;overflow:auto;font-variant-numeric:tabular-nums}
.tc-trow{display:grid;grid-template-columns:66px minmax(0,1fr) 78px 84px 44px;gap:10px;align-items:center;padding:4px 6px;border-radius:var(--dsw-radius-xs);font-size:12px;min-width:0}
.tc-trow>span:nth-child(2){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tc-trow>span:nth-child(3),.tc-trow>span:nth-child(4){text-align:right;white-space:nowrap}
.tc-trow>span:last-child{text-align:right;color:var(--dsw-alias-label-tertiary)}
.tc-trow.tc-thead{position:sticky;top:0;z-index:1;background:var(--dsw-alias-card-fill);color:var(--dsw-alias-label-tertiary);font-size:11px;border-bottom:1px solid var(--dsw-alias-border-l1);border-radius:0}
.tc-trow[role='button']{cursor:pointer}
.tc-trow[role='button']:hover{background:var(--dsw-alias-interactive-bg-hover)}
.tc-trow[aria-expanded='true']{background:var(--dsw-alias-bg-layer-2)}
.tc-detail{margin:2px 0 6px;padding:8px 10px;border-left:2px solid var(--dsw-alias-state-business-primary);
  border-radius:0 var(--dsw-radius-xs) var(--dsw-radius-xs) 0;background:var(--dsw-alias-bg-layer-1)}
/* ── modal / overlay ─────────────────────────────────────────────────────── */
.tc-mask{position:fixed;inset:0;z-index:9998;background:var(--dsw-alias-bg-mask-1);display:flex;align-items:center;justify-content:center;padding:24px}
.tc-modal .tc-col-4{flex-basis:calc(50% - 6.5px)}
@media (max-width:720px){.tc-modal .tc-col-4{flex-basis:100%}}
.tc-modal{box-sizing:border-box;width:min(820px,100%);max-height:min(82vh,760px);overflow:auto;
  border:1px solid var(--dsw-alias-border-l2);border-radius:var(--tc-radius);background:var(--dsw-alias-bg-layer-1);
  padding:18px 20px 20px;box-shadow:var(--dsw-elevation-prominent)}
.tc-overlay-mask{position:fixed;inset:0;z-index:9997;background:var(--dsw-alias-bg-mask-1);display:flex;justify-content:flex-end}
.tc-overlay{box-sizing:border-box;width:min(940px,94vw);height:100%;overflow:auto;background:var(--dsw-alias-bg-base);
  border-left:1px solid var(--dsw-alias-border-l1);padding:18px 22px 32px}
.tc-session{box-sizing:border-box;display:flex;flex-direction:column;gap:5px;padding:10px 12px;border-radius:var(--tc-radius-sm);
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-card-tile-fill);cursor:pointer;min-width:0}
.tc-session:hover{background:var(--dsw-alias-interactive-bg-hover)}
.tc-session:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.tc-session b{font-size:12px;font-weight:500;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tc-session-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.tc-session-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
/* ── settings page ───────────────────────────────────────────────────────── */
.tc-settings{display:flex;flex-direction:column;gap:6px;max-width:720px;color:var(--dsw-alias-label-primary)}
.tc-settings-title{margin:0;font-size:18px;font-weight:600;line-height:26px}
.tc-settings-intro{margin:0 0 4px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.tc-group-title{margin:10px 0 0;font-size:11px;font-weight:500;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}
.tc-pref{display:flex;flex-direction:column}
.tc-pref-row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:14px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.tc-pref-row:last-child{border-bottom:none}
.tc-pref-text{min-width:0}
.tc-pref-title{font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary)}
.tc-pref-desc{margin-top:2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.tc-control{display:inline-flex;align-items:center;gap:8px;flex:none}
/* switch */
.tc-switch{position:relative;width:36px;height:20px;flex:none;padding:0;border-radius:10px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);transition:background .15s ease}
.tc-switch i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-primary);
  transition:transform .15s ease;box-shadow:var(--dsw-shadow-lv1)}
.tc-switch[aria-checked='true']{background:var(--dsw-alias-state-business-primary);border-color:transparent}
.tc-switch[aria-checked='true'] i{transform:translateX(16px);background:var(--dsw-alias-label-primary-foreground)}
.tc-switch:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
/* segmented control: the pressed segment is the host's primary button — never a
   white-on-white slab (brand-primary resolves to #f9fafb in the dark theme). */
.tc-seg{display:inline-flex;flex:none;padding:2px;border-radius:var(--tc-radius-sm);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.tc-seg .tc-btn{border:none;background:transparent;border-radius:calc(var(--tc-radius-sm) - 2px);padding:3px 10px;color:var(--dsw-alias-label-tertiary)}
.tc-seg .tc-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.tc-seg .tc-btn[aria-pressed='true']{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);font-weight:500}
/* A soft segmented control: pressed = tinted, so a low-stakes toggle cannot
   out-shout the tab that says which bucket is on screen. */
.tc-seg-soft .tc-btn[aria-pressed='true']{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent);
  color:var(--dsw-alias-state-business-primary);font-weight:600}
.tc-budget{display:inline-flex;align-items:center;gap:6px;padding:0 8px;height:26px;border:1px solid var(--dsw-alias-border-l1);
  border-radius:var(--tc-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary);font-size:12px}
.tc-budget input{width:80px;padding:0;border:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;text-align:right;outline:none}
/* Settings header chip + model catalog page: paint the cache, refresh upstream
   behind the panel. The chip is the lazy trigger — it mounts whenever settings
   opens, so no polling exists on this path. */
.tc-chip{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px;border-radius:12px;
  border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);
  font:inherit;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);
  font-variant-numeric:tabular-nums;white-space:nowrap;cursor:pointer}
.tc-chip:hover{background:var(--dsw-alias-interactive-bg-hover)}
.tc-chip-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-business-primary);flex:none}
.tc-chip[data-busy='true'] .tc-chip-dot{animation:tc-pulse 1s ease-in-out infinite}
@keyframes tc-pulse{0%,100%{opacity:.28}50%{opacity:1}}
.tc-models-bar{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;
  padding:2px 0 10px;border-bottom:.5px solid var(--dsw-alias-border-l2);margin-bottom:2px}
.tc-models-meta{display:flex;flex-direction:column;gap:3px;min-width:0}
.tc-models-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.tc-models-status[data-busy='true']{color:var(--dsw-alias-state-business-primary)}
.tc-models-route{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tc-models-count{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);
  font-variant-numeric:tabular-nums}
.tc-model-list{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column}
.tc-model-row{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:'main caps' 'id caps';
  gap:2px 16px;padding:9px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.tc-model-row:last-child{border-bottom:none}
.tc-model-main{grid-area:main;display:flex;align-items:center;gap:6px;min-width:0}
.tc-model-name{font-size:13px;line-height:18px;color:var(--dsw-alias-label-primary);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tc-model-tag{flex:none;padding:0 5px;height:15px;display:inline-flex;align-items:center;border-radius:8px;
  font-size:10px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-state-business-primary);
  background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent)}
.tc-model-id{grid-area:id;font-family:var(--dsw-font-family-code,ui-monospace,monospace);font-size:11px;line-height:16px;
  color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tc-model-caps{grid-area:caps;display:flex;align-items:center;gap:5px;flex-wrap:wrap;justify-content:flex-end}
.tc-model-cap{flex:none;padding:0 6px;height:17px;display:inline-flex;align-items:center;border-radius:9px;
  font-size:10px;line-height:17px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);
  font-variant-numeric:tabular-nums;white-space:nowrap}
`;

    function fmtInt(n) { return Number(n || 0).toLocaleString('en-US'); }

    /**
     * A one-line gist for the row list.
     *
     * Host previews are raw prompt text, so a section's preview opens with the
     * banner it came from (`═══ Name ═══`) and often with its markdown heading
     * (`## Name`) — both restate the label the first column already shows, then
     * drag a run of rule characters across the row. Strip the decoration, drop
     * the repeated label, and flatten whitespace: the hint has to say what is
     * *inside* the item, not where it starts.
     */
    const HINT_RULES = /[\u2550\u2500\u2501=\*_~#]{3,}/gu;
    const HINT_LEAD = /^[\s\u00b7:.,\u2014\u2013\u2022|>-]+/u;
    /** Normalize a preview, then remove a leading repeat of `label`. */
    function hintOf(text, label) {
      let raw = String(text ?? '');
      if (raw === '') return '';
      raw = raw.replace(HINT_RULES, ' \u00b7 ').replace(/\s+/g, ' ').trim();
      // A heading marker or bold wrapper in front of the label is decoration.
      raw = raw.replace(/^#{1,6}\s*/u, '').replace(/^\*\*(.*?)\*\*/u, '$1').replace(HINT_LEAD, '');
      const head = String(label ?? '').replace(HINT_RULES, ' ').replace(/\s+/g, ' ')
        .replace(/^#{1,6}\s*/u, '').trim();
      if (head !== '' && raw.toLowerCase().startsWith(head.toLowerCase())) {
        raw = raw.slice(head.length).replace(HINT_LEAD, '');
      }
      return raw.trim();
    }

    /** Compact count for chart labels: 12.3M / 840K, so a 2px bar still says a number. */
    function fmtShort(n) {
      const v = safeCount(n);
      if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
      if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
      if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'K';
      return String(Math.round(v));
    }

    function safeCount(n) { return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0; }

    /** Price one `tcTimeline` request with the official table. */
    function priceRequest(pricing, request, tier, currency) {
      if (!request) return null;
      const r = pricing.computeTurnCost({
        uncachedInputTokens: safeCount(request.input), outputTokens: safeCount(request.output),
        cacheReadTokens: safeCount(request.cacheRead), cacheWriteTokens: safeCount(request.cacheWrite),
        totalTokens: safeCount(request.totalTokens),
        routes: [{ provider: request.provider || '', model: request.model || '' }],
      }, request.time || Date.now(), undefined, tier, currency);
      return r.status === 'ok' ? r : null;
    }

    /** Roots that only set up the real command; never the program itself. */
    const WRAPPER_ROOTS = new Set(['cd', 'pushd', 'sudo', 'env', 'time', 'nohup', 'command', 'exec']);

    /**
     * Program behind a command line, derived from the ledger's `call` text.
     * The Host fold stores `program` too, but a running Host keeps the module
     * generation it booted with, so after an in-place plugin update the stored
     * value can come from an older heuristic — this re-derives only then.
     */
    function programOfCall(call) {
      if (typeof call !== 'string' || call.trim() === '') return '';
      const tokens = call.trim().split('\n')[0].split(/\s+/);
      const clean = token => token.replace(/^[("'`]+|[);&|"'`]+$/g, '');
      for (let index = 0; index < tokens.length; index += 1) {
        const token = clean(tokens[index]);
        if (token === '') continue;
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
        if (WRAPPER_ROOTS.has(token)) { if (token === 'cd' || token === 'pushd') index += 1; continue; }
        if (token.startsWith('-')) continue;
        return token.split('/').pop() || token;
      }
      return '';
    }

    /** The program a ledger row should be grouped under. */
    function commandProgram(command) {
      const stored = String(command?.program ?? '');
      if (stored !== '' && !WRAPPER_ROOTS.has(stored)) return stored;
      return programOfCall(command?.call) || stored || '?';
    }

    /** Format an amount in the user's display currency. */
    function money(pricing, amount, currency) {
      return pricing.formatMoney(amount, currency);
    }

    /**
     * Price one `tcActivity` model slot in the display currency.
     *
     * The Host folds each request's billing tier into the day row (`peak` /
     * `offPeak` buckets), because a day-level aggregate has no request timestamp
     * left to test. A pinned tier preference (`peak` / `offPeak`) overrides that
     * split for every slot; `auto` uses it as folded. Legacy flat slots (`{input,
     * cacheRead, …}`, pre-stateVersion-3) still price, at the folded-in `now`.
     *
     * @returns {number|null} null when the model has no official price row
     */
    function priceModelSlot(pricing, slot, model, tier, currency, now) {
      if (!model || slot === null || slot === undefined) return null;
      const forced = tier === 'peak' || tier === 'offPeak' ? tier : undefined;
      const priceOne = (buckets, at) => {
        if (buckets === null || buckets === undefined) return null;
        const priced = pricing.priceBucketsResult({
          input: safeCount(buckets.input), cacheRead: safeCount(buckets.cacheRead),
          cacheWrite: safeCount(buckets.cacheWrite), output: safeCount(buckets.output),
        }, model, now, at);
        return priced === null ? null : pricing.moneyOf(priced, currency).amount;
      };
      const split = slot.peak !== undefined || slot.offPeak !== undefined;
      if (!split) return priceOne(slot, forced);
      const peak = priceOne(slot.peak, forced ?? 'peak');
      const offPeak = priceOne(slot.offPeak, forced ?? 'offPeak');
      if (peak === null && offPeak === null) return null;
      return safeCount(peak) + safeCount(offPeak);
    }

    /** Tokens in one model slot, whether tier-split or legacy flat. */
    function slotTokens(slot) {
      if (slot === null || slot === undefined) return 0;
      const sum = b => safeCount(b?.input) + safeCount(b?.cacheRead)
        + safeCount(b?.cacheWrite) + safeCount(b?.output);
      if (slot.peak !== undefined || slot.offPeak !== undefined) return sum(slot.peak) + sum(slot.offPeak);
      return sum(slot);
    }

    const BUCKETS = ['input', 'cacheRead', 'cacheWrite', 'output'];

    /**
     * One pass over the request log: display-currency total, per-bucket money,
     * per-model money, dual-currency totals, tier split, cache-hit share.
     * Everything the cost cards show comes from here, so the numbers agree.
     */
    function summarize(pricing, requests, tier, currency) {
      const out = {
        cost: 0, cny: 0, usd: 0, tokens: 0, cacheReadTokens: 0,
        byBucket: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
        byModel: new Map(), known: 0, unknown: 0, peak: 0, offPeak: 0, approximate: false,
      };
      for (const request of Array.isArray(requests) ? requests : []) {
        const tokens = safeCount(request.totalTokens);
        out.tokens += tokens;
        out.cacheReadTokens += safeCount(request.cacheRead);
        const priced = priceRequest(pricing, request, tier, currency);
        if (priced === null) { out.unknown += 1; continue; }
        out.known += 1;
        out.cost += priced.amount;
        out.cny += pricing.moneyOf(priced, 'CNY').amount;
        out.usd += safeCount(priced.usd);
        if (priced.approximate === true) out.approximate = true;
        if (priced.peak === true) out.peak += 1;
        else if (priced.peak === false) out.offPeak += 1;
        if (priced.displayRates !== undefined) {
          for (const key of BUCKETS) {
            out.byBucket[key] += safeCount(priced.parts[key]) * (Number(priced.displayRates[key]) || 0) / 1e6;
          }
        }
        const model = request.model || 'unknown';
        const row = out.byModel.get(model) || { model, cost: 0, tokens: 0, requests: 0 };
        row.cost += priced.amount;
        row.tokens += tokens;
        row.requests += 1;
        out.byModel.set(model, row);
      }
      out.cacheHit = out.tokens > 0 ? out.cacheReadTokens / out.tokens * 100 : null;
      out.models = [...out.byModel.values()].sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
      return out;
    }

    /** Subscribe to the shared cost-preference store owned by the entry chunk. */
    function usePrefsOf(pricing) {
      return React.useSyncExternalStore(
        pricing.prefs.subscribe, pricing.prefs.getSnapshot, () => pricing.PREF_DEFAULTS);
    }

    function useOptional(hook, selector) {
      // Hooks must be called unconditionally; guard the hook itself instead.
      return typeof hook === 'function' ? hook(selector) : undefined;
    }

    // ── §2.5 subscription quota ──────────────────────────────────────────────
    // What is left of the subscription backing the current work, shown at the
    // sidebar foot. The Host route owns the platform request and the provider
    // key; this chunk only formats the body it returns, so nothing here prices
    // anything and no secret reaches the page. Two source shapes exist — a
    // wallet balance (DeepSeek) and consumption windows (OpenCode Go) — and the
    // source follows whatever the most recent request actually ran on.
    /** Client poll cadence; the Host caches its own read per source. */
    const QUOTA_POLL_MS = 5 * 60 * 1000;
    /** Same-origin route registered by the Host half. */
    const QUOTA_URL = '/dsh-session-insight/quota';
    /**
     * Route-parameter fallback only. It is never used to *decide* what to show:
     * a read waits until the session names a vendor (see `sourceOfSessions`),
     * because guessing here paints DeepSeek's official wallet on an account
     * that is running on someone else's subscription.
     */
    const QUOTA_DEFAULT_SOURCE = 'deepseek';
    /** Remembers the last vendor a session named, for blank sessions with no history. */
    const QUOTA_SOURCE_KEY = 'dsh-session-insight:quota-source';
    /**
     * Last successful read per source, so a reload paints the figure it already
     * had instead of flashing「读取中…」while the Host answers. The value is only
     * a starting point: the read that follows always replaces it.
     */
    const QUOTA_CACHE_KEY = 'dsh-session-insight:quota-cache';
    /**
     * How old a persisted read may be and still stand in for the live one. The
     * shortest vendor window (OpenCode's rolling 5h) resets within this span, so
     * anything older describes a period that has already ended; past it a spinner
     * is the honest answer.
     */
    const QUOTA_CACHE_TTL_MS = 5 * 60 * 60 * 1000;
    /**
     * How long a candidate source must stay the answer before the foot switches.
     *
     * The chosen source is derived state: it depends on which session is running,
     * which ones the list has hydrated, and which route each session's timeline
     * has recorded so far. Right after a page load, a reconnect, or the moment a
     * turn ends, those inputs land in several passes, so the derived answer walks
     * through intermediate values — and every intermediate value used to paint a
     * real figure. On a WorkBuddy session that showed up as the OpenCode windows
     * flashing in and out: the OpenCode reading was a halfway state, not an
     * answer. Waiting out a short settle window collapses that whole walk into
     * its final value, so only a source that *persists* is ever read.
     */
    const QUOTA_SOURCE_DEBOUNCE_MS = 1200;
    const WALLET_SIGN = { CNY: '¥', USD: '$' };

    function money2(amount, currency) {
      const value = Number(amount);
      if (!Number.isFinite(value)) return '';
      return (WALLET_SIGN[currency] || '') + value.toFixed(2);
    }

    /** `¥12.34 · $3.00` for a wallet list. */
    function moneyList(wallets) {
      const parts = [];
      for (const wallet of Array.isArray(wallets) ? wallets : []) {
        const text = money2(wallet && wallet.total, wallet && wallet.currency);
        if (text !== '') parts.push(text);
      }
      return parts.join(' · ');
    }

    /** Beijing `HH:MM` — same clock every other card reads. */
    function clock(ms) {
      const date = new Date(safeCount(ms) + 8 * 3600 * 1000);
      return String(date.getUTCHours()).padStart(2, '0') + ':' + String(date.getUTCMinutes()).padStart(2, '0');
    }

    /** Beijing `MM-DD HH:MM` for an ISO timestamp; empty when unusable. */
    function stampOf(iso) {
      const ms = Date.parse(String(iso || ''));
      if (!Number.isFinite(ms)) return '';
      const date = new Date(ms + 8 * 3600 * 1000);
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return month + '-' + day + ' ' + clock(ms);
    }

    /**
     * Same stamp for an instant already expressed in milliseconds.
     *
     * `quotaCycleOf` works in epoch ms (it compares spans, not strings), while
     * every wire field it derives from is ISO. Keeping the two apart means one
     * `stampOf` never has to guess which kind of value it was handed.
     */
    function stampOfMs(ms) {
      return Number.isFinite(ms) ? stampOf(new Date(ms).toISOString()) : '';
    }

    /** Milliseconds from `now` to an ISO instant; `null` when the stamp is unusable. */
    function msUntil(iso, now) {
      const at = Date.parse(String(iso || ''));
      if (!Number.isFinite(at)) return null;
      return at - (Number.isFinite(now) ? now : Date.now());
    }

    /**
     * Countdown of a millisecond span — `剩 12 天` / `剩 5 小时` / `剩 40 分`, or
     * `已到期`. Whole days floor rather than round: a countdown may never promise
     * time the account does not have.
     */
    function remainText(ms, t) {
      if (!Number.isFinite(ms)) return '';
      if (ms <= 0) return t('quotaExpired');
      const day = 86400000;
      const hour = 3600000;
      if (ms >= day) return t('quotaRemainDays', { n: Math.floor(ms / day) });
      if (ms >= hour) return t('quotaRemainHours', { n: Math.floor(ms / hour) });
      return t('quotaRemainMinutes', { n: Math.max(1, Math.floor(ms / 60000)) });
    }

    /** Countdown squeezed for the collapsed rail: `12天` / `5时` / `过期`. */
    function remainCompact(ms, t) {
      if (!Number.isFinite(ms)) return '';
      if (ms <= 0) return t('quotaExpiredShort');
      const day = 86400000;
      const hour = 3600000;
      if (ms >= day) return t('quotaDaysShort', { n: Math.floor(ms / day) });
      if (ms >= hour) return t('quotaHoursShort', { n: Math.floor(ms / hour) });
      return t('quotaHoursShort', { n: 1 });
    }

    /** Tone of a countdown: the paid time runs out this week ⇒ warn, in 3 days ⇒ crit. */
    function remainTone(ms) {
      if (!Number.isFinite(ms)) return 'calm';
      if (ms <= 3 * 86400000) return 'crit';
      if (ms <= 7 * 86400000) return 'warn';
      return 'calm';
    }

    /**
     * The subscription cycle behind a window source, `{ at, ms, window, kind }`.
     *
     * Two ways a vendor states it, in precedence order:
     *
     *  1. `plan.expiresAt` — a source that *knows* its own subscription expiry
     *     (WorkBuddy's credit packages, where the buckets each reset inside a
     *     billing period that ends at its own moment). Nothing is inferred.
     *  2. the longest window's reset — the only expiry the OpenCode Go usage
     *     answer exposes (monthly is the billing period).
     *
     * Returns `null` for a wallet source and for a source with neither.
     */
    function quotaCycleOf(snapshot, now) {
      if (snapshot === null || snapshot === undefined) return null;
      if (snapshot.status !== 'ready' || snapshot.kind !== 'windows') return null;
      const anchor = Number.isFinite(now) ? now : Date.now();
      const declared = snapshot.plan === null || snapshot.plan === undefined ? null : snapshot.plan.expiresAt;
      const declaredAt = Date.parse(String(declared || ''));
      if (Number.isFinite(declaredAt)) {
        return { at: declaredAt, ms: declaredAt - anchor, window: null, kind: 'plan' };
      }
      let best = null;
      for (const window of snapshot.windows) {
        const at = Date.parse(String(window.resetsAt || ''));
        if (!Number.isFinite(at)) continue;
        if (best === null || at > best.at) best = { at, window };
      }
      if (best === null) return null;
      return { at: best.at, ms: best.at - anchor, window: best.window, kind: 'window' };
    }

    /** One window's reset clause: `11-23 08:00 重置（剩 2 天）`. */
    function resetClauseOf(window, t, now) {
      const reset = stampOf(window.resetsAt);
      if (reset === '') return t('quotaWindowResetUnknown');
      const left = remainText(msUntil(window.resetsAt, now), t);
      const clause = t('quotaWindowResets', { time: reset });
      return left === '' ? clause : clause + t('quotaLeftSuffix', { left });
    }

    /** One window's hover line: label, used percent and the reset clause. */
    function windowLineOf(window, t, now) {
      return t('quotaWindowLine', {
        label: windowLong(window, t),
        percent: Math.round(safeCount(window.percent)),
        reset: resetClauseOf(window, t, now),
      });
    }

    /** Short window label used in dense figures (`5h16%`). */
    function windowShort(key, t) {
      if (key === 'rolling') return t('quotaWinRolling');
      if (key === 'weekly') return t('quotaWinWeekly');
      if (key === 'monthly') return t('quotaWinMonthly');
      return String(key);
    }

    /**
     * A credit amount, rounded for a tooltip: credits are decimal on the wire
     * (`9223.54`) but the last hundredth never changes a decision, and the raw
     * value in WorkBuddy's body has 20+ digits of float noise in it.
     */
    function credits(amount) {
      const value = Number(amount);
      if (!Number.isFinite(value)) return '';
      // Two decimals, then strip only a trailing `.00` — never the significant
      // ones. A big total rounds to whole credits because at that scale the
      // hundredths are noise, but a bucket with 226 of 3700 left is exactly the
      // number someone reads off the tooltip.
      const fixed = value >= 1000 ? value.toFixed(0) : value.toFixed(2);
      return fixed.replace(/\.00$/u, '');
    }

    /**
     * Short label for one window *as the vendor names it*.
     *
     * Two vocabularies meet here. OpenCode Go reports fixed buckets
     * (`rolling`/`weekly`/`monthly`) that the plugin translates; WorkBuddy
     * reports buckets with their own Chinese names (`套餐积分`/`奖励积分`) and no
     * fixed key at all. A vendor-supplied `label` therefore wins — translating a
     * key this plugin has never seen would print `plan_base` at the user.
     */
    function windowName(window, t) {
      const label = window !== null && typeof window === 'object' ? window.label : undefined;
      if (typeof label === 'string' && label !== '') return label;
      return windowShort(window !== null && typeof window === 'object' ? window.key : undefined, t);
    }

    /**
     * Tone of one usage window: colour carries "which limit is about to bite",
     * so three bare numbers stay readable at a glance — 90%+ errors, 70%+ warns,
     * everything else stays a plain secondary label.
     */
    function windowTone(percent) {
      const value = safeCount(percent);
      if (value >= 90) return 'crit';
      if (value >= 70) return 'warn';
      return 'calm';
    }

    /**
     * Long window label used in tooltips and tiles; same precedence as
     * {@link windowName} — the vendor's own bucket name first, a known key second.
     */
    function windowLong(window, t) {
      const label = window !== null && typeof window === 'object' ? window.label : undefined;
      if (typeof label === 'string' && label !== '') return label;
      const key = window !== null && typeof window === 'object' ? window.key : window;
      if (key === 'rolling') return t('quotaWinRollingLong');
      if (key === 'weekly') return t('quotaWinWeeklyLong');
      if (key === 'monthly') return t('quotaWinMonthlyLong');
      return String(key);
    }

    /** Display name of one quota source. */
    function sourceName(source, t) {
      if (source === 'opencode-go') return t('quotaSourceOpencode');
      if (source === 'deepseek') return t('quotaSourceDeepseek');
      if (source === 'workbuddy') return t('quotaSourceWorkbuddy');
      return String(source || '');
    }

    /**
     * The subscription behind a window-based source, or `null`.
     *
     * WorkBuddy sends it because its credits are not a rolling window: the
     * countdown that matters is "when does this plan run out", and no credit
     * bucket answers that. DeepSeek/OpenCode Go never send it, and their
     * countdown keeps coming from the longest window's reset instead.
     */
    function planOf(raw) {
      if (raw === null || raw === undefined || typeof raw !== 'object') return null;
      const name = typeof raw.name === 'string' ? raw.name : '';
      const code = typeof raw.code === 'string' ? raw.code : '';
      const expiresAt = typeof raw.expiresAt === 'string' && raw.expiresAt !== '' ? raw.expiresAt : null;
      if (name === '' && code === '' && expiresAt === null) return null;
      return { name, code, paid: raw.paid === true, expiresAt };
    }

    /** The lump credit figure across every bucket, or `null`. */
    function totalsOf(raw) {
      if (raw === null || raw === undefined || typeof raw !== 'object') return null;
      const pick = (value) => {
        const amount = Number(value);
        return Number.isFinite(amount) && amount >= 0 ? amount : null;
      };
      const total = pick(raw.total);
      const remain = pick(raw.remain);
      if (total === null && remain === null) return null;
      return {
        total,
        remain,
        used: pick(raw.used),
        unit: typeof raw.unit === 'string' && raw.unit !== '' ? raw.unit : 'credits',
      };
    }

    /**
     * Normalize one Host route body. `unconfigured` (no provider key) and
     * `failed` stay distinct from a real zero balance, which would read as
     * "out of credit".
     */
    function quotaSnapshotOf(payload) {
      const base = {
        source: QUOTA_DEFAULT_SOURCE, kind: null, wallets: [], windows: [], available: true,
        // `plan` / `totals` are WorkBuddy-only extras: the subscription behind the
        // credits and one lump figure for "how much is left". Every other source
        // leaves them null, and null is what every formatter treats as absent.
        plan: null, totals: null,
      };
      if (payload === null || typeof payload !== 'object') {
        return { ...base, status: 'failed', at: 0 };
      }
      const source = typeof payload.source === 'string' && payload.source !== '' ? payload.source : QUOTA_DEFAULT_SOURCE;
      if (payload.status !== 'ready') {
        return {
          ...base,
          source,
          status: payload.status === 'unconfigured' ? 'unconfigured' : 'failed',
          at: safeCount(payload.at),
        };
      }
      if (payload.kind === 'windows') {
        const windows = [];
        for (const window of Array.isArray(payload.windows) ? payload.windows : []) {
          if (window === null || typeof window !== 'object') continue;
          const percent = Number(window.percent);
          if (!Number.isFinite(percent)) continue;
          const row = {
            key: String(window.key || ''),
            percent: Math.max(0, Math.min(100, percent)),
            status: typeof window.status === 'string' ? window.status : 'ok',
            resetsAt: typeof window.resetsAt === 'string' ? window.resetsAt : null,
          };
          // A vendor that names its own buckets (WorkBuddy's credit packages)
          // sends a label; the fixed rolling/weekly/monthly trio does not.
          if (typeof window.label === 'string' && window.label !== '') row.label = window.label;
          for (const field of ['total', 'remain']) {
            const amount = Number(window[field]);
            if (Number.isFinite(amount) && amount >= 0) row[field] = amount;
          }
          windows.push(row);
        }
        return {
          ...base,
          source,
          status: 'ready',
          kind: 'windows',
          windows,
          plan: planOf(payload.plan),
          totals: totalsOf(payload.totals),
          at: safeCount(payload.at),
        };
      }
      const wallets = [];
      for (const wallet of Array.isArray(payload.wallets) ? payload.wallets : []) {
        if (wallet === null || typeof wallet !== 'object') continue;
        const total = Number(wallet.total);
        if (!Number.isFinite(total)) continue;
        wallets.push({
          currency: wallet.currency === 'USD' ? 'USD' : 'CNY',
          total,
          toppedUp: Number.isFinite(Number(wallet.toppedUp)) ? Number(wallet.toppedUp) : 0,
          granted: Number.isFinite(Number(wallet.granted)) ? Number(wallet.granted) : 0,
        });
      }
      return {
        ...base,
        source,
        status: 'ready',
        kind: 'balance',
        available: payload.available !== false,
        wallets,
        at: safeCount(payload.at),
      };
    }

    /** Compact figure for the sidebar foot. */
    function quotaFigure(snapshot, t) {
      if (snapshot.status === 'ready') {
        if (snapshot.kind === 'windows') {
          if (snapshot.windows.length === 0) return t('quotaEmpty');
          return snapshot.windows
            .map((window) => windowName(window, t) + ' ' + Math.round(window.percent) + '%')
            .join(' · ');
        }
        const total = moneyList(snapshot.wallets);
        return total === '' ? t('quotaEmpty') : total;
      }
      if (snapshot.status === 'loading') return t('quotaLoading');
      if (snapshot.status === 'nostore') return t('quotaNoSource');
      if (snapshot.status === 'unconfigured') return t('quotaUnconfigured');
      if (snapshot.status === 'failed') return t('quotaFailed');
      return '';
    }

    /**
     * KPI figure: the window closest to its cap, because a tile is narrower than
     * the foot card and "which limit is about to bite" is the question it
     * answers. The other windows stay in the foot gauges and the hover text.
     */
    function quotaTileValue(snapshot, t) {
      if (snapshot.status === 'ready' && snapshot.kind === 'windows') {
        if (snapshot.windows.length === 0) return t('quotaEmpty');
        let tightest = snapshot.windows[0];
        for (const window of snapshot.windows) if (window.percent > tightest.percent) tightest = window;
        return windowName(tightest, t) + ' ' + Math.round(tightest.percent) + '%';
      }
      return quotaFigure(snapshot, t) || '—';
    }

    /**
     * Hover text: the source, how long the subscription has left, every window or
     * wallet, and the read time. The countdown is the answer to "when does my paid
     * time end", which no single window label states.
     */
    function quotaDetail(snapshot, t, now) {
      const lines = [t('quotaTitle') + (snapshot.status === 'ready' ? '（' + sourceName(snapshot.source, t) + '）' : '')];
      if (snapshot.status === 'ready' && snapshot.kind === 'windows') {
        // Which plan is paying — only sources that name it (WorkBuddy) show this.
        const plan = snapshot.plan;
        if (plan !== null && plan !== undefined && plan.name !== '') {
          lines.push(plan.code === '' ? plan.name : plan.name + '（' + plan.code + '）');
        }
        const cycle = quotaCycleOf(snapshot, now);
        if (cycle !== null) {
          lines.push(t('quotaCycleLine', {
            time: stampOfMs(cycle.at),
            left: remainText(cycle.ms, t),
          }));
          // The hint explains an inference. When the vendor states the expiry
          // outright there is nothing to explain, so it is not printed.
          if (cycle.kind === 'window') lines.push(t('quotaCycleHint'));
        }
        for (const window of snapshot.windows) lines.push(windowLineOf(window, t, now));
        const totals = snapshot.totals;
        if (totals !== null && totals !== undefined
          && Number.isFinite(totals.remain) && Number.isFinite(totals.total)) {
          lines.push(t('quotaCreditsLine', {
            remain: credits(totals.remain),
            total: credits(totals.total),
          }));
        }
        if (snapshot.at > 0) lines.push(t('quotaUpdated', { time: clock(snapshot.at) }));
        // A cached first paint and a failed retry both leave a real figure on
        // screen, so the hover text has to say which one it is looking at.
        if (snapshot.stale === true) lines.push(t('quotaStale'));
        lines.push(t('quotaRefresh'));
      } else if (snapshot.status === 'ready') {
        lines.push(t('quotaTotal', { amount: moneyList(snapshot.wallets) || t('quotaEmpty') }));
        for (const wallet of snapshot.wallets) {
          lines.push(t('quotaSplit', {
            toppedUp: money2(wallet.toppedUp, wallet.currency),
            granted: money2(wallet.granted, wallet.currency),
          }));
        }
        if (snapshot.available === false) lines.push(t('quotaUnavailable'));
        if (snapshot.at > 0) lines.push(t('quotaUpdated', { time: clock(snapshot.at) }));
        if (snapshot.stale === true) lines.push(t('quotaStale'));
        lines.push(t('quotaRefresh'));
      } else if (snapshot.status === 'nostore') {
        // Say what is true: this provider bills per upstream key, so no single
        // allowance exists to display. A countdown here would be a lie.
        lines.push(t('quotaNoSource'));
        lines.push(t('quotaNoSourceHint'));
      } else if (snapshot.status === 'unconfigured') {
        lines.push(t('quotaUnconfigured'));
      } else if (snapshot.status === 'failed') {
        lines.push(t('quotaFailed'));
      }
      return lines.join('\n');
    }

    /**
     * KPI sub-line for the dashboard: the countdown, then the read time. The tile
     * value already names the tightest window and the hover text lists them all,
     * so repeating three percentages here only pushed the countdown onto a second
     * line.
     */
    function quotaSubOf(snapshot, t, now) {
      if (snapshot.status !== 'ready') return null;
      const parts = [];
      if (snapshot.kind === 'windows') {
        const cycle = quotaCycleOf(snapshot, now);
        if (cycle !== null) parts.push(remainText(cycle.ms, t));
      } else {
        for (const wallet of snapshot.wallets) {
          parts.push(t('quotaSplit', {
            toppedUp: money2(wallet.toppedUp, wallet.currency),
            granted: money2(wallet.granted, wallet.currency),
          }));
        }
      }
      if (parts.length === 0) return null;
      parts.push(t('quotaUpdated', { time: clock(snapshot.at) }));
      // The dashboard tile is a readout with no refresh gesture of its own, so it
      // says outright when the number is the last load's instead of a live read.
      if (snapshot.cached === true || snapshot.stale === true) parts.push(t('quotaCached'));
      return parts.length === 0 ? null : parts.join(' · ');
    }

    /**
     * Provider id → the quota source that can actually answer for it.
     *
     * Provider ids are the authoritative signal: a model id says nothing about
     * whose account pays. The same `deepseek-v4.1-flash` is served by the
     * DeepSeek platform, by OpenCode, and by a self-hosted gateway, and only the
     * provider says which one.
     *
     * A provider that is *absent* here has no quota to display — that is a
     * deliberate outcome, not a gap to fill:
     *
     *   - `ai-router` is the user's own multi-backend gateway (`ai.lighthouses.net`
     *     style). It fans out to oc-go / oc-zen / openrouter / gemini / … and bills
     *     per *upstream key*, with `quota_requests`/`quota_tokens` null on the
     *     gateway key itself. Its `/health` describes *backends*, never the
     *     caller's allowance, so there is no honest number to show. Reading the
     *     OpenCode windows here would be wrong twice over: the gateway may route
     *     to any backend, and those windows belong to a different key.
     *   - `deepseek` / `opencode*` are the first-party platforms, where a wallet
     *     or consumption window really does describe what is left.
     *   - `workbuddy` is the WorkBuddy gateway (the user's shim in front of
     *     Tencent's copilot endpoint). Its allowance *is* readable — credits per
     *     package — but only the shim holds the account token, so the Host reads
     *     the shim's `/quota` instead of the vendor. That makes it a real source,
     *     not a `NO_SOURCE` gateway: the shim answers for exactly one account.
     */
    const SOURCE_OF_PROVIDER = {
      'opencode': 'opencode-go',
      'opencode-go': 'opencode-go',
      'opencode-go-v41': 'opencode-go',
      'deepseek': 'deepseek',
      'deepseek-account': 'deepseek',
      'deepseek-official': 'deepseek',
      'workbuddy': 'workbuddy',
      'workbuddy-shim': 'workbuddy',
    };

    /**
     * The route's provider has no quota to read. Distinct from "no route yet":
     * the first waits for information, this one has the information and it says
     * there is nothing to show. The foot renders no figure in both cases, but
     * only this one keeps the hover text explaining *why*.
     */
    const NO_SOURCE = 'none';

    /**
     * Classify one request route.
     * @param provider - provider id recorded on the request.
     * @param model - model id recorded on the request.
     * @param label - the model's display name, when the catalog has it.
     * @param known - the gateway's own answer for this route (`/v1/models` row
     *   `quota.source`): a source id, or `null` for "settled, no readable
     *   allowance". `undefined` means the gateway did not classify this route, so
     *   the provider id and the display name below decide instead.
     * @returns the quota source, `NO_SOURCE` when the provider is known to have
     *   no quota to read, or `null` when the route names no vendor at all.
     */
    function sourceOfRoute(provider, model, label, known) {
      // The gateway is the party that actually bills, so its structured answer
      // wins: it already resolved `backends` for this row, which is the only
      // place the real platform is stated as data rather than as a rendering.
      if (known === null) return NO_SOURCE;
      if (typeof known === 'string' && known !== '') return known;
      const id = String(provider || '').trim().toLowerCase();
      if (id !== '' && SOURCE_OF_PROVIDER[id] !== undefined) return SOURCE_OF_PROVIDER[id];
      // A gateway route still names which account pays — in the model's display
      // name, not in its provider id. `ai-router` fronts WorkBuddy, OpenCode Go,
      // OpenRouter and friends, and its rows are labelled
      // `<平台> · <计费> · <名字>` precisely so the picker says who serves them.
      // Reading that first segment is what makes a WorkBuddy-backed model on the
      // gateway show WorkBuddy's credits instead of「无额度可查」.
      const platform = platformOfLabel(label) ?? platformOfLabel(model);
      if (platform !== null) return platform;
      if (id !== '') return NO_SOURCE;
      // Without a provider only OpenCode's own product name can classify a
      // route; a bare model id names no plan, and neither does a gateway.
      const text = String(model || '');
      if (/opencode/i.test(text)) return 'opencode-go';
      return null;
    }

    /**
     * Provider labels a gateway puts in front of a model name, mapped to the
     * quota source that can answer for them.
     *
     * These are the same labels `host/model-sync/naming.js` emits, lowered so a
     * label lookup is case-insensitive. A label absent here has no readable
     * allowance (OpenRouter, SiliconFlow, Gemini, …), which makes the route
     * `NO_SOURCE` — the honest answer, not a guess.
     */
    const SOURCE_OF_PLATFORM_LABEL = {
      'workbuddy': 'workbuddy',
      'opencode go': 'opencode-go',
      'opencode zen': 'opencode-go',
    };

    /**
     * Quota source named by the platform segment of a model label, or `null`.
     *
     * The label is `<平台> · <计费> · <名字>[ · <窗口>]`, so only the first
     * segment is a provider; a model *named* "WorkBuddy" by some other backend
     * would not match, because that word would sit in the third segment.
     *
     * @param label - a model display name, or a bare model id.
     * @returns a source id, or `null` when the label names no readable plan.
     */
    function platformOfLabel(label) {
      if (typeof label !== 'string' || label === '') return null;
      const segments = label.split('·');
      // A single segment is a plain model name with no platform in front of it —
      // nothing to classify, so the caller keeps looking. Two or more means the
      // generator emitted `<平台> · …`, and an unlisted platform then *is* the
      // answer: that backend has no allowance this plugin can read.
      if (segments.length < 2) return null;
      const head = segments[0].trim().toLowerCase();
      if (head === '') return null;
      return SOURCE_OF_PLATFORM_LABEL[head] ?? NO_SOURCE;
    }

    /**
     * Route one session's timeline is *set to*.
     *
     * The timeline exposes `current` (written by a model switch before any
     * request runs, stamped with its own time) and `requests` (the routes that
     * actually billed). A switch must move the foot immediately — asking the user
     * to send a message before the quota catches up is the same bug in slower
     * form — but a stale switch must not outrank a newer request elsewhere, so
     * `current` carries a time and is compared like any other route.
     */
    function routeOfSession(projections, id) {
      const values = projections[id] === undefined ? undefined : projections[id].values;
      const timeline = values === undefined || values === null ? undefined : values.tcTimeline;
      if (timeline === undefined || timeline === null) return undefined;
      const list = timeline.requests;
      const last = Array.isArray(list) && list.length > 0 ? list[list.length - 1] : undefined;
      const current = timeline.current;
      if (current === null || typeof current !== 'object') return last;
      if (typeof current.model !== 'string' || current.model === '') return last;
      const currentTime = safeCount(current.time);
      if (last !== undefined && safeCount(last.time) >= currentTime) return last;
      return { time: currentTime, provider: current.provider, model: current.model };
    }

    /** One side of the `modelSelection` projection, or `undefined` when unnamed. */
    function selectionOf(value) {
      if (value === null || typeof value !== 'object') return undefined;
      if (typeof value.provider !== 'string' || value.provider === '') return undefined;
      if (typeof value.model !== 'string' || value.model === '') return undefined;
      const selection = { provider: value.provider, model: value.model };
      if (typeof value.label === 'string' && value.label !== '') selection.label = value.label;
      return selection;
    }

    /**
     * The route a session is *set to*: what its composer points at right now.
     *
     * `modelSelection.next` is exactly the composer's choice — a pending switch
     * in the durable selection fold, with `lastUsed` behind it once a request has
     * run. This is the answer for a session that is *not* working: the next turn
     * will bill the model named in the composer, so that model's plan is the one
     * to show. Falls back through the timeline for sessions whose selection
     * projection has not arrived yet.
     */
    function selectedRouteOfSession(projections, id) {
      const values = projections[id] === undefined ? undefined : projections[id].values;
      const selection = selectionOf(values === undefined || values === null ? undefined : values.modelSelection?.next);
      if (selection !== undefined) return selection;
      const lastUsed = selectionOf(values === undefined || values === null ? undefined : values.modelSelection?.lastUsed);
      if (lastUsed !== undefined) return lastUsed;
      const route = routeOfSession(projections, id);
      return route === undefined ? undefined : { provider: route.provider, model: route.model };
    }

    /**
     * The route a session is *actually working on* — the opposite question from
     * {@link selectedRouteOfSession}, and the reason a composer switch must not
     * move the figure mid-turn.
     *
     * `modelSelection.lastUsed` is the selection the latest recorded request ran
     * on; `pending` (exposed as `next`) is a switch that has not billed yet, so
     * it must *not* answer here: a turn still streaming on WorkBuddy would show
     * the OpenCode windows the user just picked for the *next* message. The
     * timeline's `current` is the request-header route and outranks it only when
     * the selection projection is absent.
     */
    function activeRouteOfSession(projections, id) {
      const values = projections[id] === undefined ? undefined : projections[id].values;
      const lastUsed = selectionOf(values === undefined || values === null ? undefined : values.modelSelection?.lastUsed);
      if (lastUsed !== undefined) return lastUsed;
      const route = routeOfSession(projections, id);
      if (route !== undefined) return { provider: route.provider, model: route.model };
      return selectedRouteOfSession(projections, id);
    }

    /**
     * The session the main view is showing, or `null`.
     *
     * Only `retainedBy.mainView` rows count: the sidebar footer belongs to the
     * whole app while the quota answers for one conversation, and the retained
     * row *is* that conversation. Everything else in the list — background
     * subagents, other workspaces, archived rows — is not what the user is
     * looking at, so it must not decide what the foot reports.
     */
    function currentSessionIdOf(sessions) {
      if (sessions === undefined || sessions === null) return null;
      const byId = sessions.byId;
      if (byId === undefined || byId === null) return null;
      for (const id of Array.isArray(sessions.ids) ? sessions.ids : Object.keys(byId)) {
        const row = byId[id];
        if (row === undefined || row === null) continue;
        if (safeCount(row.retainedBy?.mainView) > 0) return id;
      }
      return null;
    }

    /**
     * Whether one session is mid-work, read from the Session UI status map.
     *
     * A pending question counts as *still working*, on purpose: an agent that
     * stopped to ask something has not ended its turn, and answering it is not a
     * new conversation — the same route keeps paying, so the foot must keep
     * showing that route's plan instead of flipping to the composer's choice.
     */
    function runningOfSession(status, id) {
      if (status === undefined || status === null) return false;
      const entry = typeof status.get === 'function' ? status.get(id) : status[id];
      if (entry === undefined || entry === null) return false;
      if (entry.running === true) return true;
      const pending = entry.pendingInteraction;
      return pending !== undefined && pending !== null;
    }

    /**
     * Read the remembered vendor; `null` when absent, unreadable, or not a vendor.
     *
     * `NO_SOURCE` is never remembered. "This route has no allowance" is a fact
     * about one conversation's route, not a preference for the next session, and
     * seeding the foot from it made every blank conversation open on「此供应商
     * 无额度可查」even when its composer was set to a real, readable plan. A
     * value already in storage from an older build is dropped the same way.
     */
    function readStoredSource() {
      try {
        const stored = window.localStorage.getItem(QUOTA_SOURCE_KEY);
        if (typeof stored !== 'string' || stored === '' || stored === NO_SOURCE) return null;
        return stored;
      } catch { return null; }
    }

    /** Remember the vendor so a fresh blank session opens on the same plan. */
    function storeSource(source) {
      try {
        if (typeof source === 'string' && source !== '' && source !== NO_SOURCE) {
          window.localStorage.setItem(QUOTA_SOURCE_KEY, source);
        }
      } catch { /* storage disabled */ }
    }

    /**
     * Last good figure persisted for one source, or `null`.
     *
     * The point is the first paint after a reload: the store is rebuilt empty
     * every time the chunk loads, so without this the foot flashes「读取中…」
     * for a whole Host round-trip even though the number it had five seconds
     * ago is still the best answer available. A read older than
     * {@link QUOTA_CACHE_TTL_MS} is dropped — a stale percentage claims the plan
     * sits where it no longer does.
     *
     * @param source - the source id the surface is pointed at.
     * @param now - anchor for the age check; defaults to `Date.now()`.
     * @returns a `ready` snapshot flagged `cached: true`, or `null`.
     */
    function readCachedQuota(source, now) {
      if (typeof source !== 'string' || source === '' || source === NO_SOURCE) return null;
      let table;
      try {
        const raw = window.localStorage.getItem(QUOTA_CACHE_KEY);
        if (typeof raw !== 'string' || raw === '') return null;
        table = JSON.parse(raw);
      } catch { return null; }
      if (table === null || typeof table !== 'object' || Array.isArray(table)) return null;
      const entry = table[source];
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const snapshot = quotaSnapshotOf(entry.snapshot);
      if (snapshot.status !== 'ready' || snapshot.source !== source) return null;
      const at = safeCount(snapshot.at) > 0 ? safeCount(snapshot.at) : safeCount(entry.at);
      if (at <= 0) return null;
      const anchor = Number.isFinite(now) ? now : Date.now();
      const age = anchor - at;
      if (age > QUOTA_CACHE_TTL_MS) return null;
      // A window that already reset has its percentage replaced by the vendor,
      // not carried over: painting it would claim the new period is already at
      // the old period's usage.
      if (snapshot.kind === 'windows') {
        for (const window of snapshot.windows) {
          const reset = Date.parse(String(window.resetsAt || ''));
          if (Number.isFinite(reset) && reset <= anchor) return null;
        }
      }
      return { ...snapshot, at, cached: true };
    }

    /** Persist one ready figure per source; loading/failed/nostore are never cached. */
    function writeCachedQuota(snapshot) {
      if (snapshot === null || typeof snapshot !== 'object') return;
      if (snapshot.status !== 'ready') return;
      if (typeof snapshot.source !== 'string' || snapshot.source === '' || snapshot.source === NO_SOURCE) return;
      if (safeCount(snapshot.at) <= 0) return;
      let table = {};
      try {
        const raw = window.localStorage.getItem(QUOTA_CACHE_KEY);
        const parsed = typeof raw === 'string' && raw !== '' ? JSON.parse(raw) : null;
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) table = parsed;
      } catch { table = {}; }
      // `cached`/`stale` are view flags, not state to hand to the next load.
      const saved = { ...snapshot };
      delete saved.cached;
      delete saved.stale;
      table[snapshot.source] = { at: saved.at, snapshot: saved };
      try {
        window.localStorage.setItem(QUOTA_CACHE_KEY, JSON.stringify(table));
      } catch { /* storage disabled or full: the next read simply paints later */ }
    }

    /**
     * Per-service memo of {@link createComposerFace}, so a render does not build a
     * new face table every pass (the faces map outlives the component).
     *
     * @param directories - the `modelDirectories` service, or `undefined`.
     * @returns `(sessionId) => { read, subscribe }`.
     */
    const composerFaceCache = new WeakMap();
    function composerFaceOf(directories) {
      if (directories === undefined || directories === null) return createComposerFace(directories);
      let face = composerFaceCache.get(directories);
      if (face === undefined) {
        face = createComposerFace(directories);
        composerFaceCache.set(directories, face);
      }
      return face;
    }

    /** Display name of one selection in a model-directory snapshot. */
    function modelNameOf(state, selection) {
      const groups = Array.isArray(state?.groups) ? state.groups : [];
      for (const group of groups) {
        if (group.id !== selection.provider) continue;
        for (const model of Array.isArray(group.models) ? group.models : []) {
          if (model.id === selection.model) return String(model.name ?? '');
        }
      }
      return '';
    }

    /**
     * The composer's own model choice, read from the model-selection service.
     *
     * A blank session has no `modelSelection` projection yet — nothing has been
     * recorded, because nothing has run — so the projection cannot answer for a
     * fresh conversation. The composer seat does know: it renders
     * `modelDirectories.directoryFor(sessionId).store`, whose `current` is the
     * saved selection (and `pending` a switch still settling). That store is the
     * same one the picker in the input box writes to, which makes it the only
     * honest answer to "which model is this box set to".
     *
     * `useSyncExternalStore` needs a stable snapshot, so the face hands out one
     * flat `"provider\u0000model\u0000name"` key instead of a fresh object per
     * read; a session the service does not know yields `null`, which the caller
     * treats as "no opinion" and falls through to the projection.
     *
     * @param directories - the `modelDirectories` service, or `undefined`.
     * @returns `(sessionId) => { read, subscribe }` returning a selection key.
     */
    function createComposerFace(directories) {
      const empty = { read: () => null, subscribe: () => () => {} };
      const none = () => empty;
      if (directories === undefined || directories === null || typeof directories.directoryFor !== 'function') {
        return none;
      }
      const faces = new Map();
      return (sessionId) => {
        if (sessionId === null || sessionId === undefined) return empty;
        const cached = faces.get(sessionId);
        if (cached !== undefined) return cached;
        let store;
        try {
          store = directories.directoryFor(sessionId).store;
        } catch { return empty; }
        if (store === undefined || store === null || typeof store.getSnapshot !== 'function') return empty;
        const face = {
          read: () => {
            const state = store.getSnapshot();
            const selection = selectionOf(state?.pending) ?? selectionOf(state?.current);
            if (selection === undefined) return null;
            // Carry the display name as the third field: a gateway route puts
            // the real platform in it (`WorkBuddy · 付费 · …`), which the model
            // id alone cannot express.
            return selection.provider + '\u0000' + selection.model + '\u0000' + modelNameOf(state, selection);
          },
          subscribe: store.subscribe,
          /**
           * Display name of any route in this session's catalog.
           *
           * The same question as `read`, for a route the composer is *not* set
           * to: while a turn runs on a gateway, the paying plan is only named by
           * that model's display name, and the catalog is the only place it
           * exists. Empty when the catalog does not list the route.
           */
          describe: (provider, model) => modelNameOf(store.getSnapshot(), { provider, model }),
        };
        faces.set(sessionId, face);
        return face;
      };
    }

    /** Split a `createComposerFace` key back into a route, or `undefined`. */
    function routeOfComposerKey(key) {
      if (typeof key !== 'string' || key === '') return undefined;
      const parts = key.split('\u0000');
      if (parts.length < 2 || parts[0] === '' || parts[1] === '') return undefined;
      return { provider: parts[0], model: parts[1], label: parts[2] ?? '' };
    }

    /**
     * Pick the quota source to display, from the conversation in the main view.
     *
     * The question the foot answers is "what is left of the plan paying for what
     * I am looking at", so the answer depends on whether that conversation is
     * working right now:
     *
     *   - **Running** (or waiting on a question — an agent that stopped to ask
     *     has not ended its turn): the route the work *is* on, i.e.
     *     `modelSelection.lastUsed` / the billed timeline. A switch sitting in
     *     the composer is a promise about the next turn, and showing the new
     *     plan mid-turn is exactly the flash this function exists to prevent.
     *   - **Idle**: the route the composer is *set to*, because that is the plan
     *     the next message will bill.
     *
     * With no main-view session (a fresh app, the landing view, or nothing
     * retained yet) the remembered vendor stands in, and *only* it. Scanning
     * every other conversation for the newest route was the one thing this
     * function must not do: several sessions can run at once, on different
     * plans, so the "newest request anywhere" flips every few seconds — the foot
     * then alternates between one subscription's windows and「此供应商无额度可查」
     * (a gateway route read without its display name settles on `NO_SOURCE`).
     * The foot belongs to the app, but a *number* here always belongs to one
     * conversation; without one on screen there is no honest figure but the last
     * one the user actually saw.
     *
     * Two deliberate non-answers survive from before: `NO_SOURCE` for a provider
     * with no quota to read, and `null` while nothing has named a vendor — better
     * blank than another plan's numbers.
     *
     * @param sessions - the session list snapshot, or `undefined` before it arrives.
     * @param status - the Session UI status map (`running` / `pendingInteraction`).
     * @param composer - the composer's own selection for the main-view session
     *   (`{ provider, model }`), used when nothing has been recorded yet.
     * @param describe - `(provider, model) => display name` from the composer's
     *   catalog; the fallback way to name a gateway route's real platform.
     * @param quotaOf - `(provider, model) => source | null | undefined` from the
     *   gateway's own map (`quotaSourceIn`); preferred over the display name.
     * @returns a source id, `NO_SOURCE`, or `null` while nothing is known.
     */
    function sourceOfSessions(sessions, status, composer, describe, quotaOf) {
      const projections = sessions === undefined || sessions === null ? undefined : sessions.projectionsBySession;
      if (projections === undefined || projections === null) return readStoredSource();
      const current = currentSessionIdOf(sessions);
      // A retained conversation answers for itself. Without one, no number is
      // derived at all: other sessions' routes say nothing about what the user is
      // reading, and picking the newest of them is what made the foot oscillate
      // between plans (see the doc comment above).
      if (current !== null) {
        // Running work answers with what is actually billing; an idle session
        // answers with what its composer is set to. Recorded history outranks the
        // composer face, which only fills the gap a blank session leaves behind.
        const route = runningOfSession(status, current)
          ? activeRouteOfSession(projections, current)
          : (selectedRouteOfSession(projections, current) ?? selectionOf(composer));
        if (route !== undefined) {
          // The paying platform of a gateway route is named only by the model's
          // display name, which lives in the composer's catalog — for any route,
          // not just the selected one. The projection carries a bare provider id
          // and model id, which is not enough to tell WorkBuddy from OpenRouter
          // behind the same gateway.
          const label = route.label ?? describe?.(route.provider, route.model) ?? '';
          const stated = quotaOf?.(route.provider, route.model);
          const known = sourceOfRoute(route.provider, route.model, label, stated);
          if (known !== null) return known;
        }
      }
      return readStoredSource();
    }

    /**
     * Debounced view of {@link sourceOfSessions}.
     *
     * A candidate source must survive {@link QUOTA_SOURCE_DEBOUNCE_MS} before it
     * is committed, because the inputs behind it land in several passes — the
     * session list hydrating, the projections arriving, a turn closing, a status
     * frame landing — and each pass produces an intermediate answer. Reading a
     * source is not free of consequence: it paints a figure, and a figure that
     * lives for two frames is a flash. Holding the previous answer until the new
     * one settles removes the flicker without adding a perceptible delay.
     *
     * `settle(0)` commits immediately (a press, or a first paint that has nothing
     * to keep); the ordinary path is `settle(QUOTA_SOURCE_DEBOUNCE_MS)`.
     *
     * @param resolve - computes the current candidate on demand.
     * @param options.timer - `setTimeout` substitute, for tests.
     * @param options.materialize - decides whether a raw candidate is showable.
     * @param options.initial - a source already known before the first schedule
     *   (the remembered vendor), so the first paint has something real to show.
     * @returns `{ read, schedule, cancel, subscribe }` over the committed source.
     */
    function createSourceSettler(resolve, options = {}) {
      const timer = options.timer ?? ((fn, ms) => (ms > 0 ? setTimeout(fn, ms) : (fn(), 0)));
      const clear = options.clearTimer ?? ((handle) => { if (handle !== 0) clearTimeout(handle); });
      const isShowable = options.materialize ?? (() => true);
      const listeners = new Set();
      /**
       * Seed the committed value from the *remembered* source only.
       *
       * Seeding from this render's candidate would be the very flash the settler
       * exists to stop: on the first render after a reload the session list is
       * still arriving, so the candidate is a halfway state. The remembered
       * vendor is normally the same plan anyway, and when it is not, the real
       * answer replaces it once it has settled — one quiet swap beats a figure
       * that lives two frames.
       *
       * `read` is a `getSnapshot` for `useSyncExternalStore`, which requires a
       * stable reference until something really changed, so it never resolves on
       * demand: only `schedule` advances the committed value.
       */
      const seedStored = options.initial !== undefined && options.initial !== null ? options.initial : null;
      let committed = isShowable(seedStored) ? seedStored : null;
      let handle = 0;
      /** Publish one committed value to the React subscribers. */
      const commit = (next) => {
        if (next === committed) return;
        committed = next;
        for (const listener of [...listeners]) listener();
      };
      /** Drop a scheduled commit; the next `schedule` starts from scratch. */
      const cancel = () => { clear(handle); handle = 0; };
      /** The source the surface should act on right now. */
      const read = () => committed;
      /**
       * Ask for a re-evaluation. An unchanged candidate cancels a pending commit
       * (the intermediate answer did not survive); a source with nothing to show
       * commits at once, since there is no figure to keep on screen and
       * therefore no flash to avoid; everything else settles for `delayMs`.
       */
      const schedule = (delayMs = QUOTA_SOURCE_DEBOUNCE_MS) => {
        const raw = resolve();
        if (raw === committed) { cancel(); return committed; }
        cancel();
        if (delayMs <= 0 || !isShowable(raw)) {
          commit(raw);
          return committed;
        }
        handle = timer(() => {
          handle = 0;
          commit(resolve());
        }, delayMs);
        return committed;
      };
      const subscribe = (listener) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      };
      return { read, schedule, cancel, subscribe };
    }

    /**
     * Quota store. `attach(reader)` installs a reader plus its poll;
     * `detach()` withdraws both while keeping the React subscribers, so a route
     * that disappears and comes back leaves the button in place. `setSource`
     * re-reads whenever the session starts running on another vendor.
     *
     * The store starts with **no** source and stays idle until one is named.
     * Polling a guessed vendor is what made an OpenCode subscription display the
     * DeepSeek wallet: the route parameter defaulted to `deepseek`, so the very
     * first read after a reload ran against the wrong vendor and painted its
     * number before the session's own route was known.
     *
     * `NO_SOURCE` is a settled answer, not a missing one: the route was read and
     * the provider has no quota. The store then reports `nostore` so the surface
     * can explain itself instead of leaving a silent blank.
     *
     * A figure the last load already had is painted from {@link QUOTA_CACHE_KEY}
     * *before* the first read and then replaced silently: `loading` is only ever
     * shown when there is nothing to paint, which is what the foot showed on
     * every chunk reload. A read that fails while a good figure is on screen
     * keeps the figure and flags it `stale` rather than blanking it to「额度不可用」.
     */
    function createQuotaStore(options = {}) {
      const pollMs = options.pollMs ?? QUOTA_POLL_MS;
      const now = options.now ?? (() => Date.now());
      const listeners = new Set();
      let snapshot = { status: 'idle', source: null, kind: null, wallets: [], windows: [], at: 0 };
      let reader = null;
      /** Source id → the read currently running for it. */
      const inflight = new Map();
      let timer = null;
      const publish = (next) => {
        snapshot = next;
        for (const listener of [...listeners]) listener();
      };
      /** Publish a read result and remember it for the next load. */
      const settle = (next) => {
        publish(next);
        writeCachedQuota(next);
      };
      const refresh = (force) => {
        if (reader === null) return Promise.resolve(false);
        // A provider without quota is settled: never ask, never guess another.
        if (snapshot.source === NO_SOURCE) return Promise.resolve(false);
        // Nothing named the vendor yet: reading would answer for a plan that may
        // not be the one paying, so wait for `setSource` instead.
        if (typeof snapshot.source !== 'string' || snapshot.source === '') return Promise.resolve(false);
        // Only a surface with nothing to show says so; a cached figure stays up
        // while the read runs in the background.
        if (snapshot.status === 'idle') publish({ ...snapshot, status: 'loading' });
        // Reads are keyed by the source they asked about, for two reasons: the same
        // vendor's concurrent refreshes coalesce into one request, and switching
        // the model mid-flight neither lets the old answer land on the new
        // vendor's card nor makes the new vendor wait out the old request.
        const asking = snapshot.source;
        const pending = inflight.get(asking);
        if (pending !== undefined) return pending;
        const run = Promise.resolve()
          .then(() => reader(asking, force === true))
          .then((payload) => {
            if (snapshot.source !== asking) return false;
            const next = quotaSnapshotOf(payload);
            // The Host answers `failed` with HTTP 200 when the vendor call breaks;
            // that is not news worth a blank card either, so a good figure stays
            // up until a read actually succeeds.
            if (next.status === 'failed' && snapshot.status === 'ready') {
              publish({ ...snapshot, stale: true });
              return false;
            }
            settle(next);
            return true;
          },
            () => {
              // A failed read must not throw away a good figure: keep it, mark it
              // stale, and let the next poll repair it.
              if (snapshot.source !== asking) return false;
              if (snapshot.status === 'ready') publish({ ...snapshot, stale: true });
              else publish({ status: 'failed', source: asking, kind: null, wallets: [], windows: [], at: 0 });
              return false;
            });
        const promise = run.finally(() => {
          if (inflight.get(asking) === promise) inflight.delete(asking);
        });
        inflight.set(asking, promise);
        return promise;
      };
      const detach = () => {
        if (timer !== null) clearInterval(timer);
        timer = null;
        reader = null;
        // Reads already in flight may still land, but a re-attached store must not
        // be blocked by them: a re-provisioned route starts from a clean slate.
        inflight.clear();
        if (snapshot.status === 'loading') publish({ ...snapshot, status: 'idle' });
      };
      return {
        subscribe(listener) {
          listeners.add(listener);
          return () => { listeners.delete(listener); };
        },
        getSnapshot() { return snapshot; },
        attach(read) {
          reader = typeof read === 'function' ? read : null;
          if (reader === null) return;
          if (timer === null) timer = setInterval(() => { void refresh(false); }, pollMs);
          void refresh(false);
        },
        /**
         * Read again when the page comes back from a hidden tab or from a
         * suspended laptop, where no interval fired for hours. Cheap on the Host
         * side: a non-forced read reuses its own cache inside the freshness
         * window.
         */
        revalidate() {
          if (snapshot.source === null || snapshot.source === NO_SOURCE) return Promise.resolve(false);
          return refresh(false);
        },
        detach,
        refresh,
        /**
         * Point the store at one source. A change first paints that source's
         * remembered figure (if any), then reads in the background; without one
         * the surface shows `loading`. `null` = not known yet (idle), `NO_SOURCE`
         * = known to have no quota (`nostore`); neither issues a read for it.
         */
        setSource(source) {
          const next = typeof source === 'string' && source !== '' ? source : null;
          if (next === snapshot.source) return;
          if (next === NO_SOURCE) {
            publish({ status: 'nostore', source: next, kind: null, wallets: [], windows: [], at: 0 });
            return;
          }
          if (next === null) {
            publish({ status: 'idle', source: null, kind: null, wallets: [], windows: [], at: 0 });
            return;
          }
          const cached = readCachedQuota(next, now());
          publish(cached !== null
            ? { ...cached, source: next }
            : { status: 'idle', source: next, kind: null, wallets: [], windows: [], at: 0 });
          if (reader !== null) void refresh(false);
        },
        dispose() { detach(); listeners.clear(); },
      };
    }

    /** Subscribe one component to the quota store. */
    function useQuota(store) {
      return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    }

    /** Read the Host route; a non-2xx answer is a failure, never a zero balance. */
    async function readQuotaRoute(source, force, fetchImpl) {
      const params = new URLSearchParams({ source: String(source || QUOTA_DEFAULT_SOURCE) });
      if (force === true) params.set('force', '1');
      const response = await fetchImpl(QUOTA_URL + '?' + params.toString(), { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('quota route ' + String(response.status));
      return response.json();
    }


    function pct(part, whole) {
      if (!(whole > 0)) return 0;
      return Math.max(0, Math.min(100, part / whole * 100));
    }

    function fmtDuration(ms) {
      const n = safeCount(ms);
      if (n <= 0) return '—';
      if (n < 1000) return n.toFixed(0) + 'ms';
      if (n < 60000) return (n / 1000).toFixed(1) + 's';
      const minutes = Math.floor(n / 60000);
      const seconds = Math.round((n % 60000) / 1000);
      return minutes + 'm' + String(seconds).padStart(2, '0') + 's';
    }

    /** Beijing-time day key (`YYYY-MM-DD`) for a timestamp. */
    function beijingKey(ms) {
      return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);
    }

    /** Monday-first weekday index of a `YYYY-MM-DD` key. */
    function mondayIndex(key) {
      const day = new Date(key + 'T00:00:00Z').getUTCDay();
      return (day + 6) % 7;
    }

    function copyText(text) {
      try {
        if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => false);
      } catch { /* fall through */ }
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        return Promise.resolve(ok);
      } catch { return Promise.resolve(false); }
    }

    // ── §2.6 gateway model catalog (cache-first) ─────────────────────────────
    // Looking at models is a read, not a poll. Every surface that shows the
    // catalog paints what it already has — the Host's own stored list (the very
    // list the picker serves) plus this browser's last paint — and lets the Host
    // revalidate the gateway in the background. A refresh that brings new models
    // lands as a config write on the Host side; the next look here picks it up
    // silently. Nothing on this path makes the user wait for the gateway.

    /** Same-origin route registered by the Host half. */
    const MODELS_URL = '/dsh-session-insight/models';
    /** Last painted catalog, so a reload paints the list before the Host answers. */
    const MODELS_CACHE_KEY = 'dsh-session-insight:model-catalog';
    /** A persisted paint older than this is not worth showing; models move. */
    const MODELS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
    /** Follow-up look after a reply that reported a background refresh in flight. */
    const MODELS_FOLLOW_MS = 1500;
    /** Follow-ups stop here, so one stuck refresh cannot poll forever. */
    const MODELS_FOLLOW_TRIES = 8;

    /** Snapshot shape every catalog surface renders, cached or live. */
    function emptyCatalog() {
      return {
        phase: 'idle', route: null, settingsNs: null, baseURL: null,
        models: [], count: 0, syncedAt: null, stale: true, refreshing: false,
        last: null, error: null, addedIds: [], paintedFromCache: false, at: 0,
        quotaSources: null, quotaSourcesAt: null,
      };
    }

    /** The last paint this browser stored, or `null` when absent/expired/unusable. */
    function readCachedCatalog(now) {
      try {
        const raw = window.localStorage.getItem(MODELS_CACHE_KEY);
        if (raw === null) return null;
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.models)) return null;
        if (!(now - Number(parsed.at) < MODELS_CACHE_TTL_MS)) return null;
        return {
          ...emptyCatalog(),
          phase: 'cache', route: parsed.route ?? null, settingsNs: parsed.settingsNs ?? null,
          baseURL: parsed.baseURL ?? null, models: parsed.models, count: parsed.models.length,
          syncedAt: parsed.syncedAt ?? null, at: Number(parsed.at) || 0, paintedFromCache: true,
          quotaSources: parsed.quotaSources ?? null, quotaSourcesAt: parsed.quotaSourcesAt ?? null,
        };
      } catch { return null; }
    }

    /** Persist one paint; a later reload starts from it instead of an empty list. */
    function writeCachedCatalog(snapshot) {
      if (!Array.isArray(snapshot.models) || snapshot.models.length === 0) return;
      try {
        window.localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify({
          route: snapshot.route, settingsNs: snapshot.settingsNs, baseURL: snapshot.baseURL,
          models: snapshot.models, syncedAt: snapshot.syncedAt, at: snapshot.at,
          quotaSources: snapshot.quotaSources ?? null, quotaSourcesAt: snapshot.quotaSourcesAt ?? null,
        }));
      } catch { /* quota or privacy mode: the live read still works */ }
    }

    /**
     * Map one Host reply onto the snapshot, remembering which models this paint
     * had not shown yet — that is what marks a row「新增」after a silent refresh.
     */
    function catalogSnapshotOf(body, previous, at) {
      const models = Array.isArray(body?.models) ? body.models : [];
      const before = new Set((previous?.models ?? []).map(model => model?.id));
      const hadAny = before.size > 0;
      return {
        phase: 'live',
        route: typeof body?.route === 'string' ? body.route : null,
        settingsNs: typeof body?.settingsNs === 'string' ? body.settingsNs : null,
        baseURL: typeof body?.baseURL === 'string' ? body.baseURL : null,
        models,
        count: models.length,
        syncedAt: Number.isFinite(body?.syncedAt) ? body.syncedAt : null,
        stale: body?.stale === true,
        refreshing: body?.refreshing === true,
        last: body?.last ?? null,
        error: null,
        addedIds: hadAny ? models.map(model => model?.id).filter(id => id !== undefined && !before.has(id)) : [],
        paintedFromCache: false,
        // Model id → the billing source the gateway stated (`quota.source` on one
        // `/v1/models` row). Absent on an older Host; `null` values are settled
        // "no readable allowance", distinct from absent "nobody said".
        quotaSources: body?.quotaSources !== null && typeof body?.quotaSources === 'object' ? body.quotaSources : null,
        quotaSourcesAt: Number.isFinite(body?.quotaSourcesAt) ? body.quotaSourcesAt : null,
        at,
      };
    }

    /** One same-origin read; `force` also asks the Host to check the gateway now. */
    function readModelsRoute(force, fetchImpl) {
      const url = force === true ? MODELS_URL + '?force=1' : MODELS_URL;
      return Promise.resolve(fetchImpl(url, { headers: { accept: 'application/json' }, cache: 'no-store' }))
        .then((response) => {
          if (!response || response.ok !== true) throw new Error('http-' + String(response && response.status));
          return response.json();
        });
    }

    // ── the gateway's own billing-source map ────────────────────────────────
    /**
     * Which plan pays for which model, as **stated by the gateway**.
     *
     * The Host syncs a self-hosted gateway's `/v1/models` into the profile, and
     * `ai-shim` puts `quota: {source, basis}` on every row (its
     * `router/quota_source.py` derives it from the row's `backends`). That is the
     * authoritative answer to "whose subscription is this model on" — far better
     * than the display name, which is a rendering (`<平台> · <计费> · <名字>`) that
     * says nothing when the catalog has not loaded or the model id is new.
     *
     * The map is per **provider route**: the same model id (`deepseek-v4.1-flash`)
     * is served by OpenCode and by the gateway on different plans, so a map from
     * one route must never be applied to another.
     */
    const QUOTA_SOURCE_CACHE_KEY = 'dsh-session-insight:quota-sources';
    /** Persisted paints older than this are not worth trusting for a route decision. */
    const QUOTA_SOURCE_TTL_MS = 24 * 60 * 60 * 1000;
    /** Within this window a page load reuses the stored map without asking again. */
    const QUOTA_SOURCE_FRESH_MS = 5 * 60 * 1000;

    /** The last stored map, or `null` when absent/expired/unusable. */
    function readCachedQuotaSources(now) {
      try {
        const raw = window.localStorage.getItem(QUOTA_SOURCE_CACHE_KEY);
        if (raw === null) return null;
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') return null;
        if (typeof parsed.route !== 'string' || parsed.route === '') return null;
        if (parsed.sources === null || typeof parsed.sources !== 'object') return null;
        if (!(now - Number(parsed.at) < QUOTA_SOURCE_TTL_MS)) return null;
        return { route: parsed.route, sources: parsed.sources, at: Number(parsed.at) || 0 };
      } catch { return null; }
    }

    /** Persist one map so a reload decides with the gateway's answer, not a name. */
    function writeCachedQuotaSources(next) {
      try {
        window.localStorage.setItem(QUOTA_SOURCE_CACHE_KEY, JSON.stringify({
          route: next.route, sources: next.sources, at: next.at,
        }));
      } catch { /* storage disabled: the live read still answers */ }
    }

    /**
     * Read the gateway's source map, cache first.
     *
     * `readModelsRoute` is the Host's own route, answered from memory (the stored
     * catalog plus the last classified listing), so this is one cheap same-origin
     * GET per mount at worst — never a gateway round trip on the render path.
     *
     * @param fetchImpl - `fetch` seam.
     * @param now - clock seam.
     * @returns `{route, sources, at}`, or `null` when the Host has no map yet.
     */
    function loadQuotaSources(fetchImpl, now) {
      return readModelsRoute(false, fetchImpl).then((body) => {
        const route = typeof body?.route === 'string' ? body.route : null;
        const sources = body?.quotaSources !== null && typeof body?.quotaSources === 'object'
          ? body.quotaSources : null;
        if (route === null || sources === null) return null;
        const next = { route, sources, at: now() };
        writeCachedQuotaSources(next);
        return next;
      });
    }

    /**
     * The map as React state: a stored paint first (so the first frame already
     * decides with the gateway's answer), then one read when that paint is old.
     *
     * @param now - clock seam.
     * @returns `{route, sources, at} | null`.
     */
    function useQuotaSources(now = () => Date.now()) {
      const [state, setState] = React.useState(() => readCachedQuotaSources(now()));
      React.useEffect(() => {
        let live = true;
        const cached = readCachedQuotaSources(now());
        if (cached !== null) setState(cached);
        if (cached !== null && now() - cached.at < QUOTA_SOURCE_FRESH_MS) return () => { live = false; };
        loadQuotaSources((url, init) => fetch(url, init), now)
          .then((next) => { if (live && next !== null) setState(next); })
          .catch(() => { /* an unreachable Host leaves the stored map in place */ });
        return () => { live = false; };
      }, []);
      return state;
    }

    /**
     * Look up one route's billing source in the map.
     *
     * @param map - {@link useQuotaSources} result.
     * @param provider - the route's provider id.
     * @param model - the route's model id.
     * @returns a source id, `null` (the gateway settled "no readable allowance"),
     *   or `undefined` (this route is not the one the gateway classified — the
     *   caller keeps its own display-name fallback).
     */
    function quotaSourceIn(map, provider, model) {
      if (map === null || map === undefined) return undefined;
      if (map.route !== provider) return undefined;
      const sources = map.sources;
      if (sources === null || typeof sources !== 'object') return undefined;
      if (!Object.prototype.hasOwnProperty.call(sources, model)) return undefined;
      const value = sources[model];
      return typeof value === 'string' && value !== '' ? value : null;
    }

    /**
     * Cache-first catalog store shared by the settings header chip and the
     * catalog page: one read in flight, follow-ups only while the Host reports a
     * background revalidation, and a persisted paint for the next page load.
     */
    function createModelsStore(options = {}) {
      const now = options.now ?? (() => Date.now());
      const listeners = new Set();
      let snapshot = readCachedCatalog(now()) ?? emptyCatalog();
      let reader = null;
      let inflight = null;
      let timer = null;
      let tries = 0;
      const publish = (next) => {
        snapshot = next;
        for (const listener of [...listeners]) listener();
      };
      const settle = (next) => {
        publish(next);
        if (next.phase === 'live') writeCachedCatalog(next);
      };
      const clearFollow = () => {
        if (timer !== null) { clearTimeout(timer); timer = null; }
      };
      const read = (force) => {
        if (reader === null) return Promise.resolve(snapshot);
        if (inflight !== null) return inflight;
        if (snapshot.phase === 'idle' || snapshot.phase === 'cache') publish({ ...snapshot, phase: 'loading' });
        inflight = Promise.resolve()
          .then(() => reader(force === true))
          .then((body) => {
            const next = catalogSnapshotOf(body, snapshot, now());
            settle(next);
            clearFollow();
            if (next.refreshing && tries < MODELS_FOLLOW_TRIES) {
              tries += 1;
              timer = setTimeout(() => { timer = null; void read(false); }, MODELS_FOLLOW_MS);
            } else if (!next.refreshing) {
              tries = 0;
            }
            return next;
          })
          .catch((error) => {
            // A failed read keeps the painted list: an unreachable Host is not a
            // reason to claim there are no models.
            publish({
              ...snapshot,
              phase: snapshot.models.length > 0 ? 'stale' : 'error',
              refreshing: false,
              error: String(error && error.message ? error.message : error),
            });
            return snapshot;
          })
          .finally(() => { inflight = null; });
        return inflight;
      };
      return {
        attach(nextReader) { reader = nextReader; },
        read,
        force() { return read(true); },
        subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        getSnapshot() { return snapshot; },
        dispose() { clearFollow(); listeners.clear(); reader = null; },
      };
    }

    /** One model's declared capabilities, in the picker's own vocabulary. */
    function catalogCaps(model) {
      const input = Array.isArray(model?.input) ? model.input : [];
      const efforts = model?.reasoningEfforts;
      const levels = efforts !== null && typeof efforts === 'object' && !Array.isArray(efforts)
        ? Object.keys(efforts).filter(level => efforts[level] !== null)
        : [];
      return { image: input.includes('image'), text: input.length === 0 || input.includes('text'), levels };
    }

    /** Compact capacity: 1000000 → 1M, 960000 → 960K, absent → —. */
    function compactCapacity(value) {
      const n = safeCount(value);
      if (n <= 0) return '—';
      if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + 'M';
      if (n >= 1e3) return Math.round(n / 1e3) + 'K';
      return String(n);
    }

    /** Relative age of the last successful sync, in the user's language. */
    function syncAgeLabel(t, syncedAt, at) {
      if (!Number.isFinite(syncedAt) || syncedAt <= 0) return t('modelsNeverSynced');
      const diff = Math.max(0, at - syncedAt);
      if (diff < 60_000) return t('modelsSyncedJustNow');
      const unit = diff < 3_600_000 ? 'modelsAgeMinutes' : diff < 86_400_000 ? 'modelsAgeHours' : 'modelsAgeDays';
      const n = Math.floor(diff / (unit === 'modelsAgeMinutes' ? 60_000 : unit === 'modelsAgeHours' ? 3_600_000 : 86_400_000));
      return t('modelsSyncedAgo').replace('{age}', t(unit).replace('{n}', String(n)));
    }

    // ── §3 primitives ────────────────────────────────────────────────────────
    function Card({ title, meta, children, className, bodyClass }) {
      return h('section', { className: ['tc-card', className].filter(Boolean).join(' ') },
        h('div', { className: 'tc-card-head' },
          h('h3', null, title),
          meta === undefined || meta === null ? null : h('span', { className: 'tc-card-meta' }, meta)),
        h('div', { className: ['tc-card-body', bodyClass].filter(Boolean).join(' ') }, ...children));
    }

    function Empty({ text, icon, k }) {
      // `k` keeps list children keyed: this helper is used inside children arrays.
      return h('p', { className: 'tc-empty', key: k ?? 'empty' },
        icon === undefined ? null : h('span', { 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: icon } }),
        text);
    }

    /** One KPI tile: an icon + label line, the figure, and an optional sub line. */
    function Tile({ label, value, sub, tone, icon, hint }) {
      return h('div', { className: 'tc-tile', 'data-tone': tone || 'plain', title: hint },
        h('div', { className: 'tc-tile-top' },
          typeof icon === 'string' ? h('span', { 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: icon } }) : icon,
          h('span', null, label)),
        h('b', null, value),
        sub === undefined || sub === null ? null : h('div', { className: 'tc-tile-sub' }, sub));
    }

    const ICON = {
      turns: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7"/></svg>',
      steps: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M3 13V8m5 5V3m5 10V6"/></svg>',
      requests: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2 8h3l2-4 2 8 2-4h3"/></svg>',
      tokens: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><ellipse cx="8" cy="4" rx="4.6" ry="1.9"/><path d="M3.4 4v8c0 1 2 1.9 4.6 1.9s4.6-.9 4.6-1.9V4"/></svg>',
      cost: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M8 1.5v13M11.2 4.4H6.1a2 2 0 0 0 0 4h3.8a2 2 0 0 1 0 4H4.6"/></svg>',
      cache: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M8 1.6 14 5v6L8 14.4 2 11V5l6-3.4ZM2 5l6 3.4L14 5M8 8.4V14.4"/></svg>',
      sessions: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="M5 6.5h6M5 9.5h4"/></svg>',
      wallet: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2.4 5.1A1.6 1.6 0 0 1 4 3.5h8a1.6 1.6 0 0 1 1.6 1.6v6.6A1.6 1.6 0 0 1 12 13.3H4a1.6 1.6 0 0 1-1.6-1.6V5.1Z"/><path d="M2.4 6.4h11.2"/><circle cx="10.9" cy="9.8" r=".75" fill="currentColor" stroke="none"/></svg>',
    };

    /** Stacked proportion bar from `[{value,color,label}]`. */
    function StackBar({ items, height }) {
      const variant = height === 'lg' ? ' tc-bar-lg' : height === 'sm' ? ' tc-bar-sm' : '';
      const total = items.reduce((sum, item) => sum + safeCount(item.value), 0);
      if (total <= 0) return h('div', { className: 'tc-bar' + variant });
      return h('div', { className: 'tc-bar' + variant },
        ...items.filter(item => safeCount(item.value) > 0).map((item, index) => h('i', {
          key: index, title: item.label + ' · ' + (item.hint ?? ''),
          style: { width: (safeCount(item.value) / total * 100).toFixed(2) + '%', background: item.color },
        })));
    }

    /** A labelled row with its own proportional mini bar and a right-hand value. */
    function MeterRow({ label, color, value, max, right, hint }) {
      return h('div', { className: 'tc-row2', title: hint },
        h('span', null,
          color === undefined ? null : h('i', { className: 'tc-dot', style: { background: color } }),
          label),
        h('span', { className: 'tc-mini', 'aria-hidden': 'true' },
          h('i', { style: { width: pct(safeCount(value), safeCount(max) || 1).toFixed(1) + '%', background: color || 'var(--dsw-alias-state-business-primary)' } })),
        h('span', null, right));
    }

    /** Donut of proportion shares; `items` are `{value, color, label}`. */
    function Donut({ items, center, caption }) {
      const rows = items.filter(item => safeCount(item.value) > 0);
      const total = rows.reduce((sum, item) => sum + safeCount(item.value), 0);
      const radius = 42;
      const circumference = 2 * Math.PI * radius;
      let offset = 0;
      const arcs = rows.map((item, index) => {
        const share = safeCount(item.value) / total;
        const length = share * circumference;
        const arc = h('circle', {
          key: index, cx: 50, cy: 50, r: radius,
          stroke: item.color, strokeDasharray: length + ' ' + (circumference - length),
          strokeDashoffset: -offset, transform: 'rotate(-90 50 50)',
        });
        offset += length;
        return arc;
      });
      return h('div', { className: 'tc-donut' },
        h('svg', { viewBox: '0 0 100 100', role: 'img', 'aria-label': caption ?? '' },
          h('circle', { className: 'ring', cx: 50, cy: 50, r: radius }),
          ...arcs,
          h('text', { x: 50, y: 48, textAnchor: 'middle', className: 'tc-donut-center' }, center ?? ''),
          h('text', { x: 50, y: 60, textAnchor: 'middle' }, caption ?? '')),
        h('div', { className: 'tc-legend', style: { flexDirection: 'column', alignItems: 'flex-start', gap: 4 } },
          ...rows.map((item, index) => h('span', { key: index },
            h('i', { className: 'tc-dot', style: { background: item.color } }),
            item.label + ' ',
            h('b', null, (safeCount(item.value) / total * 100).toFixed(1) + '%')))));
    }

    /** Text of a content block list, ignoring image/file placeholders. */
    function textOfContent(content) {
      if (!Array.isArray(content)) return '';
      const parts = [];
      for (const block of content) {
        if (block === null || typeof block !== 'object') continue;
        if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
        else if (block.type === 'image') parts.push('[image]');
        else if (block.type === 'file') parts.push('[file]');
      }
      return parts.join('\n').trim();
    }

    /** Blocks of one assistant message as `{kind, title, text}` rows. */
    function assistantRows(blocks) {
      const rows = [];
      for (const block of Array.isArray(blocks) ? blocks : []) {
        if (block === null || typeof block !== 'object') continue;
        if (block.kind === 'text') rows.push({ kind: 'text', title: null, text: String(block.text ?? '') });
        else if (block.kind === 'reasoning') rows.push({ kind: 'reasoning', title: null, text: String(block.text ?? '') });
        else if (block.kind === 'tool-call') rows.push({ kind: 'tool-call', title: String(block.name ?? ''), text: String(block.argsRaw ?? '') });
        else if (block.kind === 'image') rows.push({ kind: 'image', title: null, text: '[image]' });
      }
      return rows.filter(row => row.text !== '' || row.title !== null);
    }

    /**
     * Content of one request, read from the chat snapshot the page already holds
     * (`legacy.nodes`): the user message that opened it, the assistant blocks of
     * its step, and the tool results produced for it. Nothing is fetched, and
     * nothing is written anywhere — this is the client's own copy of the surface.
     *
     * Legacy nodes carry no step on tool results, so a result belongs to the
     * request whose time window (previous request → this request) contains it.
     */
    function contentOfRequest(nodes, request, previousTime) {
      const list = Array.isArray(nodes) ? nodes : [];
      const time = safeCount(request?.time);
      const turn = request?.turn;
      const step = request?.step;
      let user = null;
      let assistant = null;
      let lastTurn = null;
      const tools = [];
      for (const node of list) {
        if (node === null || typeof node !== 'object') continue;
        const nodeTime = safeCount(node.time);
        if (node.kind === 'user') {
          if (nodeTime <= time) user = { time: nodeTime, text: textOfContent(node.content) };
          continue;
        }
        if (node.kind === 'assistant') {
          lastTurn = node.turn ?? lastTurn;
          if (node.turn === turn && node.step === step) assistant = { time: nodeTime, blocks: node.blocks };
          continue;
        }
        if (node.kind === 'tool-result') {
          if (nodeTime > time || nodeTime <= (previousTime ?? 0)) continue;
          const name = String(node.name || node.call?.name || '?');
          const args = String(node.call?.argsRaw ?? '');
          const text = textOfContent(node.content);
          if (args === '' && text === '') continue;
          tools.push({ name, args, text, isError: node.isError === true, turn: lastTurn });
        }
      }
      return { user, assistant, tools };
    }

    /** A chip that toggles a list filter; the same chip shows its own count. */
    function FilterChip({ label, count, on, onClick, tone }) {
      return h('button', {
        type: 'button', className: 'tc-chip', role: 'button',
        'data-tone': tone ?? undefined, 'data-on': on ? 'true' : 'false',
        'aria-pressed': on ? 'true' : 'false', onClick,
      }, label + (count === undefined ? '' : ' ' + fmtInt(count)));
    }

    /** Area sparkline; points are `{value, label}` oldest → newest. */
    function Sparkline({ points, format, caption }) {
      const w = 100;
      const hgt = 100;
      const values = points.map(point => point.value);
      const max = Math.max(1, ...values);
      const min = Math.min(...values, 0);
      const span = max - min || 1;
      const step = points.length > 1 ? w / (points.length - 1) : w;
      const xy = (value, index) => [index * step, hgt - ((value - min) / span) * (hgt - 10) - 5];
      const line = points.map((point, index) => xy(point.value, index).map(n => n.toFixed(2)).join(',')).join(' ');
      const area = `0,${hgt} ${line} ${w.toFixed(2)},${hgt}`;
      const last = points[points.length - 1];
      const lastPoint = xy(last.value, points.length - 1);
      const grid = h('g', null,
        h('line', { className: 'grid', x1: 0, y1: hgt - 5, x2: w, y2: hgt - 5 }),
        h('line', { className: 'grid', x1: 0, y1: 5, x2: w, y2: 5 }));
      return h('div', null,
        h('svg', {
          className: 'tc-spark', viewBox: `0 0 ${w} ${hgt}`, preserveAspectRatio: 'none', role: 'img',
          'aria-label': caption ?? '',
        },
          grid,
          points.length > 1 ? h('polygon', { className: 'area', points: area }) : null,
          points.length > 1 ? h('polyline', { className: 'line', points: line }) : null,
          h('circle', { className: 'dot', cx: lastPoint[0], cy: lastPoint[1], r: 1.8 })),
        h('div', { className: 'tc-legend', style: { marginTop: 4, justifyContent: 'space-between' } },
          h('span', null, caption ?? ''),
          h('span', null, [last.label, format === undefined ? '' : format(last.value)].filter(Boolean).join(' · '))));
    }

    // ── §4 cards ─────────────────────────────────────────────────────────────
    function CompositionCard({ t, breakdown, pressure }) {
      const system = safeCount(breakdown?.systemTokens);
      const tools = safeCount(breakdown?.toolsTokens);
      const messages = safeCount(breakdown?.messageTokens);
      const heuristic = system + tools + messages;
      const windowSize = safeCount(pressure?.contextWindow);
      const used = safeCount(pressure?.projectedTokens ?? pressure?.pressureTokens) || heuristic;
      const total = Math.max(used, heuristic, windowSize, 1);
      const rows = [
        [t('system'), system, COLORS.system],
        [t('tools'), tools, COLORS.tools],
        [t('messages'), messages, COLORS.messages],
      ];
      const share = pct(used, windowSize || total);
      return Card({
        title: t('currentTitle'),
        meta: t('used') + ' ' + fmtInt(used) + (windowSize ? ' / ' + fmtInt(windowSize) : ''),
        className: 'tc-col-4',
        children: [
          // Composition bar: the three sources normalised to what is in use, so
          // the split stays readable even at 1% of a 1M window.
          StackBar({
            items: rows.map(([label, value, color]) => ({ value, color, label, hint: fmtInt(value) })),
            height: 'lg',
          }),
          h('div', { className: 'tc-rows' }, ...rows.map(([label, value, color], index) =>
            MeterRow({
              key: index, label, color, value, max: heuristic || 1,
              right: fmtInt(value) + ' · ' + pct(value, heuristic || 1).toFixed(0) + '%',
              hint: label,
            }))),
          windowSize > 0
            ? h('div', null,
              h('div', { className: 'tc-cap' },
                h('span', null, t('window') + ' ' + fmtInt(windowSize)),
                h('span', null, share.toFixed(1) + '%')),
              h('div', { className: 'tc-mini tc-mini-lg', 'aria-hidden': 'true' },
                h('i', {
                  style: {
                    width: Math.max(1, share).toFixed(1) + '%',
                    background: 'var(--dsw-alias-state-business-primary)',
                  },
                })))
            : null,
          h('p', { className: 'tc-note' }, t('estimateNote')),
        ],
      });
    }

    function TokenCard({ t, pricing, usage, summary, currency }) {
      const rows = BUCKETS.map((key, index) => ({
        key,
        label: [t('input'), t('cacheRead'), t('cacheWrite'), t('output')][index],
        color: [COLORS.input, COLORS.cacheRead, COLORS.cacheWrite, COLORS.output][index],
        tokens: safeCount(usage?.[['uncachedInputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens'][index]]),
        cost: summary.byBucket[key],
      }));
      const total = rows.reduce((sum, row) => sum + row.tokens, 0);
      const hit = total > 0 ? safeCount(usage?.cacheReadTokens) / total * 100 : null;
      return Card({
        title: t('tokenTitle'),
        meta: hit === null ? null : t('kpiCache') + ' ' + hit.toFixed(1) + '%',
        className: 'tc-col-4',
        children: [
          // The ring carries the share picture; the rows below carry the numbers.
          Donut({
            items: rows.map(row => ({ value: row.tokens, color: row.color, label: row.label })),
            center: fmtShort(total),
            caption: t('tokenTotal'),
          }),
          StackBar({ items: rows.map(row => ({ value: row.tokens, color: row.color, label: row.label, hint: fmtInt(row.tokens) })) }),
          h('div', { className: 'tc-rows' }, ...rows.map(row => MeterRow({
            key: row.key, label: row.label, color: row.color, value: row.tokens, max: total || 1,
            right: fmtInt(row.tokens) + ' · ' + pct(row.tokens, total || 1).toFixed(0) + '% · ' + money(pricing, row.cost, currency),
            hint: row.label,
          }))),
          h('div', { className: 'tc-note' }, t('tokenTotal') + ' ' + fmtInt(total) + ' tok'),
        ],
      });
    }

    function CostCard({ t, pricing, summary, currency }) {
      const bucketRows = [
        [t('input'), summary.byBucket.input, COLORS.input],
        [t('cacheRead'), summary.byBucket.cacheRead, COLORS.cacheRead],
        [t('output'), summary.byBucket.output, COLORS.output],
      ].filter(row => row[1] > 0);
      const secondary = currency === 'CNY'
        ? { label: 'USD', value: pricing.formatUsd(summary.usd) }
        : { label: 'CNY', value: pricing.formatCny(summary.cny) };
      const tier = summary.peak > 0 && summary.offPeak > 0
        ? t('mixedTierShort')
        : (summary.peak > 0 ? t('peakShort') : (summary.offPeak > 0 ? t('offPeakShort') : null));
      return Card({
        title: t('costTitle'),
        meta: tier,
        className: 'tc-col-4',
        children: [
          h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } },
            h('span', { style: {
              fontSize: 26, lineHeight: '32px', fontWeight: 600, letterSpacing: '-.02em',
              fontVariantNumeric: 'tabular-nums', color: 'var(--dsw-alias-label-primary)',
            } }, money(pricing, summary.cost, currency)),
            h('span', { className: 'tc-chip' }, secondary.label + ' ' + secondary.value)),
          StackBar({
            items: bucketRows.map(([label, value, color]) => ({ value, color, label, hint: money(pricing, value, currency) })),
          }),
          h('div', { className: 'tc-legend' }, ...bucketRows.map(([label, value, color], index) =>
            h('span', { key: index }, h('i', { className: 'tc-dot', style: { background: color } }),
              label + ' ', h('b', null, money(pricing, value, currency))))),
          h('div', { className: 'tc-dl' },
            h('dt', null, t('requests')), h('dd', null, String(summary.known)),
            summary.unknown > 0 ? h('dt', null, t('unknown')) : null,
            summary.unknown > 0 ? h('dd', null, String(summary.unknown)) : null),
          h('p', { className: 'tc-note' }, t('costTip')),
        ],
      });
    }

    function ModelCostCard({ t, pricing, summary, currency, className }) {
      const rows = summary.models.slice(0, 6);
      return Card({
        title: t('modelTitle'),
        meta: rows.length === 0 ? null : rows.length + ' / ' + summary.models.length,
        className: className || 'tc-col-4',
        children: rows.length === 0
          ? [Empty({ text: t('modelEmpty') })]
          : [h('div', { className: 'tc-rows' }, ...rows.map(row => MeterRow({
            key: row.model, label: row.model, color: 'var(--dsw-alias-state-business-primary)',
            value: row.cost, max: rows[0].cost || 1,
            right: money(pricing, row.cost, currency) + ' · ' + pct(row.cost, summary.cost || 1).toFixed(0) + '%',
            hint: row.model + ' · ' + fmtInt(row.tokens) + ' tok · ' + row.requests + ' ' + t('modelRequests'),
          })))],
      });
    }

    function TrendCard({ t, pricing, timeline, tier, currency }) {
      const metricState = React.useState('tokens');
      const metric = metricState[0];
      const setMetric = metricState[1];
      const requests = Array.isArray(timeline?.requests) ? timeline.requests.slice(-40) : [];
      const points = requests.map(request => {
        const tokens = safeCount(request.totalTokens);
        if (metric === 'cost') {
          const priced = priceRequest(pricing, request, tier, currency);
          return { value: priced ? priced.amount : 0, label: 'T' + String(request.turn ?? '') + '/' + String(request.step ?? '') };
        }
        if (metric === 'cache') {
          return { value: tokens > 0 ? safeCount(request.cacheRead) / tokens * 100 : 0, label: 'T' + String(request.turn ?? '') };
        }
        return { value: tokens, label: 'T' + String(request.turn ?? '') };
      });
      const format = metric === 'cost'
        ? (value => money(pricing, value, currency))
        : (metric === 'cache' ? (value => value.toFixed(0) + '%') : (value => fmtInt(Math.round(value))));
      const segment = (value, label) => h('button', {
        key: value, type: 'button', className: 'tc-btn', 'aria-pressed': metric === value ? 'true' : 'false',
        onClick: () => setMetric(value),
      }, label);
      return Card({
        title: t('trendTitle'),
        meta: requests.length === 0 ? null : t('trendNow') + ' ' + format(points[points.length - 1].value),
        className: 'tc-col-4',
        children: [
          h('div', { className: 'tc-toolbar' },
            h('div', { className: 'tc-seg', role: 'group', 'aria-label': t('trendTitle') },
              segment('tokens', t('trendTokens')), segment('cost', t('trendCost')), segment('cache', t('trendCache')))),
          points.length < 2
            ? Empty({ text: t('trendEmpty') })
            : Sparkline({
              points,
              format,
              caption: t('trendPeak') + ' ' + format(Math.max(...points.map(point => point.value))),
            }),
        ],
      });
    }

    function TimingCard({ t, stats }) {
      const ttft = safeCount(stats?.ttftSteps) > 0 ? safeCount(stats?.ttftMs) / stats.ttftSteps : 0;
      const tps = safeCount(stats?.decodeMs) > 0 ? safeCount(stats?.decodeTokens) / (stats.decodeMs / 1000) : 0;
      const rows = [
        [t('timingLlm'), fmtDuration(stats?.llmMs)],
        [t('timingTool'), fmtDuration(stats?.toolMs)],
        [t('timingTtft'), fmtDuration(ttft)],
        [t('timingTps'), tps > 0 ? tps.toFixed(1) + ' tok/s' : '—'],
        [t('timingDecode'), fmtDuration(stats?.decodeMs)],
      ];
      return Card({
        title: t('timingTitle'),
        className: 'tc-col-4',
        children: [h('dl', { className: 'tc-dl' }, ...rows.flatMap(([label, value], index) =>
          [h('dt', { key: 'd' + index }, label), h('dd', { key: 'v' + index }, value)]))],
      });
    }

    /** File activity folded from file-touching tool calls. */
    /**
     * One strip of session counters plus the two distributions the tab was
     * missing: how many tool calls each tool served, and which programs the
     * commands used. Counts and names only — no arguments or output text.
     */
    function StatsCard({ t, timeline, turnCount, steps, requests }) {
      const counts = timeline?.counts ?? {};
      const tools = Object.entries(timeline?.toolCalls ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
      const programs = new Map();
      for (const command of Array.isArray(timeline?.commands) ? timeline.commands : []) {
        const key = commandProgram(command);
        programs.set(key, (programs.get(key) ?? 0) + 1);
      }
      const programRows = [...programs].sort((a, b) => b[1] - a[1]).slice(0, 8);
      const toolTotal = Object.values(timeline?.toolCalls ?? {}).reduce((sum, n) => sum + safeCount(n), 0);
      const stat = (key, label, value) => h('div', { className: 'tc-stat', key },
        h('span', null, label), h('b', null, value));
      return Card({
        title: t('statsTitle'),
        meta: requests > 0 ? t('requests') + ' ' + fmtInt(requests) : null,
        className: 'tc-col-12',
        children: [
          h('div', { className: 'tc-stats' },
            stat('turns', t('turns'), String(turnCount)),
            stat('steps', t('steps'), fmtInt(steps)),
            stat('user', t('userMsgs'), fmtInt(counts.user)),
            stat('answers', t('answers'), fmtInt(counts.answers)),
            stat('skills', t('skillLoads'), fmtInt(counts.skills)),
            stat('tools', t('toolCalls'), fmtInt(toolTotal))),
          h('div', { className: 'tc-cols', style: { marginTop: 12 } },
            h('div', null,
              h('p', { className: 'tc-sub' }, t('statsTools')),
              tools.length === 0
                ? Empty({ text: t('toolsEmpty'), k: 'tools' })
                : h('div', { className: 'tc-rows' }, ...tools.map(([name, value]) => MeterRow({
                  key: name, label: name, value,
                  max: tools[0][1] || 1, right: fmtInt(value),
                  hint: name + ' · ' + fmtInt(value),
                })))),
            h('div', null,
              h('p', { className: 'tc-sub' }, t('statsCommands')),
              programRows.length === 0
                ? Empty({ text: t('cmdEmpty'), k: 'cmd' })
                : h('div', { className: 'tc-rows' }, ...programRows.map(([name, value]) => MeterRow({
                  key: name, label: name, value,
                  max: programRows[0][1] || 1, right: fmtInt(value),
                  hint: name + ' · ' + fmtInt(value),
                }))))),
        ],
      });
    }

    /**
     * Shell / code executions: program distribution on top, and the ledger with
     * status and wall time below. Filters stay inside the card (program chips +
     * status segments + search), so no other card is disturbed.
     */
    function CommandsCard({ t, commands }) {
      const all = Array.isArray(commands) ? commands : [];
      const queryState = React.useState('');
      const query = queryState[0];
      const setQuery = queryState[1];
      const statusState = React.useState('all');
      const status = statusState[0];
      const setStatus = statusState[1];
      const programState = React.useState(null);
      const program = programState[0];
      const setProgram = programState[1];

      const programs = new Map();
      for (const command of all) {
        const key = commandProgram(command);
        programs.set(key, (programs.get(key) ?? 0) + 1);
      }
      const programRows = [...programs].sort((a, b) => b[1] - a[1]).slice(0, 8);

      const needle = query.trim().toLowerCase();
      const rows = all
        .filter(command => status === 'all' || command.status === status)
        .filter(command => program === null || commandProgram(command) === program)
        .filter(command => needle === ''
          || commandProgram(command).toLowerCase().includes(needle)
          || String(command.call ?? '').toLowerCase().includes(needle))
        .slice()
        .reverse()
        .slice(0, 60);

      const failed = all.filter(command => command.status === 'error').length;
      const running = all.filter(command => command.status === 'running').length;
      const statusChip = (value, label, count) => h('button', {
        key: value, type: 'button', className: 'tc-btn',
        'aria-pressed': status === value ? 'true' : 'false',
        onClick: () => setStatus(value),
      }, label + (count === undefined ? '' : ' ' + fmtInt(count)));

      return Card({
        title: t('cmdTitle'),
        meta: all.length === 0 ? null
          : t('cmdStatus') + ' · ' + t('cmdOk') + ' ' + fmtInt(all.length - failed - running)
            + (failed > 0 ? ' · ' + t('cmdError') + ' ' + fmtInt(failed) : ''),
        className: 'tc-col-6',
        children: all.length === 0
          ? [Empty({ text: t('cmdEmpty') })]
          : [
            h('div', { className: 'tc-chips' },
              ...programRows.map(([name, count]) => FilterChip({
                key: 'p' + name, label: name, count,
                on: program === name,
                onClick: () => setProgram(program === name ? null : name),
              }))),
            h('div', { className: 'tc-toolbar' },
              h('input', {
                className: 'tc-input', type: 'search', value: query, placeholder: t('cmdSearch'),
                'aria-label': t('cmdSearch'),
                onChange: event => setQuery(event.currentTarget.value),
              }),
              h('div', { className: 'tc-seg', role: 'group', 'aria-label': t('cmdStatus') },
                statusChip('all', t('cmdAll'), all.length),
                statusChip('ok', t('cmdOk')),
                statusChip('error', t('cmdError'), failed || undefined),
                statusChip('running', t('cmdRunning'), running || undefined))),
            rows.length === 0
              ? Empty({ text: t('cmdNoMatch') })
              : h('div', { className: 'tc-table', style: { maxHeight: 260 } }, ...rows.map((command, index) => h('div', {
                className: 'tc-cmd', key: (command.seq ?? 0) + ':' + index,
                title: String(command.call ?? '') + '\n' + (command.turn === null ? '' : 'T' + command.turn),
              },
                h('span', { className: 'tc-path', style: { direction: 'ltr' } }, commandProgram(command)),
                h('code', null, String(command.call ?? '')),
                h('span', { className: 'tc-meta' },
                  command.durationMs === null || command.durationMs === undefined
                    ? null : h('span', null, fmtDuration(command.durationMs)),
                  h('i', {
                    className: 'tc-chip',
                    'data-tone': command.status === 'error' ? 'write'
                      : (command.status === 'ok' ? 'ok' : 'read'),
                  }, command.status === 'error' ? t('cmdError')
                    : (command.status === 'ok' ? t('cmdOk') : t('cmdRunning'))))))),
          ],
      });
    }

    /**
     * File activity: one row per touched file with read / write / search counts,
     * the estimated `+added / −removed` line change, and an expandable operation
     * log (one entry per call, newest first). Filters are local to the card.
     */
    function FileActivityCard({ t, files, fileOps }) {
      const kindState = React.useState('all');
      const kind = kindState[0];
      const setKind = kindState[1];
      const queryState = React.useState('');
      const query = queryState[0];
      const setQuery = queryState[1];
      const openState = React.useState(null);
      const openPath = openState[0];
      const setOpenPath = openState[1];

      const ops = Array.isArray(fileOps) ? fileOps : [];
      const entries = Object.entries(files ?? {})
        .map(([path, row]) => ({
          path, ...row,
          total: safeCount(row.reads) + safeCount(row.writes) + safeCount(row.searches),
        }))
        .filter(row => row.total > 0);
      const totals = {
        read: entries.reduce((sum, row) => sum + safeCount(row.reads), 0),
        write: entries.reduce((sum, row) => sum + safeCount(row.writes), 0),
        search: entries.reduce((sum, row) => sum + safeCount(row.searches), 0),
      };
      const needle = query.trim().toLowerCase();
      const rows = entries
        .filter(row => kind === 'all'
          || (kind === 'read' && safeCount(row.reads) > 0)
          || (kind === 'write' && safeCount(row.writes) > 0)
          || (kind === 'search' && safeCount(row.searches) > 0))
        .filter(row => needle === '' || row.path.toLowerCase().includes(needle))
        .sort((a, b) => b.total - a.total || b.last - a.last)
        .slice(0, 40);
      const chip = (tone, label, value) => (value
        ? h('i', { className: 'tc-chip', 'data-tone': tone }, label + value) : null);
      const delta = (added, removed) => (added || removed
        ? h('span', { className: 'tc-delta' },
          h('b', { className: 'add' }, '+' + fmtInt(added)), ' ',
          h('b', { className: 'del' }, '−' + fmtInt(removed)))
        : null);

      return Card({
        title: t('filesTitle'),
        meta: entries.length === 0 ? null : String(entries.length),
        className: 'tc-col-6',
        children: entries.length === 0
          ? [Empty({ text: t('filesEmpty') })]
          : [
            h('div', { className: 'tc-chips' },
              FilterChip({ label: t('filesAll'), count: entries.length, on: kind === 'all', onClick: () => setKind('all') }),
              FilterChip({ label: t('filesRead'), count: totals.read, on: kind === 'read', tone: 'read', onClick: () => setKind('read') }),
              FilterChip({ label: t('filesWrite'), count: totals.write, on: kind === 'write', tone: 'write', onClick: () => setKind('write') }),
              FilterChip({ label: t('filesSearch'), count: totals.search, on: kind === 'search', onClick: () => setKind('search') })),
            h('div', { className: 'tc-toolbar' },
              h('input', {
                className: 'tc-input', type: 'search', value: query, placeholder: t('filesFilter'),
                'aria-label': t('filesFilter'),
                onChange: event => setQuery(event.currentTarget.value),
              })),
            rows.length === 0
              ? Empty({ text: t('filesNoMatch') })
              : h('ul', { className: 'tc-list' }, ...rows.map(row => {
                const open = openPath === row.path;
                const history = ops.filter(op => op.path === row.path).slice(-6).reverse();
                return h('li', {
                  key: row.path, title: row.path,
                  style: { flexDirection: 'column', alignItems: 'stretch', gap: 2, cursor: history.length > 0 ? 'pointer' : 'default' },
                  onClick: () => setOpenPath(open ? null : row.path),
                },
                  h('span', { style: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 } },
                    h('span', { className: 'tc-path', style: { flex: 1 } },
                      row.path.length > 56 ? '…' + row.path.slice(-55) : row.path),
                    delta(safeCount(row.added), safeCount(row.removed)),
                    h('span', { style: { display: 'inline-flex', gap: 4, flex: 'none' } },
                      chip('read', 'R', row.reads), chip('write', 'W', row.writes),
                      chip(undefined, 'S', row.searches))),
                  open && history.length > 0
                    ? h('ul', { className: 'tc-log' }, ...history.map((op, index) => h('li', {
                      key: index, className: 'tc-op',
                    },
                      new Date(safeCount(op.time)).toLocaleString() + ' · '
                        + (op.kind === 'read' ? t('filesRead') : (op.kind === 'search' ? t('filesSearch') : t('filesWrite')))
                        + (op.turn === null ? '' : ' · T' + op.turn),
                      op.added || op.removed ? ' ' : '',
                      op.added || op.removed ? delta(op.added, op.removed) : null)))
                    : null);
              })),
          ],
      });
    }

    /**
     * The Agent family around one session: parent, self, children and
     * grandchildren, each carrying the tokens and official-price cost of its own
     * session log. Members come from the session tree (`parentId`); the task
     * board is outside this plugin's read model.
     */
    function familyRows(sessions, sessionId, pricing, tier, currency, now) {
      const byId = sessions?.byId ?? {};
      const projections = sessions?.projectionsBySession ?? {};
      const me = byId[sessionId];
      const parent = me?.parentId ? byId[me.parentId] : undefined;
      const children = Object.values(byId).filter(row => row && row.parentId === sessionId);
      const grandchildren = [];
      for (const child of children) {
        for (const row of Object.values(byId)) {
          if (row && row.parentId === child.id && row.id !== sessionId) grandchildren.push(row);
        }
      }
      const seen = new Set();
      const members = [];
      const add = (row, role) => {
        if (!row || seen.has(row.id)) return;
        seen.add(row.id);
        members.push({ row, role, activity: projections[row.id]?.values?.tcActivity });
      };
      add(parent, 'parent');
      add(me, 'self');
      for (const row of children) add(row, 'child');
      for (const row of grandchildren) add(row, 'child');
      const rows = members.map(({ row, role, activity }) => {
        let tokens = 0;
        let cost = 0;
        for (const dayRow of Object.values(activity?.days ?? {})) {
          tokens += safeCount(dayRow.tokens);
          for (const [model, slot] of Object.entries(dayRow.byModel ?? {})) {
            const amount = priceModelSlot(pricing, slot, model, tier, currency, now);
            if (amount !== null) cost += amount;
          }
        }
        return {
          id: row.id, role,
          title: String(row.displayTitle ?? row.title ?? row.id),
          running: row.running === true,
          tokens, cost, updatedAt: safeCount(row.updatedAt),
        };
      });
      rows.sort((a, b) => (a.role === 'self' ? -1 : b.role === 'self' ? 1 : b.updatedAt - a.updatedAt));
      return rows;
    }

    /** This session's Agent family, priced from each member's own log. */
    function AgentNetworkCard({ t, pricing, sessions, sessionId, tier, currency }) {
      const rows = familyRows(sessions, sessionId, pricing, tier, currency, Date.now());
      const familyCost = rows.reduce((sum, row) => sum + row.cost, 0);
      const roleLabel = role => (role === 'self' ? t('fleetSelf') : (role === 'parent' ? t('fleetParent') : t('fleetChild')));
      return Card({
        title: t('agentsTitle'),
        meta: rows.length === 0 ? null : t('fleetCost') + ' ' + money(pricing, familyCost, currency),
        className: 'tc-col-6',
        children: rows.length === 0
          ? [Empty({ text: t('agentsEmpty') })]
          : [
            h('ul', { className: 'tc-list' }, ...rows.map(row => h('li', {
              key: row.id, title: row.title,
              style: { paddingLeft: row.role === 'child' ? 14 : 0 },
            },
              h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 } },
                h('i', { className: 'tc-chip', 'data-tone': row.role === 'self' ? 'ok' : 'read' }, roleLabel(row.role)),
                h('span', { className: 'tc-path' }, row.title.slice(0, 48))),
              h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 8, flex: 'none' } },
                row.running ? h('i', { className: 'tc-chip', 'data-tone': 'write' }, t('agentsRunning')) : null,
                h('span', { className: 'tc-strong' }, fmtInt(row.tokens) + ' tok · ' + money(pricing, row.cost, currency)))))),
            h('p', { className: 'tc-note', style: { marginTop: 8 } }, t('fleetTaskNote')),
          ],
      });
    }

    /**
     * The item-level answer to "what is actually in the context": the system
     * prompt's sections, every tool definition's own price, the message areas
     * per kind, and the heaviest surviving items — all from the Host's
     * `tcSurface` projection, with its own local search and sorting.
     *
     * `contextBreakdown` says total 175K split 8K / 17K / 166K; this card says
     * which tool schema takes 2.3K, which prompt section takes 9K, and which
     * tool result takes 40K.
     */
    function SurfaceCard({ t, surface }) {
      const [tab, setTab] = React.useState('system');
      const [query, setQuery] = React.useState('');
      const [sort, setSort] = React.useState('tokens');
      // Which row is open, per tab: `{ [tab]: key }`. One open at a time keeps
      // a 40-section prompt readable instead of 40 expanded blocks.
      const [open, setOpen] = React.useState({});
      const kinds = surface?.kinds ?? {};
      const system = surface?.system ?? null;
      const tools = surface?.tools ?? null;
      const top = Array.isArray(surface?.top) ? surface.top : [];
      const sections = Array.isArray(system?.sections) ? system.sections : [];
      const toolRows = Array.isArray(tools?.rows) ? tools.rows : [];
      const kindKeys = ['user', 'assistant', 'reasoning', 'call', 'result', 'developer', 'other'];
      const kindLabels = {
        user: 'surfaceKindUser', assistant: 'surfaceKindAssistant', reasoning: 'surfaceKindReasoning',
        call: 'surfaceKindCall', result: 'surfaceKindResult', developer: 'surfaceKindDeveloper',
        other: 'surfaceKindOther',
      };
      const kindColors = {
        user: COLORS.input, assistant: COLORS.output, reasoning: COLORS.cacheRead, call: COLORS.tools,
        result: COLORS.messages, developer: COLORS.system, other: COLORS.cacheWrite,
      };
      const messageTotal = kindKeys.reduce((sum, key) => sum + safeCount(kinds[key]?.tokens), 0);
      const needle = query.trim().toLowerCase();
      const order = (a, b) => (sort === 'name'
        ? String(a.text).localeCompare(String(b.text))
        : safeCount(b.value) - safeCount(a.value));
      const hit = (row, ...fields) => needle === ''
        || fields.some(field => String(field ?? '').toLowerCase().includes(needle));

      // Every tab yields the same row shape: a key, a label, the item's own
      // short preview, its price, and — crucially — the full body the reader
      // can expand. Search covers the body too, so "where does it say X" works.
      const sectionRows = sections
        .map((section, index) => ({
          key: 'sec' + index, text: section.label, hint: section.preview,
          value: safeCount(section.tokens), body: section.body ?? '',
          truncated: section.truncated === true, chars: safeCount(section.chars),
        }))
        .filter(row => hit(row, row.text, row.hint, row.body))
        .sort(order);
      const toolList = toolRows
        .map((row, index) => ({
          key: 'tool' + index, text: row.name, hint: row.description,
          value: safeCount(row.tokens), body: row.body ?? '',
          truncated: row.truncated === true, chars: safeCount(row.chars),
        }))
        .filter(row => hit(row, row.text, row.hint, row.body))
        .sort(order);
      // A message row needs an identity, not a category: six "reasoning" rows in
      // a row are indistinguishable without the turn/step they came from.
      const topRows = top
        .map((row, index) => {
          const kind = t(kindLabels[row.kind] ?? 'surfaceKindOther');
          const where = row.turn ? 'T' + row.turn + '/' + String(row.step ?? '') : '';
          return {
            key: 'top' + index,
            text: (where ? where + ' · ' : '') + (row.label ? row.label + ' · ' : '') + kind,
            hint: row.preview, value: safeCount(row.tokens), kind: row.kind,
            turn: row.turn, step: row.step, body: row.preview ?? '', chars: 0,
          };
        })
        .filter(row => hit(row, row.text, row.hint))
        .sort(order);

      const openKey = open[tab] ?? null;
      const toggle = key => setOpen({ ...open, [tab]: open[tab] === key ? null : key });

      // Magnitude is shown twice on purpose: the bar is relative to the biggest
      // row (a shape cue for the tab), the share is relative to the bucket the
      // tab represents (an absolute one). A 9K section is a tall bar AND "51% of
      // the system prompt" — the second is the number that answers the question.
      const buckets = [
        { id: 'system', label: 'system', color: COLORS.system, value: safeCount(system?.tokens) },
        { id: 'tools', label: 'tools', color: COLORS.tools, value: safeCount(tools?.total) },
        { id: 'messages', label: 'messages', color: COLORS.messages, value: messageTotal },
      ];
      const contextTotal = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
      const bucketOf = { system: safeCount(system?.tokens), tools: safeCount(tools?.total), top: messageTotal };
      const tabTotal = bucketOf[tab] ?? 0;

      const renderRows = (rows, extra) => h('div', { className: 'tc-rows' }, ...rows.map((row, index) => {
        const expanded = openKey === row.key;
        const share = tabTotal > 0 ? pct(row.value, tabTotal) : 0;
        const accent = extra === undefined ? undefined : kindColors[row.kind];
        return h('div', {
          key: row.key, className: 'tc-item', 'data-open': expanded ? 'true' : 'false',
          'data-lead': index === 0 ? 'true' : 'false',
          style: accent === undefined ? undefined : { '--tc-item-accent': accent },
        },
          h('button', {
            type: 'button', className: 'tc-item-head', 'aria-expanded': expanded ? 'true' : 'false',
            onClick: () => toggle(row.key),
            title: (row.hint ? row.hint + '\n' : '') + fmtInt(row.value) + ' tok · '
              + share.toFixed(1) + '%' + (row.turn ? ' · T' + row.turn + '/' + String(row.step ?? '') : ''),
          },
            h('span', { className: 'tc-item-caret', 'aria-hidden': 'true' }, expanded ? '▾' : '▸'),
            // Always rendered, even without a kind: an omitted cell would shift
            // every following column of that one row out of alignment.
            h('i', {
              className: 'tc-item-dot', 'aria-hidden': 'true',
              style: { background: accent ?? 'transparent' },
            }),
            h('span', { className: 'tc-item-name' }, row.text),
            h('span', { className: 'tc-item-hint', title: hintOf(row.hint, row.text) || undefined }, hintOf(row.hint, row.text)),
            h('span', { className: 'tc-item-bar', 'aria-hidden': 'true' },
              h('i', { style: { width: pct(row.value, rows[0]?.value || 1).toFixed(1) + '%' } })),
            h('span', { className: 'tc-item-value' }, fmtInt(row.value)),
            h('span', { className: 'tc-item-share' }, share.toFixed(share >= 9.95 ? 0 : 1) + '%')),
          expanded
            ? h('div', { className: 'tc-item-body' },
              h('p', { className: 'tc-item-meta' },
                h('span', { className: 'tc-item-tag', 'data-tone': 'accent' },
                  h('b', null, fmtInt(row.value)), ' tok'),
                h('span', { className: 'tc-item-tag' }, fmtInt(share.toFixed(1)) + '% ' + t('surfaceOfBucket')),
                row.chars ? h('span', { className: 'tc-item-tag' },
                  h('b', null, fmtInt(row.chars)), ' ' + t('surfaceUnitChars')) : null,
                row.turn
                  ? h('span', { className: 'tc-item-tag' }, 'T' + row.turn + '/' + String(row.step ?? ''))
                  : null,
                row.truncated
                  ? h('span', { className: 'tc-item-tag', 'data-tone': 'warn' }, t('surfaceBodyTruncated'))
                  : null),
              h('pre', {
                className: 'tc-item-text', 'data-empty': row.body === '' ? 'true' : 'false',
              }, row.body === '' ? t('surfaceBodyEmpty') : row.body))
            : null);
      }));

      const emptyOf = text => Empty({ text, k: 'surface-empty' });
      let body;
      let tabCount = 0;
      let tabUnit = 'surfaceUnitSections';
      if (tab === 'tools') {
        tabCount = toolRows.length;
        tabUnit = 'surfaceUnitTools';
        body = toolList.length === 0 ? emptyOf(t('surfaceToolsEmpty')) : renderRows(toolList);
      } else if (tab === 'system') {
        tabCount = sections.length;
        body = sectionRows.length === 0 ? emptyOf(t('surfaceSystemEmpty')) : renderRows(sectionRows);
      } else {
        tabCount = top.length;
        tabUnit = 'surfaceUnitItems';
        body = topRows.length === 0 ? emptyOf(t('surfaceTopEmpty')) : renderRows(topRows, true);
      }
      const shownRows = tab === 'tools' ? toolList.length : tab === 'system' ? sectionRows.length : topRows.length;

      // Level 1 — one bar for the whole window. The system prompt is 5% of it,
      // which is the single most useful thing this card can say up front.
      const legend = items => h('div', { className: 'tc-legend' }, ...items.map((item, index) =>
        h('span', { key: index, title: item.label + ' · ' + fmtInt(item.value) + ' tok' },
          h('i', { className: 'tc-dot', style: { background: item.color } }),
          item.label,
          h('b', null, fmtInt(item.value)),
          h('em', { style: { fontStyle: 'normal', opacity: .75 } },
            (item.total > 0 ? pct(item.value, item.total).toFixed(1) : '0.0') + '%'))));
      // One horizontal band, not a stack of three rows: the summary has to be
      // readable in a glance and must not push the list further down the card.
      const composeBlock = h('div', { className: 'tc-compose' },
        h('span', { className: 'tc-compose-label' }, t('surfaceCompose')),
        h('span', { className: 'tc-compose-bar' },
          StackBar({ items: buckets.map(bucket => ({
            value: bucket.value, color: bucket.color, label: t(bucket.label),
            hint: fmtInt(bucket.value) + ' tok',
          })) })),
        legend(buckets.map(bucket => ({
          value: bucket.value, color: bucket.color, label: t(bucket.label), total: contextTotal,
        }))));

      const kindRows = kindKeys.filter(key => safeCount(kinds[key]?.tokens) > 0);
      // The kind split is a breakdown of the message bucket, so it belongs to the
      // tab that lists messages — not above every tab as a second full-width bar.
      const messageBlock = messageTotal === 0 || tab !== 'top'
        ? null
        : h('div', { className: 'tc-kinds' },
          h('span', { className: 'tc-kinds-label' }, t('surfaceKinds')),
          StackBar({ items: kindRows.map(key => ({
            value: safeCount(kinds[key].tokens), color: kindColors[key],
            label: t(kindLabels[key]), hint: fmtInt(kinds[key].tokens) + ' tok',
          })) }),
          legend(kindRows.map(key => ({
            value: safeCount(kinds[key].tokens), color: kindColors[key],
            label: t(kindLabels[key]), total: messageTotal,
          }))));

      // Level 2 — which bucket is on screen; the badge is the item count, so the
      // tab bar itself says "16 sections / 86 tools / 24 items" before opening.
      const tabButton = (id, label, count) => h('button', {
        key: id, type: 'button', className: 'tc-tab',
        'aria-pressed': tab === id ? 'true' : 'false',
        onClick: () => setTab(id),
      }, label, count === null ? null : h('span', { className: 'tc-tab-n' }, fmtInt(count)));
      const tabBar = h('div', { className: 'tc-tabbar', role: 'group', 'aria-label': t('surfaceTitle') },
        tabButton('system', t('surfaceSystem'), sections.length),
        tabButton('tools', t('surfaceTools'), toolRows.length),
        tabButton('top', t('surfaceTop'), top.length));

      const seg = (id, label, current, onPick) => h('button', {
        key: id, type: 'button', className: 'tc-btn',
        'aria-pressed': current === id ? 'true' : 'false',
        onClick: () => onPick(id),
      }, label);

      // Level 3 — the current bucket's own scale, so a row's share has a
      // denominator in view instead of only in a tooltip.
      const strip = h('div', { className: 'tc-subbar' },
        h('div', { className: 'tc-subbar-text' },
          h('b', null, fmtInt(tabTotal)),
          h('span', null, 'tok'),
          h('span', { className: 'tc-subbar-sep' }, '·'),
          h('span', null, (contextTotal > 0 ? pct(tabTotal, contextTotal).toFixed(1) : '0.0') + '% '
            + t('surfaceOfContext')),
          h('span', { className: 'tc-subbar-sep' }, '·'),
          h('em', null, fmtInt(tabCount) + ' ' + t(tabUnit)),
          needle === '' ? null : [
            h('span', { key: 'sep', className: 'tc-subbar-sep' }, '·'),
            h('span', { key: 'hit' }, t('browserShown', { shown: shownRows, total: tabCount })),
          ]),
        h('div', { className: 'tc-subbar-tools' },
          h('input', {
            className: 'tc-input', type: 'search', value: query,
            placeholder: t('surfaceSearch'), 'aria-label': t('surfaceSearch'),
            onChange: event => setQuery(event.target.value),
          }),
          h('div', { className: 'tc-seg tc-seg-soft', role: 'group', 'aria-label': t('surfaceSortTokens') },
            ...[['tokens', t('surfaceSortTokens')], ['name', t('surfaceSortName')]]
              .map(([id, label]) => seg(id, label, sort, setSort)))));

      // Level 4 — labelled columns. Without these the two numbers on the right
      // are anonymous, which is exactly why the row was hard to read.
      const columns = h('div', { className: 'tc-item-cols', 'aria-hidden': 'true' },
        h('span', null, ''), h('span', null, ''),
        h('span', null, t('surfaceColName')),
        h('span', null, ''),
        h('span', null, ''),
        h('span', null, t('surfaceColTokens')),
        h('span', null, t('surfaceColShare')));

      return Card({
        title: t('surfaceTitle'),
        meta: surface === undefined || surface === null ? null : fmtInt(contextTotal),
        className: 'tc-col-12',
        children: surface === undefined || surface === null
          ? [Empty({ text: t('surfacePending') })]
          : [
            composeBlock,
            h('div', { className: 'tc-block' },
              tabBar,
              strip,
              messageBlock,
              columns,
              body),
            h('p', { className: 'tc-note' },
              t('surfaceTapHint') + ' · ' + t('surfaceSim')
              + (surface.approximate === true ? ' · ' + t('surfaceApprox') : '')),
          ],
      });
    }

    /**
     * Context events with type filters. Each chip carries the session-wide count
     * for that kind, so the log itself can be narrowed without losing the totals.
     */
    function EventsCard({ t, timeline }) {
      const all = Array.isArray(timeline?.events) ? timeline.events : [];
      const kindState = React.useState('all');
      const kind = kindState[0];
      const setKind = kindState[1];
      const kinds = { compact: 'evCompact', prune: 'evPrune', inject: 'evInject', switch: 'evSwitch', mode: 'evMode' };
      const tone = { compact: 'write', prune: 'write', inject: 'read', switch: 'ok', mode: 'read' };
      const counts = {};
      for (const event of all) counts[event.kind] = (counts[event.kind] ?? 0) + 1;
      const rows = all
        .filter(event => kind === 'all' || event.kind === kind)
        .slice(-60)
        .reverse();
      return Card({
        title: t('eventsTitle'),
        meta: all.length === 0 ? null : String(all.length),
        className: 'tc-col-6',
        children: all.length === 0
          ? [Empty({ text: t('eventsEmpty') })]
          : [
            h('div', { className: 'tc-chips' },
              FilterChip({ label: t('eventsAll'), count: all.length, on: kind === 'all', onClick: () => setKind('all') }),
              ...Object.keys(kinds).filter(key => counts[key] > 0).map(key => FilterChip({
                key, label: t(kinds[key]), count: counts[key],
                tone: tone[key], on: kind === key,
                onClick: () => setKind(kind === key ? 'all' : key),
              }))),
            rows.length === 0
              ? Empty({ text: t('eventsEmpty') })
              : h('ul', { className: 'tc-list' }, ...rows.map((event, index) =>
                h('li', { key: index, title: new Date(safeCount(event.time)).toLocaleString() },
                  h('span', { style: { display: 'inline-flex', gap: 6, minWidth: 0 } },
                    h('i', { className: 'tc-chip', 'data-tone': tone[event.kind] || 'read' }, t(kinds[event.kind] ?? 'eventsTitle')),
                    h('span', { className: 'tc-path' }, String(event.label || '').slice(0, 44))),
                  h('span', { className: 'tc-strong' },
                    (event.tokens ? fmtInt(event.tokens) + ' tok' : '') + (event.turn ? ' T' + event.turn : ''))))),
          ],
      });
    }

    /**
     * One collapsible content item: a 300-char preview, the full text on demand
     * (capped, since a single tool result can be megabytes), and a kind chip.
     */
    function ContentItem({ t, row }) {
      const openState = React.useState(false);
      const open = openState[0];
      const setOpen = openState[1];
      const LIMIT = 2400;
      const raw = String(row.text ?? '');
      const short = raw.length > 300 ? raw.slice(0, 300) + '…' : raw;
      const body = open ? (raw.length > LIMIT ? raw.slice(0, LIMIT) + '\n… (' + fmtInt(raw.length - LIMIT) + ' chars left)' : raw) : short;
      const tone = row.tone ?? (row.kind === 'tool' ? 'read' : undefined);
      return h('div', { className: 'tc-op' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 } },
          h('i', { className: 'tc-chip', 'data-tone': tone }, row.label),
          row.title ? h('span', { className: 'tc-path', style: { flex: 1 } }, row.title) : h('span', { style: { flex: 1 } }),
          raw.length > 300
            ? h('button', {
              type: 'button', className: 'tc-btn', style: { padding: '0 6px', fontSize: 11 },
              onClick: (event) => { event.stopPropagation(); setOpen(!open); },
            }, open ? t('contentLess') : t('contentMore'))
            : null),
        h('pre', { className: 'tc-pre' }, body));
    }

    /**
     * Content section for one expanded request row: user message, assistant
     * blocks (answer / reasoning / tool calls) and the tool results produced for
     * it. Rendered from the page's own chat snapshot, capped to 24 rows.
     */
    function contentSection({ t, nodes, request, previousTime }) {
      const content = contentOfRequest(nodes, request, previousTime);
      const rows = [];
      if (content.user !== null && content.user.text !== '') {
        rows.push({ label: t('contentUser'), text: content.user.text, tone: 'read' });
      }
      for (const block of assistantRows(content.assistant?.blocks)) {
        if (block.kind === 'tool-call') {
          rows.push({ label: t('contentCall'), title: block.title, text: block.text, tone: 'write' });
        } else if (block.kind === 'reasoning') {
          rows.push({ label: t('contentReasoning'), text: block.text });
        } else {
          rows.push({ label: t('contentAnswer'), text: block.text });
        }
      }
      for (const tool of content.tools) {
        rows.push({
          label: t('contentResult'), title: tool.name + (tool.isError ? ' ✗' : ''),
          text: tool.text !== '' ? tool.text : tool.args,
          tone: tool.isError ? 'write' : 'ok',
        });
      }
      if (rows.length === 0) return null;
      return h('div', { className: 'tc-content' },
        h('p', { className: 'tc-sub' }, t('contentTitle') + ' · ' + fmtInt(rows.length)),
        ...rows.slice(0, 24).map((row, index) => h(ContentItem, { key: index, t, row })));
    }

    function BrowserCard({ t, pricing, timeline, tier, currency, nodes }) {
      const openState = React.useState(null);
      const openKey = openState[0];
      const setOpenKey = openState[1];
      const queryState = React.useState('');
      const query = queryState[0];
      const setQuery = queryState[1];
      const sortState = React.useState('time');
      const sort = sortState[0];
      const setSort = sortState[1];
      const copyState = React.useState('idle');   // 'idle' | 'done' | 'fail'
      const copied = copyState[0];
      const setCopied = copyState[1];

      const priced = React.useMemo(() => {
        const all = Array.isArray(timeline?.requests) ? timeline.requests : [];
        return all.map((request, index) => ({
          request, index, priced: priceRequest(pricing, request, tier, currency),
        }));
      }, [timeline, tier, currency, pricing]);

      const filtered = React.useMemo(() => {
        const needle = query.trim().toLowerCase();
        const rows = needle === ''
          ? priced.slice()
          : priced.filter(({ request }) =>
            String(request.model || '').toLowerCase().includes(needle)
            || String(request.provider || '').toLowerCase().includes(needle)
            || String(request.turn ?? '').includes(needle)
            // The first column reads "turn/step", so accept that exact form too.
            || (String(request.turn ?? '') + '/' + String(request.step ?? '')).includes(needle));
        if (sort === 'cost') rows.sort((a, b) => (b.priced?.amount || 0) - (a.priced?.amount || 0));
        else if (sort === 'tokens') rows.sort((a, b) => safeCount(b.request.totalTokens) - safeCount(a.request.totalTokens));
        else rows.sort((a, b) => safeCount(b.request.time) - safeCount(a.request.time));
        return rows;
      }, [priced, query, sort]);

      // A 1200-request log must stay reachable: pages grow on demand, and a new
      // filter / sort starts from the first page again.
      const limitState = React.useState(PAGE_SIZE);
      const limit = limitState[0];
      const setLimit = limitState[1];
      React.useEffect(() => { setLimit(PAGE_SIZE); }, [query, sort]);

      const visible = filtered.slice(0, limit);
      const remaining = Math.max(0, filtered.length - visible.length);
      const segment = (value, label) => h('button', {
        key: value, type: 'button', className: 'tc-btn', 'aria-pressed': sort === value ? 'true' : 'false',
        onClick: () => setSort(value),
      }, label);

      const exportCsv = () => {
        const head = ['turn', 'step', 'time', 'provider', 'model', 'tokens', 'input', 'cacheRead', 'cacheWrite', 'output', 'cost'];
        const lines = [head.join(',')];
        for (const { request, priced: row } of filtered) {
          lines.push([
            request.turn ?? '', request.step ?? '',
            request.time ? new Date(request.time).toISOString() : '',
            request.provider ?? '', request.model ?? '',
            safeCount(request.totalTokens), safeCount(request.input), safeCount(request.cacheRead),
            safeCount(request.cacheWrite), safeCount(request.output),
            row ? Number(row.amount.toFixed(8)) : '',
          ].map(value => (String(value).includes(',') ? '"' + String(value).replace(/"/g, '""') + '"' : value)).join(','));
        }
        void copyText(lines.join('\n')).then(ok => {
          setCopied(ok ? 'done' : 'fail');
          window.setTimeout(() => setCopied('idle'), 1800);
        });
      };

      const head = h('div', { className: 'tc-trow tc-thead' },
        h('span', null, t('browserTurn')), h('span', null, t('browserModel')),
        h('span', null, t('browserTokens')), h('span', null, t('browserCost')), h('span', null, ''));

      const body = visible.map(({ request, index, priced: row }) => {
        const key = request.seq ?? index;
        const expanded = openKey === key;
        const total = safeCount(request.totalTokens);
        const cacheHit = total > 0 ? (safeCount(request.cacheRead) / total * 100).toFixed(1) + '%' : '—';
        const tr = h('div', {
          className: 'tc-trow', key: 'r' + key, role: 'button', tabIndex: 0,
          'aria-expanded': expanded ? 'true' : 'false', title: t('browserExpand'),
          onClick: () => setOpenKey(expanded ? null : key),
          onKeyDown: (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            setOpenKey(expanded ? null : key);
          },
        },
          h('span', null, String(request.turn ?? '—') + '/' + String(request.step ?? '—')),
          h('span', null, request.model || '—'),
          h('span', { className: 'tc-strong' }, fmtInt(total)),
          h('span', { className: 'tc-strong' }, row ? (row.approximate ? '≈' : '') + money(pricing, row.amount, currency) : t('unknown')),
          h('span', { 'aria-hidden': 'true' }, expanded ? '▾' : '▸'));
        if (!expanded) return tr;
        return h(React.Fragment, { key: 'f' + key }, tr,
          h('dl', { className: 'tc-dl tc-detail' },
            h('dt', null, t('browserProvider')), h('dd', null, request.provider || '—'),
            h('dt', null, t('browserModel')), h('dd', null, request.model || '—'),
            h('dt', null, t('input')), h('dd', null, fmtInt(request.input)),
            h('dt', null, t('cacheRead')), h('dd', null, fmtInt(request.cacheRead)),
            h('dt', null, t('cacheWrite')), h('dd', null, fmtInt(request.cacheWrite)),
            h('dt', null, t('output')), h('dd', null, fmtInt(request.output)),
            h('dt', null, t('browserCache')), h('dd', null, cacheHit),
            h('dt', null, t('browserTier')),
            h('dd', null, row && row.peak !== undefined
              ? (row.peak ? t('browserPeak') : t('browserOffPeak')) : '—'),
            h('dt', null, t('browserTime')),
            h('dd', null, request.time ? new Date(request.time).toLocaleString() : '—')),
          contentSection({ t, nodes, request, previousTime: index > 0 ? safeCount(priced[index - 1]?.request?.time) : 0 }));
      });

      return Card({
        title: t('browserTitle'),
        meta: t('browserShown', { shown: visible.length, total: filtered.length }),
        className: 'tc-col-12',
        children: [
          h('div', { className: 'tc-toolbar' },
            h('input', {
              className: 'tc-input', type: 'search', value: query, placeholder: t('browserFilter'),
              'aria-label': t('browserFilter'),
              onChange: event => setQuery(event.currentTarget.value),
            }),
            h('div', { className: 'tc-seg', role: 'group', 'aria-label': t('browserTitle') },
              segment('time', t('browserSortTime')),
              segment('cost', t('browserSortCost')),
              segment('tokens', t('browserSortTokens'))),
            h('button', {
              className: 'tc-btn', type: 'button', onClick: exportCsv,
              disabled: filtered.length === 0,
              'data-state': copied,
            },
              copied === 'done' ? t('browserCopied')
                : (copied === 'fail' ? t('browserCopyFail') : t('browserCopy')))),
          visible.length === 0
            ? Empty({ text: query.trim() === '' ? t('browserEmpty') : t('browserNoMatch') })
            : h('div', { className: 'tc-table' }, head, ...body),
          remaining === 0 ? null : h('button', {
            className: 'tc-btn tc-more', type: 'button',
            onClick: () => setLimit(limit + PAGE_SIZE),
          }, t('browserMore', { remaining: fmtInt(remaining) })),
        ],
      });
    }

    /**
     * The cost preferences the entry chunk's badge/pill read, mounted inside this
     * plugin's own `settings.section` page. Writes go straight to the shared
     * persisted store, so every surface updates on the next render.
     */
    function SettingsRow({ t, pricing }) {
      const preference = usePrefsOf(pricing);
      const { prefs } = pricing;
      const text = (title, description) => h('div', { className: 'tc-pref-text' },
        h('div', { className: 'tc-pref-title' }, title),
        description === undefined ? null : h('div', { className: 'tc-pref-desc' }, description));
      const row = (key, title, description, control) => h('div', { className: 'tc-pref-row', key },
        text(title, description), h('div', { className: 'tc-control' }, control));

      const toggle = (name, label) => h('button', {
        type: 'button', role: 'switch', className: 'tc-switch',
        'aria-checked': preference[name] === true ? 'true' : 'false', 'aria-label': label,
        onClick: () => prefs.set({ [name]: preference[name] !== true }),
      }, h('i', null));

      const tiers = [['auto', 'prefTierAuto'], ['peak', 'prefTierPeak'], ['offPeak', 'prefTierOffPeak']];
      const currencies = [['CNY', 'prefCurrencyCny'], ['USD', 'prefCurrencyUsd']];
      const segmented = (name, label, items) => h('div', { className: 'tc-seg', role: 'group', 'aria-label': t(label) },
        ...items.map(([value, caption]) => h('button', {
          key: value, type: 'button', className: 'tc-btn',
          'aria-pressed': preference[name] === value ? 'true' : 'false',
          onClick: () => prefs.set({ [name]: value }),
        }, t(caption))));

      const symbol = pricing.CURRENCY_SYMBOL[preference.currency];
      const budget = h('div', { className: 'tc-budget' },
        h('span', { 'aria-hidden': 'true' }, symbol),
        h('input', {
          type: 'number', min: '0', step: '0.5', value: preference.budget > 0 ? String(preference.budget) : '',
          placeholder: '0', 'aria-label': t('prefBudget'),
          onChange: (event) => prefs.set({ budget: pricing.normalizeBudget(event.currentTarget.value) }),
        }),
        h('button', {
          type: 'button', className: 'tc-btn', onClick: () => prefs.set({ budget: 0 }),
          disabled: preference.budget <= 0,
        }, t('prefBudgetClear')));

      return h('div', { className: 'tc-pref' },
        h('h4', { className: 'tc-group-title' }, t('groupDisplay')),
        row('badge', t('prefBadge'), t('prefBadgeDesc'), toggle('badge', t('prefBadge'))),
        row('pill', t('prefPill'), t('prefPillDesc'), toggle('pill', t('prefPill'))),
        h('h4', { className: 'tc-group-title' }, t('groupPricing')),
        row('currency', t('prefCurrency'), t('prefCurrencyDesc'), segmented('currency', 'prefCurrency', currencies)),
        row('tier', t('prefTier'), t('prefTierDesc'), segmented('tier', 'prefTier', tiers)),
        h('h4', { className: 'tc-group-title' }, t('groupBudget')),
        row('budget', t('prefBudget'), t('prefBudgetDesc'), budget),
        row('reset', t('prefResetTitle'), t('prefResetDesc'),
          h('button', { type: 'button', className: 'tc-btn', onClick: () => prefs.reset() }, t('prefReset'))));
    }

    /**
     * `settings.section`: the plugin's own settings page. Every cost preference
     * lives here rather than as a row borrowed from General, so the feature owns
     * its whole directory entry (nav label, icon, page copy and controls).
     */
    function SettingsSection({ t, pricing }) {
      return h('section', { className: 'tc-settings' },
        h('h2', { className: 'tc-settings-title' }, t('nav')),
        h('p', { className: 'tc-settings-intro' }, t('sectionIntro')),
        h(SettingsRow, { t, pricing }));
    }

    /** Nav glyph for the settings section: a ¥ coin, matching the plugin icon. */
    function sectionIcon(size) {
      const px = Number.isFinite(size) && size > 0 ? size : 16;
      const path = (d, key) => h('path', { key, d, fill: 'none', stroke: 'currentColor', strokeWidth: 1, strokeLinecap: 'round' });
      return h('svg', { width: px, height: px, viewBox: '0 0 16 16', 'aria-hidden': 'true' },
        path('M8 14.4a6.4 6.4 0 1 0 0-12.8 6.4 6.4 0 0 0 0 12.8Z', 'ring'),
        path('M5.4 5.2 8 8.2l2.6-3', 'y'),
        path('M8 8.2v4.4', 'stem'),
        path('M5.9 9.7h4.2', 'bar1'),
        path('M5.9 11.4h4.2', 'bar2'));
    }

    /**
     * Settings header chip. It is mounted for as long as the settings panel is
     * open, so its first render is the lazy trigger: opening settings — on any
     * page, including the native model editor — asks the Host for the catalog
     * (answered from the stored list, never from the gateway) and lets it
     * revalidate upstream behind the panel. A click re-checks the gateway now.
     */
    function ModelsChip({ t, catalog }) {
      const state = React.useSyncExternalStore(catalog.subscribe, catalog.getSnapshot, catalog.getSnapshot);
      React.useEffect(() => { void catalog.read(false); }, [catalog]);
      if (state.phase === 'idle' && state.route === null) return null;
      // An older Host has no catalog route at all; leave the header alone instead
      // of advertising a feature this deployment does not serve.
      if (state.error !== null && state.error.includes('http-404')) return null;
      const busy = state.refreshing || state.phase === 'loading';
      const label = busy
        ? t('modelsChipBusy')
        : state.error !== null
          ? t('modelsChipFailed')
          : t('modelsChip')
            .replace('{n}', String(state.count))
            .replace('{age}', syncAgeLabel(t, state.syncedAt, Date.now()));
      return h('button', {
        type: 'button',
        className: 'tc-chip',
        title: t('modelsChipTitle'),
        'data-busy': busy ? 'true' : 'false',
        onClick: () => { void catalog.force(); },
      },
        h('span', { className: 'tc-chip-dot', 'aria-hidden': 'true' }),
        h('span', null, label));
    }

    /** One catalog row: display name, id, and what the model accepts. */
    function modelRow(t, model, isNew) {
      const caps = catalogCaps(model);
      return h('li', { className: 'tc-model-row', key: model.id },
        h('div', { className: 'tc-model-main' },
          h('span', { className: 'tc-model-name' }, String(model.name ?? model.id)),
          isNew ? h('span', { className: 'tc-model-tag' }, t('modelsAdded')) : null),
        h('span', { className: 'tc-model-id' }, model.id),
        h('span', { className: 'tc-model-caps' },
          caps.image ? h('span', { className: 'tc-model-cap' }, t('modelsCapImage')) : null,
          caps.levels.length > 0
            ? h('span', { className: 'tc-model-cap' }, t('modelsReasoning') + ' ' + caps.levels.join('/'))
            : null,
          h('span', { className: 'tc-model-cap' },
            t('modelsWindow') + ' ' + compactCapacity(model.contextWindow)
            + ' · ' + t('modelsOutput') + ' ' + compactCapacity(model.maxTokens))));
    }

    /**
     * `settings.section`: the catalog page. It paints the last list straight away
     * (Host cache, then this browser's persisted paint) and shows the background
     * refresh as a line of text, not as an empty screen.
     */
    function ModelsSection({ t, catalog }) {
      const state = React.useSyncExternalStore(catalog.subscribe, catalog.getSnapshot, catalog.getSnapshot);
      React.useEffect(() => { void catalog.read(false); }, [catalog]);
      const busy = state.refreshing || state.phase === 'loading';
      const added = new Set(state.addedIds ?? []);
      const status = state.error !== null
        ? t('modelsFailed').replace('{reason}', state.error)
        : busy
          ? t('modelsRefreshing')
          : state.route === null
            ? t('modelsNoRoute')
            : syncAgeLabel(t, state.syncedAt, Date.now());
      return h('section', { className: 'tc-settings tc-models' },
        h('h2', { className: 'tc-settings-title' }, t('modelsTitle')),
        h('p', { className: 'tc-settings-intro' }, t('modelsIntro')),
        h('div', { className: 'tc-models-bar' },
          h('div', { className: 'tc-models-meta' },
            h('span', { className: 'tc-models-status', 'data-busy': busy ? 'true' : 'false' }, status),
            state.route === null ? null : h('span', { className: 'tc-models-route' },
              state.route + (state.baseURL ? ' · ' + state.baseURL : '')),
            state.count > 0
              ? h('span', { className: 'tc-models-count' }, t('modelsCount').replace('{n}', String(state.count)))
              : null),
          h('button', {
            type: 'button',
            className: 'tc-btn',
            disabled: busy,
            onClick: () => { void catalog.force(); },
          }, busy ? t('modelsSyncBusy') : t('modelsSyncNow'))),
        state.models.length === 0
          ? h('p', { className: 'tc-note' }, t('modelsEmpty'))
          : h('ul', { className: 'tc-model-list' },
            state.models.map(model => modelRow(t, model, added.has(model.id)))),
        h('p', { className: 'tc-note' }, t('modelsHint')));
    }

    /** Nav glyph for the catalog page: stacked layers. */
    function modelsIcon(size) {
      const px = Number.isFinite(size) && size > 0 ? size : 16;
      return h('svg', { width: px, height: px, viewBox: '0 0 16 16', 'aria-hidden': 'true' },
        h('path', { d: 'M8 2.2 14 5 8 7.8 2 5l6-2.8Z', fill: 'none', stroke: 'currentColor', strokeWidth: 1, strokeLinejoin: 'round' }),
        h('path', { d: 'm2 8 6 2.8L14 8', fill: 'none', stroke: 'currentColor', strokeWidth: 1, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { d: 'm2 11 6 2.8L14 11', fill: 'none', stroke: 'currentColor', strokeWidth: 1, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    // ── §5 views ─────────────────────────────────────────────────────────────
    function ContextView(props, pricing) {
      const t = props.t;
      const useProjection = props.useProjection;
      const useChat = props.useChat;
      const preference = usePrefsOf(pricing);
      const tier = preference.tier;
      const currency = preference.currency;
      const timeline = useOptional(useProjection, 'tcTimeline');
      const usage = useOptional(useProjection, 'tokenUsage');
      const breakdown = useOptional(useProjection, 'contextBreakdown');
      const surface = useOptional(useProjection, 'tcSurface');
      const pressure = useOptional(useProjection, 'contextPressure');
      const stats = useOptional(useProjection, 'sessionStats');
      const nodes = useOptional(useChat, s => s.legacy.nodes) ?? [];
      const turns = new Set();
      let steps = 0;
      for (const node of nodes) {
        if (node.kind === 'assistant') { turns.add(node.turn); steps += 1; }
      }
      const summary = summarize(pricing, timeline?.requests, tier, currency);
      const totalTokens = summary.tokens
        || (safeCount(usage?.uncachedInputTokens) + safeCount(usage?.cacheReadTokens)
          + safeCount(usage?.cacheWriteTokens) + safeCount(usage?.outputTokens));
      const cacheHit = summary.cacheHit !== null ? summary.cacheHit.toFixed(1) + '%' : '—';
      const turnCount = turns.size || safeCount(stats?.turns);
      // A soft budget reads as one slim band: spent / cap, what is left, and a bar.
      const budgets = preference.budget > 0
        ? h('div', { className: 'tc-band', 'data-over': summary.cost > preference.budget ? 'true' : 'false' },
          h('span', { className: 'tc-band-title' }, t('prefBudget')),
          h('b', null, money(pricing, summary.cost, currency) + ' / ' + money(pricing, preference.budget, currency)),
          h('span', null, t('sessionBudgetRemain') + ' ' + money(pricing, preference.budget - summary.cost, currency)),
          h('div', { className: 'tc-mini', style: { flex: '1 1 120px' }, 'aria-hidden': 'true' },
            h('i', {
              style: {
                width: pct(summary.cost, preference.budget).toFixed(1) + '%',
                background: summary.cost > preference.budget
                  ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-business-primary)',
              },
            })))
        : null;

      return h('div', { className: 'tc-surface tc-panel' },
        h('div', { className: 'tc-head' },
          h('h2', null, t('sessionTitle')),
          h('span', { className: 'tc-head-meta' }, t('kpiCost') + ' ' + money(pricing, summary.cost, currency))),
        h('div', { className: 'tc-tiles' },
          h(Tile, { icon: ICON.turns, label: t('turns'), value: String(turnCount) }),
          h(Tile, { icon: ICON.steps, label: t('steps'), value: fmtInt(steps || safeCount(stats?.steps)) }),
          h(Tile, { icon: ICON.requests, label: t('requests'), value: String(summary.known + summary.unknown) }),
          h(Tile, { icon: ICON.tokens, label: t('kpiTokens'), value: fmtInt(totalTokens) }),
          h(Tile, { icon: ICON.cost, label: t('kpiCost'), value: money(pricing, summary.cost, currency), tone: 'cost' }),
          h(Tile, { icon: ICON.cache, label: t('kpiCache'), value: cacheHit })),
        budgets,
        h('div', { className: 'tc-grid' },
          h(StatsCard, {
            t, timeline, turnCount, requests: summary.known + summary.unknown,
            steps: steps || safeCount(stats?.steps),
          }),
          h(CompositionCard, { t, breakdown, pressure }),
          h(SurfaceCard, { t, surface }),
          h(TokenCard, { t, pricing, usage, summary, currency }),
          h(CostCard, { t, pricing, summary, currency }),
          h(TrendCard, { t, pricing, timeline, tier, currency }),
          h(ModelCostCard, { t, pricing, summary, currency }),
          h(TimingCard, { t, stats }),
          h(FileActivityCard, { t, files: timeline?.files, fileOps: timeline?.fileOps }),
          h(CommandsCard, { t, commands: timeline?.commands }),
          h(EventsCard, { t, timeline }),
          h(AgentNetworkCard, {
            t, pricing, tier, currency,
            sessions: useOptional(props.useSessions, s => s), sessionId: props.sessionId,
          }),
          h(BrowserCard, { t, pricing, timeline, tier, currency, nodes })));
    }

    function ContextModal(props) {
      const pricing = props.pricing;
      const t = props.t;
      const preference = usePrefsOf(pricing);
      const tier = preference.tier;
      const currency = preference.currency;
      const readOpen = typeof props.useTcModal === 'function' ? props.useTcModal : () => false;
      // Hooks must run unconditionally, even while the dialog is closed.
      const open = readOpen(value => value) === true;
      const breakdown = useOptional(props.useProjection, 'contextBreakdown');
      const surface = useOptional(props.useProjection, 'tcSurface');
      const pressure = useOptional(props.useProjection, 'contextPressure');
      const timeline = useOptional(props.useProjection, 'tcTimeline');
      const stats = useOptional(props.useProjection, 'sessionStats');
      React.useEffect(() => {
        if (!open) return undefined;
        // Opening the command modal dismisses any other open popover (the
        // composer cost panel listens for outside pointerdown).
        try { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); } catch { /* older engines */ }
        const onKeyDown = (event) => { if (event.key === 'Escape') modalStore.set(false); };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
      }, [open]);
      if (!open) return null;
      const onClose = () => modalStore.set(false);
      const summary = summarize(pricing, timeline?.requests, tier, currency);
      return ReactDOM.createPortal(
        h('div', {
          className: 'tc-mask',
          onMouseDown: (event) => { if (event.target === event.currentTarget) onClose(); },
        },
          h('div', { className: 'tc-modal tc-surface', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('modalTitle') },
            h('div', { className: 'tc-head' },
              h('h2', null, t('modalTitle')),
              h('button', { className: 'tc-btn', type: 'button', onClick: onClose }, t('close'))),
            h('div', { className: 'tc-tiles' },
              h(Tile, { icon: ICON.cost, label: t('kpiCost'), value: money(pricing, summary.cost, currency), tone: 'cost' }),
              h(Tile, { icon: ICON.tokens, label: t('kpiTokens'), value: fmtInt(summary.tokens) }),
              h(Tile, { icon: ICON.cache, label: t('kpiCache'), value: summary.cacheHit !== null ? summary.cacheHit.toFixed(1) + '%' : '—' }),
              h(Tile, { icon: ICON.requests, label: t('requests'), value: String(summary.known + summary.unknown) })),
            h('div', { className: 'tc-grid' },
              h(StatsCard, {
                t, timeline, turnCount: safeCount(stats?.turns), steps: safeCount(stats?.steps),
                requests: summary.known + summary.unknown,
              }),
              h(CompositionCard, { t, breakdown, pressure }),
              h(SurfaceCard, { t, surface }),
              h(CostCard, { t, pricing, summary, currency }),
              h(ModelCostCard, { t, pricing, summary, currency, className: 'tc-col-4' })),
            h('p', { className: 'tc-note', style: { marginTop: 12 } }, t('modalHint')))),
        document.body);
    }

    /**
     * Cross-session dashboard: KPI band, 7-day tokens/cost chart, an aligned
     * 12-week heatmap, a model leaderboard and searchable session cards.
     */
    /** 7-day tokens (bars) and cost (bars) for the cross-session dashboard. */
    function WeekChartCard({ t, pricing, week, currency }) {
      const maxTokens = Math.max(1, ...week.map(day => day.tokens));
      const maxCost = Math.max(0.000001, ...week.map(day => day.cost));
      const weekTokens = week.reduce((sum, day) => sum + day.tokens, 0);
      const weekCost = week.reduce((sum, day) => sum + day.cost, 0);
      // 30 bars leave no room for per-bar labels; they stay tooltip-only there.
      const labelled = week.length <= 10;
      // Labels carry the figure, not just the shape: a 52M day and a 40K day are
      // 3px vs 62px on a linear scale, and the small one still has to be legible.
      const tokenBars = h('div', { className: 'tc-chart', style: { height: '96px' } }, ...week.map(day => h('div', {
        className: 'col', key: day.key,
        title: day.key + ' · ' + fmtInt(day.tokens) + ' tok · ' + money(pricing, day.cost, currency),
      },
        h('i', { style: { height: Math.max(2, day.tokens / maxTokens * 62) + 'px' } }),
        labelled ? h('strong', null, fmtShort(day.tokens)) : null)));
      const costBars = h('div', { className: 'tc-chart', style: { height: '56px' } }, ...week.map(day => h('div', {
        className: 'col', key: 'c' + day.key,
        title: day.key + ' · ' + money(pricing, day.cost, currency),
      },
        h('i', {
          style: {
            height: Math.max(2, day.cost / maxCost * 30) + 'px',
            background: 'var(--dsw-alias-state-success-primary)',
          },
        }),
        labelled ? h('span', null, day.key.slice(5)) : null,
        labelled ? h('strong', null, money(pricing, day.cost, currency)) : null)));
      return Card({
        title: t('activityTitle'),
        meta: money(pricing, weekCost, currency),
        className: 'tc-col-6',
        children: [
          tokenBars,
          h('div', { className: 'tc-legend' },
            h('span', null, t('kpiTokens') + ' ', h('b', null, fmtInt(weekTokens))),
            h('span', null, t('dailyTitle') + ' ', h('b', null, money(pricing, weekCost, currency)))),
          costBars,
        ],
      });
    }

    /** 12-week activity heatmap: Monday-first columns, zero-filled cells. */
    function HeatCard({ t, pricing, heatDays, heatMax, days, currency }) {
      const cells = [];
      const pad = mondayIndex(heatDays[0]);
      for (let index = 0; index < pad; index += 1) {
        cells.push(h('i', { key: 'pad' + index, className: 'blank' }));
      }
      for (const key of heatDays) {
        const entry = days.get(key);
        const value = safeCount(entry?.tokens);
        cells.push(h('i', {
          key,
          title: key + ' · ' + fmtInt(value) + ' tok · ' + money(pricing, safeCount(entry?.cost), currency),
          style: value === 0 ? undefined : {
            background: 'var(--dsw-alias-state-business-primary)',
            opacity: (0.2 + value / heatMax * 0.8).toFixed(2),
          },
        }));
      }
      return Card({
        title: t('heatTitle'),
        meta: t('heatRange') + ' · ' + heatDays[0].slice(5) + '–' + heatDays[heatDays.length - 1].slice(5),
        className: 'tc-col-6',
        children: [
          h('div', { className: 'tc-heat' }, ...cells),
          h('div', { className: 'tc-legend' },
            h('span', null, t('heatLess')),
            ...[0.2, 0.45, 0.7, 1].map(opacity => h('i', {
              key: 'l' + opacity, className: 'tc-dot',
              style: { background: 'var(--dsw-alias-state-business-primary)', opacity: String(opacity) },
            })),
            h('span', null, t('heatMore'))),
        ],
      });
    }

    /** Cross-session model leaderboard: where the money actually goes. */
    function BoardCard({ t, pricing, modelRows, currency }) {
      return Card({
        title: t('boardTitle'),
        meta: modelRows.length === 0 ? null : String(modelRows.length),
        className: 'tc-col-6',
        children: modelRows.length === 0
          ? [Empty({ text: t('boardEmpty') })]
          : [h('div', { className: 'tc-rows' }, ...modelRows.map(row => MeterRow({
            key: row.model,
            label: row.model,
            color: 'var(--dsw-alias-state-business-primary)',
            value: row.cost,
            max: modelRows[0].cost || 1,
            right: money(pricing, row.cost, currency) + ' · ' + fmtInt(row.tokens) + ' tok',
            hint: row.model + ' · ' + row.requests + ' ' + t('modelRequests'),
          })))],
      });
    }

    /** Searchable, sortable session cards; clicking one opens that session. */
    function SessionListCard(props) {
      const { t, pricing, rows, sessionRows, currency, openSession, onClose, query, setQuery, sort, setSort } = props;
      const limitState = React.useState(PAGE_SIZE);
      const limit = limitState[0];
      const setLimit = limitState[1];
      React.useEffect(() => { setLimit(PAGE_SIZE); }, [query, sort]);
      const shown = sessionRows.slice(0, limit);
      const remaining = Math.max(0, sessionRows.length - shown.length);
      const segment = (value, label) => h('button', {
        key: value, type: 'button', className: 'tc-btn',
        'aria-pressed': sort === value ? 'true' : 'false',
        onClick: () => setSort(value),
      }, label);
      const open = (id) => {
        try { openSession?.(id); } catch { /* best effort */ }
        onClose();
      };
      return Card({
        title: t('sessionsTitle'),
        meta: t('browserShown', { shown: shown.length, total: rows.length }),
        className: 'tc-col-6',
        children: [
          h('div', { className: 'tc-toolbar' },
            h('input', {
              className: 'tc-input', type: 'search', value: query,
              placeholder: t('sessionSearch'), 'aria-label': t('sessionSearch'),
              onChange: event => setQuery(event.currentTarget.value),
            }),
            h('div', { className: 'tc-seg', role: 'group', 'aria-label': t('sessionsTitle') },
              segment('cost', t('sessionSortCost')),
              segment('tokens', t('sessionSortTokens')),
              segment('recent', t('sessionSortRecent')))),
          sessionRows.length === 0
            ? Empty({ text: t('noSessions') })
            : h('div', { className: 'tc-session-grid' }, ...shown.map(row => h('div', {
              className: 'tc-session', key: row.id, role: 'button', tabIndex: 0, title: row.title,
              onClick: () => open(row.id),
              onKeyDown: (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                open(row.id);
              },
            },
              h('b', null, row.title),
              h('div', { className: 'tc-session-meta' },
                h('span', null, fmtInt(row.sessionTokens) + ' tok'),
                h('span', null, money(pricing, row.sessionCost, currency)))))),
          remaining === 0 ? null : h('button', {
            className: 'tc-btn tc-more', type: 'button',
            onClick: () => setLimit(limit + PAGE_SIZE),
          }, t('browserMore', { remaining: fmtInt(remaining) })),
        ],
      });
    }

    /** One ranking card: `{[name]: count}` → bars, for the dashboard tallies. */
    function TallyCard({ t, title, rows, empty, pending }) {
      return Card({
        title,
        meta: rows.length === 0 ? null : String(rows.length),
        className: 'tc-col-4',
        children: rows.length === 0
          ? [Empty({ text: pending ? t('tallyPending') : (empty ?? t('tallyEmpty')) })]
          : [h('div', { className: 'tc-rows' }, ...rows.map(([name, count]) => MeterRow({
            key: name, label: name, value: count, max: rows[0][1] || 1,
            right: fmtInt(count), hint: name + ' · ' + fmtInt(count),
          })))],
      });
    }

    /** Range presets for the cross-session KPIs, chart, tallies and session list. */
    const RANGES = [
      { key: 'today', days: 1, label: 'rangeToday' },
      { key: '7d', days: 7, label: 'range7' },
      { key: '30d', days: 30, label: 'range30' },
    ];

    function OverviewPanel({ t, pricing, sessions, openSession, onClose, tier, currency, quota }) {
      const balance = useQuota(quota);
      const queryState = React.useState('');
      const query = queryState[0];
      const setQuery = queryState[1];
      const sortState = React.useState('cost');
      const sort = sortState[0];
      const setSort = sortState[1];
      const rangeState = React.useState('7d');
      const range = rangeState[0];
      const setRange = rangeState[1];

      const ids = sessions?.ids ?? [];
      // Day buckets only change at midnight, so the memo survives the dashboard
      // being left open across a session.
      const today = beijingKey(Date.now());

      // 800+ sessions × every day row: without this memo each keystroke in the
      // search box re-priced the entire history (and each tier / currency change
      // rightly does).
      const agg = React.useMemo(() => {
        const byId = sessions?.byId ?? {};
        const projections = sessions?.projectionsBySession ?? {};
        const days = new Map();          // day -> { tokens, cost, requests, cacheRead, cacheTotal, tools, programs, skills }
        const models = new Map();        // model -> { cost, tokens, requests, byDay: Map }
        const rows = [];                 // per-session summary with a per-day map
        let tokens = 0, cost = 0, cacheRead = 0, cacheTotal = 0;
        const now = Date.now();

        for (const id of ids) {
          const activity = projections[id]?.values?.tcActivity;
          if (activity === undefined || activity === null) continue;
          let sessionTokens = 0, sessionCost = 0, lastDay = '';
          const sessionDays = new Map();
          for (const [day, dayRow] of Object.entries(activity.days ?? {})) {
            const entry = days.get(day) ?? {
              tokens: 0, cost: 0, requests: 0, cacheRead: 0, cacheTotal: 0,
              tools: new Map(), programs: new Map(), skills: new Map(),
            };
            const dayTokens = safeCount(dayRow.tokens);
            entry.tokens += dayTokens;
            entry.requests += safeCount(dayRow.requests);
            sessionTokens += dayTokens;
            if (day > lastDay) lastDay = day;
            const buckets = dayRow.buckets ?? {};
            const dayCacheRead = safeCount(buckets.cacheRead);
            const dayCacheTotal = safeCount(buckets.input) + dayCacheRead
              + safeCount(buckets.cacheWrite) + safeCount(buckets.output);
            entry.cacheRead += dayCacheRead;
            entry.cacheTotal += dayCacheTotal;
            cacheRead += dayCacheRead;
            cacheTotal += dayCacheTotal;
            // Cross-session tallies: names only, already bounded by the Host.
            for (const [name, count] of Object.entries(dayRow.tools ?? {})) {
              entry.tools.set(name, (entry.tools.get(name) ?? 0) + safeCount(count));
            }
            for (const [name, count] of Object.entries(dayRow.programs ?? {})) {
              entry.programs.set(name, (entry.programs.get(name) ?? 0) + safeCount(count));
            }
            for (const [name, count] of Object.entries(dayRow.skills ?? {})) {
              entry.skills.set(name, (entry.skills.get(name) ?? 0) + safeCount(count));
            }
            let dayCost = 0;
            for (const [model, slot] of Object.entries(dayRow.byModel ?? {})) {
              // Prices the slot at the tier the Host folded in (peak / off-peak),
              // so a historical DeepSeek day is not re-priced at today's tier.
              const amount = priceModelSlot(pricing, slot, model, tier, currency, now);
              if (amount === null) continue;
              entry.cost += amount;
              sessionCost += amount;
              dayCost += amount;
              cost += amount;
              const modelRow = models.get(model) ?? { model, cost: 0, tokens: 0, requests: 0, byDay: new Map() };
              modelRow.cost += amount;
              modelRow.tokens += slotTokens(slot);
              modelRow.requests += 1;
              const modelDay = modelRow.byDay.get(day) ?? { cost: 0, tokens: 0 };
              modelRow.byDay.set(day, { cost: modelDay.cost + amount, tokens: modelDay.tokens + slotTokens(slot) });
              models.set(model, modelRow);
            }
            days.set(day, entry);
            sessionDays.set(day, { tokens: dayTokens, cost: dayCost });
            tokens += dayTokens;
          }
          rows.push({
            id, sessionTokens, sessionCost, lastDay, days: sessionDays,
            title: String(byId[id]?.displayTitle ?? byId[id]?.title ?? id),
          });
        }
        return { days, models, rows, tokens, cost, cacheRead, cacheTotal };
      }, [sessions, tier, currency, pricing, today, ids]);

      const { days, models, rows, tokens, cost, cacheRead, cacheTotal } = agg;
      const now = Date.now();
      const preset = RANGES.find(item => item.key === range) ?? RANGES[1];

      // Calendar window of the selected range, newest first for the session list
      // and oldest → newest for the chart.
      const rangeKeys = [];
      for (let offset = preset.days - 1; offset >= 0; offset -= 1) {
        rangeKeys.push(beijingKey(now - offset * 86400000));
      }
      const inRange = new Set(rangeKeys);

      const week = rangeKeys.map(key => {
        const entry = days.get(key);
        return { key, tokens: safeCount(entry?.tokens), cost: safeCount(entry?.cost) };
      });
      const rangeTokens = week.reduce((sum, day) => sum + day.tokens, 0);
      const rangeCost = week.reduce((sum, day) => sum + day.cost, 0);
      const rangeCacheRead = rangeKeys.reduce((sum, key) => sum + safeCount(days.get(key)?.cacheRead), 0);
      const rangeCacheTotal = rangeKeys.reduce((sum, key) => sum + safeCount(days.get(key)?.cacheTotal), 0);
      const rangeRequests = rangeKeys.reduce((sum, key) => sum + safeCount(days.get(key)?.requests), 0);

      const tallyOf = field => {
        const out = new Map();
        for (const key of rangeKeys) {
          for (const [name, count] of days.get(key)?.[field] ?? []) {
            out.set(name, (out.get(name) ?? 0) + safeCount(count));
          }
        }
        return [...out].sort((a, b) => b[1] - a[1]).slice(0, 8);
      };
      const toolRows = tallyOf('tools');
      const programRows = tallyOf('programs');
      const skillRows = tallyOf('skills');
      // A dashboard against a Host generation that predates the tallies would
      // otherwise look broken instead of uninformed.
      const tallyPending = toolRows.length === 0 && rangeRequests > 0;

      // Heatmap stays a fixed 12-week view: it answers "when do I work", which a
      // 1-day range would erase.
      const heatDays = [];
      for (let offset = 12 * 7 - 1; offset >= 0; offset -= 1) heatDays.push(beijingKey(now - offset * 86400000));
      const heatMax = Math.max(1, ...heatDays.map(key => safeCount(days.get(key)?.tokens)));
      const cacheHit = rangeCacheTotal > 0 ? (rangeCacheRead / rangeCacheTotal * 100).toFixed(1) + '%' : '—';

      const modelRows = [...models.values()]
        .map(row => {
          let rangeTokensOfModel = 0, rangeCostOfModel = 0, requests = 0;
          for (const [day, entry] of row.byDay) {
            if (!inRange.has(day)) continue;
            rangeTokensOfModel += entry.tokens;
            rangeCostOfModel += entry.cost;
            requests += 1;
          }
          return { model: row.model, cost: rangeCostOfModel, tokens: rangeTokensOfModel, requests };
        })
        .filter(row => row.cost > 0 || row.tokens > 0)
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 8);

      const needle = query.trim().toLowerCase();
      const sessionRows = rows
        .map(row => {
          let rangeTokensOfSession = 0, rangeCostOfSession = 0, lastDayInRange = '';
          for (const [day, entry] of row.days) {
            if (!inRange.has(day)) continue;
            rangeTokensOfSession += entry.tokens;
            rangeCostOfSession += entry.cost;
            if (day > lastDayInRange) lastDayInRange = day;
          }
          return {
            id: row.id, title: row.title, lastDay: lastDayInRange || row.lastDay,
            sessionTokens: rangeTokensOfSession, sessionCost: rangeCostOfSession,
          };
        })
        .filter(row => row.sessionTokens > 0 || row.sessionCost > 0)
        .filter(row => needle === '' || row.title.toLowerCase().includes(needle))
        .sort((a, b) => (sort === 'tokens'
          ? b.sessionTokens - a.sessionTokens
          : (sort === 'recent' ? (b.lastDay || '').localeCompare(a.lastDay || '') : b.sessionCost - a.sessionCost)));

      const segment = (item) => h('button', {
        key: item.key, type: 'button', className: 'tc-btn',
        'aria-pressed': range === item.key ? 'true' : 'false',
        onClick: () => setRange(item.key),
      }, t(item.label));

      return ReactDOM.createPortal(
        h('div', {
          className: 'tc-overlay-mask tc-surface',
          onMouseDown: (event) => { if (event.target === event.currentTarget) onClose(); },
        },
          h('div', { className: 'tc-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('dashboard') },
            h('div', { className: 'tc-head' },
              h('h2', null, t('dashboard')),
              h('div', { className: 'tc-seg', role: 'group', 'aria-label': t('dashboard') },
                ...RANGES.map(segment)),
              h('button', { className: 'tc-btn', type: 'button', onClick: onClose }, t('close'))),
            h('div', { className: 'tc-tiles' },
              h(Tile, {
                icon: ICON.wallet,
                label: t('quotaTileOf', { source: sourceName(balance.source, t) }),
                value: quotaTileValue(balance, t),
                sub: quotaSubOf(balance, t), tone: 'cost',
                hint: quotaDetail(balance, t),
              }),
              h(Tile, {
                icon: ICON.sessions, label: t('kpiSessions'), value: String(sessionRows.length),
                // Only sessions whose projections are hydrated carry activity, so
                // the tile counts what it actually priced and names the store size.
                sub: rows.length === ids.length ? null : t('kpiSessionsSub', { total: fmtInt(ids.length) }),
              }),
              h(Tile, { icon: ICON.tokens, label: t('kpiTokens'), value: fmtInt(rangeTokens) }),
              h(Tile, { icon: ICON.cost, label: t('kpiCost'), value: money(pricing, rangeCost, currency), tone: 'cost' }),
              h(Tile, { icon: ICON.cache, label: t('kpiCache'), value: cacheHit })),
            h('div', { className: 'tc-grid' },
              h(WeekChartCard, { t, pricing, week, currency }),
              h(HeatCard, { t, pricing, heatDays, heatMax, days, currency }),
              h(BoardCard, { t, pricing, modelRows, currency }),
              h(SessionListCard, {
                t, pricing, rows: rows, sessionRows, currency, openSession, onClose,
                query, setQuery, sort, setSort,
              }),
              h(TallyCard, { t, title: t('tallyTools'), rows: toolRows, pending: tallyPending }),
              h(TallyCard, { t, title: t('tallyPrograms'), rows: programRows, pending: tallyPending }),
              h(TallyCard, { t, title: t('tallySkills'), rows: skillRows, pending: tallyPending })))),
        document.body);
    }

    /**
     * Sidebar-foot button that also owns the portaled dashboard. The button
     * carries the live subscription figure on its right edge, so the quota is
     * visible without opening anything; pressing it refreshes the read while
     * opening the dashboard.
     */
    function OverviewButton({ t, pricing, store, openSession, useSessions, useSessionStatus, modelDirectories, quota, wide }) {
      const open = React.useSyncExternalStore(store.subscribe, store.getSnapshot, () => false);
      const preference = usePrefsOf(pricing);
      const tier = preference.tier;
      const currency = preference.currency;
      const sessions = useOptional(useSessions, s => s);
      const status = useOptional(useSessionStatus, s => s);
      // The composer's own model picker. A blank session records no
      // `modelSelection` event, so the projection is silent exactly where the
      // input box is the only evidence of which plan the next message will bill;
      // this face reads that picker's store instead.
      const composerFace = composerFaceOf(modelDirectories);
      const mainSessionId = currentSessionIdOf(sessions);
      // The gateway's own model → plan map. Read before the route is resolved so
      // the first frame classifies a gateway row by data instead of by its
      // rendered name (which is empty until the catalog loads).
      const quotaSources = useQuotaSources();
      const quotaOf = React.useMemo(
        () => (provider, model) => quotaSourceIn(quotaSources, provider, model),
        [quotaSources],
      );
      const composerKey = React.useSyncExternalStore(
        React.useMemo(() => (mainSessionId === null ? () => () => {} : composerFace(mainSessionId).subscribe),
          [composerFace, mainSessionId]),
        React.useMemo(() => (mainSessionId === null ? () => null : composerFace(mainSessionId).read),
          [composerFace, mainSessionId]),
        () => null,
      );
      const composerRoute = routeOfComposerKey(composerKey);
      // The composer catalog names the platform behind every gateway route, not
      // just the selected one — the only way a running turn's plan is knowable.
      const composerDescribe = React.useMemo(
        () => (mainSessionId === null
          ? undefined
          : (provider, model) => composerFace(mainSessionId).describe?.(provider, model) ?? ''),
        [composerFace, mainSessionId],
      );
      const balance = useQuota(quota);
      const figure = quotaFigure(balance, t);
      // A figure the client remembers from the last load (or one whose refresh
      // just failed) is dimmed rather than hidden: the number is still the best
      // answer available, it is only not confirmed by this session's own read.
      const fresh = balance.cached === true || balance.stale === true ? 'stale' : balance.status;
      // Windows read as three mini gauges — label, percent and a fill that carries
      // the magnitude — so the foot answers "how much is left" at a glance instead
      // of running three numbers together into one string.
      const windows = balance.status === 'ready' && balance.kind === 'windows' && balance.windows.length > 0
        ? balance.windows
        : null;
      // The paid time ends when the longest window resets: that countdown is what
      // "when does my subscription run out" means for a window-based vendor.
      const cycle = quotaCycleOf(balance);
      const remain = cycle === null ? '' : remainText(cycle.ms, t);
      // The quota answers for the conversation in the main view: while it is
      // working (or waiting on a question, which is not the end of a turn) the
      // route the work is on pays, and only once it is idle does the composer's
      // own choice become the plan the next message will bill. A switch made
      // mid-turn is a promise about the next turn, so it waits.
      //  `null` (nothing known) and `NO_SOURCE` (a gateway with no allowance) both
      // leave the foot without a figure — better blank than another vendor's
      // wallet — but only a real source is remembered, so a new blank session on
      // the same gateway does not fall back to somebody else's plan.
      //
      // The derived answer is settled before it is used: `sessions` and `status`
      // arrive in several passes (list hydration, projection frames, the turn
      // closing), and reading a halfway state paints a figure that lives two
      // frames — the OpenCode flash on a WorkBuddy session.
      // One settler per mount. The resolver reads through a ref so it always sees
      // the current render's snapshot while the committed value survives — that
      // is what makes the debounce work: intermediate snapshots are seen, but
      // only a source that outlives the settle window is ever read and painted.
      const resolveRef = React.useRef(() => sourceOfSessions(sessions, status, null, undefined));
      resolveRef.current = () => sourceOfSessions(sessions, status, composerRoute, composerDescribe, quotaOf);
      const settlerRef = React.useRef(null);
      if (settlerRef.current === null) {
        settlerRef.current = createSourceSettler(() => resolveRef.current(), {
          initial: readStoredSource(),
          materialize: (candidate) => candidate !== null,
        });
      }
      const settler = settlerRef.current;
      const source = React.useSyncExternalStore(settler.subscribe, settler.read, settler.read);

      React.useEffect(() => {
        settler.schedule();
        // A source that was already showable commits synchronously inside
        // `schedule` (notifying subscribers); a deferred one lands on the settle
        // timer and notifies from there, so no extra render is scheduled here.
      }, [settler, sessions, status, composerKey, composerDescribe, quotaOf]);
      React.useEffect(() => () => settler.cancel(), [settler]);
      React.useEffect(() => {
        quota.setSource(source);
        if (source !== null) storeSource(source);
      }, [source, quota]);
      React.useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (event) => { if (event.key === 'Escape') store.set(false); };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
      }, [open, store]);
      const onClose = () => store.set(false);
      const head = h('span', { className: 'tc-entry-head' },
        h('span', { className: 'tc-entry-label' }, t('entry')),
        remain === '' ? null : h('span', {
          className: 'tc-entry-remain', 'data-tone': remainTone(cycle.ms),
          title: t('quotaCycleLine', { time: stampOfMs(cycle.at), left: remain }),
        }, remain));
      const body = figure === ''
        ? null
        : windows === null
          ? h('span', { className: 'tc-entry-quota', 'data-state': balance.status, 'data-fresh': fresh }, figure)
          : h('span', { className: 'tc-entry-gauges', 'data-fresh': fresh },
            windows.map((window) => {
              const percent = Math.round(safeCount(window.percent));
              return h('span', {
                key: window.key, className: 'tc-meter', 'data-tone': windowTone(window.percent),
                title: windowLineOf(window, t),
              },
                h('span', { className: 'tc-meter-head' },
                  h('i', { className: 'tc-meter-label' }, windowName(window, t)),
                  h('b', { className: 'tc-meter-value' }, percent + '%')),
                h('span', { className: 'tc-meter-track', 'aria-hidden': 'true' },
                  h('i', { className: 'tc-meter-fill', style: { width: percent + '%' } })));
            }));
      // The collapsed sidebar is a 36px rail: a two-row card cannot fit, so it
      // collapses to the tightest window plus the countdown, both still live.
      if (wide === false) {
        let tightest = null;
        for (const window of windows === null ? [] : windows) {
          if (tightest === null || window.percent > tightest.percent) tightest = window;
        }
        return h(React.Fragment, null,
          h('button', {
            className: 'tc-btn tc-entry-rail', type: 'button', 'aria-expanded': open ? 'true' : 'false',
            title: quotaDetail(balance, t),
            'aria-label': t('entry') + ' ' + figure,
            onClick: () => { void quota.refresh(true); store.set(!store.getSnapshot()); },
          },
            h('b', { 'data-tone': tightest === null ? 'calm' : windowTone(tightest.percent) },
              tightest === null ? (balance.status === 'ready' ? figure || '—' : '—') : Math.round(safeCount(tightest.percent)) + '%'),
            remain === '' ? null : h('i', { 'data-tone': remainTone(cycle.ms) }, remainCompact(cycle.ms, t))),
          open ? h(OverviewPanel, { t, pricing, sessions, openSession, onClose, tier, currency, quota }) : null);
      }
      return h(React.Fragment, null,
        h('button', {
          className: 'tc-btn tc-entry', type: 'button', 'aria-expanded': open ? 'true' : 'false',
          title: quotaDetail(balance, t),
          onClick: () => { void quota.refresh(true); store.set(!store.getSnapshot()); },
        },
          head,
          body),
        open ? h(OverviewPanel, { t, pricing, sessions, openSession, onClose, tier, currency, quota }) : null);
    }

    // ── §6 composition ───────────────────────────────────────────────────────
    function apply(ctx, pricing) {
      ctx.effect(() => {
        const style = document.createElement('style');
        style.textContent = STYLES;
        style.setAttribute('data-tc-context', '');
        document.head.appendChild(style);
        return () => { style.remove(); };
      }, 'tc-context: styles');
      ctx.effect(() => ctx.locale.register(NS, LOCALE), 'tc-context: dictionaries');
      const t = ctx.locale.bind(NS);
      const uiWorkspace = ctx.get && ctx.get('uiWorkspace');
      const openSession = (id) => {
        try { uiWorkspace?.openSession?.(id); } catch (error) { console.error('[tc-context] openSession failed:', error); }
      };

      const overviewStore = createFlagStore();

      // Subscription balance shown at the sidebar foot; §4b installs its reader.
      const quotaStore = createQuotaStore();
      ctx.effect(() => () => quotaStore.dispose(), 'tc-context: quota store');

      // Gateway model catalog: the settings header chip and the catalog page read
      // one store, so opening either costs one read and shares one paint. The store
      // asks the Host — which answers from the stored list — and follows the
      // background revalidation the Host starts on a stale read.
      const modelsStore = createModelsStore();
      modelsStore.attach((force) => readModelsRoute(force, (url, init) => fetch(url, init)));
      ctx.effect(() => () => modelsStore.dispose(), 'tc-context: model catalog store');

      // 1. `/context` command — client-owned input trigger, no Host command.
      ctx.inject(['inputTriggers'], (ictx) => {
        const triggers = ictx.get('inputTriggers');
        if (!triggers || typeof triggers.registerSource !== 'function') return;
        ictx.effect(() => triggers.registerSource({
          trigger: '/', name: 'context', order: 2,
          candidates: (_session, req) => {
            if (req.position !== 'leading') return Promise.resolve([]);
            const query = String(req.query ?? '').trim().toLowerCase();
            const token = COMMAND_LINE.slice(1);
            if (query !== '' && !token.startsWith(query) && !t('cmdLabel').toLowerCase().startsWith(query)) return Promise.resolve([]);
            return Promise.resolve([{ name: token, label: t('cmdLabel'), section: t('cmdSection'), description: t('cmdDesc') }]);
          },
          onPick: (pick) => { modalStoreOf(pick.session?.sessionId).set(true); return 'handled'; },
          matchEnter: (_session, line) => {
            if (String(line).trim() !== COMMAND_LINE) return Promise.resolve(undefined);
            modalStoreOf(_session?.sessionId).set(true);
            return Promise.resolve('handled');
          },
        }), 'tc-context: command');
      });

      // 2. Centered `/context` modal.
      ctx.effect(() => ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay', id: 'tc-context-modal', order: 20, locale: NS,
        inject: () => ({ hooks: { tcModal: modalStore } }),
      }, (props) => h(ContextModal, { ...props, pricing }))), 'tc-context: modal');

      // 3. Session Context tab (`conversation.view`) + right-sidebar tab.
      // A defensive wrapper keeps one bad card from blanking the whole tab and
      // surfaces the failure in the console for diagnosis.
      function SafeContextView(props) {
        try { return ContextView(props, pricing); }
        catch (error) {
          console.error('[tc-context] ContextView failed:', error);
          return h('div', { className: 'tc-surface tc-panel' },
            h('section', { className: 'tc-card' },
              h('h3', null, t('tab')),
              h('p', { className: 'tc-note' }, String(error && error.message ? error.message : error))));
        }
      }
      const viewComponent = (props) => h(SafeContextView, props);
      ctx.effect(() => ctx.slots.inject('conversation.view', () => ctx.slots.register({
        name: 'conversation.view', id: TAB_ID, order: 20, locale: NS, label: () => t('tab'),
      }, viewComponent)), 'tc-context: tab');

      ctx.inject(['sidebarRightTabs'], (ictx) => {
        const tabs = ictx.get('sidebarRightTabs');
        if (!tabs || typeof tabs.register !== 'function') return;
        ictx.effect(() => tabs.register({
          id: SIDEBAR_KIND, kind: SIDEBAR_KIND, title: () => t('tab'),
          guide: [{ order: 30, title: () => t('tab'), description: () => t('cmdDesc') }],
        }), 'tc-context: sidebar tab type');
        ictx.effect(() => ictx.slots.inject('sidebar.right.pane.tab', () => ictx.slots.register({
          name: 'sidebar.right.pane.tab', key: SIDEBAR_KIND, locale: NS,
        }, viewComponent)), 'tc-context: sidebar tab');
      });

      // 4. Sidebar-foot button; it portals the cross-session dashboard itself,
      //    so no dependency on a root `shell.overlay` declaration timing. The
      //    same button carries the live subscription balance.
      //    `modelDirectories` (the composer's model picker service) is optional:
      //    without it a blank session falls back to its recorded projection, and
      //    a missing service never breaks the foot.
      ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action', id: 'tc-overview', order: 20, locale: NS,
      }, (props) => h(OverviewButton, {
        ...props, t, pricing, store: overviewStore, openSession, quota: quotaStore,
        modelDirectories: ctx.get && ctx.get('modelDirectories'),
      }))), 'tc-context: sidebar button');;

      // 4b. Subscription quota reader. The Host route owns the platform call and
      //     the provider key, so this is one same-origin fetch with no secret in
      //     the page. A missing route (an older Host, or a Host without the
      //     web-server route slot) leaves a plain button: the first read fails
      //     silently and the label stays empty.
      quotaStore.attach((source, force) => readQuotaRoute(source, force, (url, init) => fetch(url, init)));
      ctx.effect(() => () => quotaStore.detach(), 'tc-context: quota reader');
      // 4c. A tab that was hidden (or a laptop that was asleep) fired no interval
      //     for however long it was away, so the figure on screen is hours old by
      //     the time it is looked at again. Re-read on the return instead of
      //     waiting out the next tick; a non-forced read is served from the
      //     Host's own cache when that is still fresh.
      ctx.effect(() => {
        const onVisible = () => {
          if (document.visibilityState === 'visible') void quotaStore.revalidate();
        };
        const onOnline = () => { void quotaStore.revalidate(); };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('online', onOnline);
        return () => {
          document.removeEventListener('visibilitychange', onVisible);
          window.removeEventListener('online', onOnline);
        };
      }, 'tc-context: quota revalidate');

      // 5. Settings → its own「费用」page: every cost preference (badge / pill /
      //    currency / tier / budget) lives in the plugin's own directory entry.
      ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section', id: 'turn-cost', order: 30, label: () => t('nav'), locale: NS,
      }, (props) => h(SettingsSection, { ...props, pricing }))), 'tc-context: settings section');

      ctx.effect(() => ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
        name: 'settings.section.icon', id: 'turn-cost', order: 30, label: () => t('nav'),
      }, (props) => sectionIcon(props === undefined || props === null ? 16 : props.size))), 'tc-context: settings section icon');

      // 6. Settings →「模型」: the gateway catalog page. Opening it (or opening
      //    settings at all, which mounts the header chip) is the lazy trigger —
      //    the list paints from cache and the revalidation happens behind the UI.
      ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section', id: 'tc-models', order: 31, label: () => t('modelsNav'), locale: NS,
      }, (props) => h(ModelsSection, { ...props, t, catalog: modelsStore }))), 'tc-context: model catalog page');

      ctx.effect(() => ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
        name: 'settings.section.icon', id: 'tc-models', order: 31, label: () => t('modelsNav'),
      }, (props) => modelsIcon(props === undefined || props === null ? 16 : props.size))), 'tc-context: model catalog icon');

      ctx.effect(() => ctx.slots.inject('settings.action', () => ctx.slots.register({
        name: 'settings.action', id: 'tc-models-chip', order: 20, locale: NS,
      }, (props) => h(ModelsChip, { ...props, t, catalog: modelsStore }))), 'tc-context: model catalog chip');
    }

    // `models` exposes the catalog store for the Node-side behavioral test
    // (`test/model-catalog-client.test.js`); the web loader only reads `apply`.
    return {
      apply,
      models: {
        emptyCatalog, readCachedCatalog, writeCachedCatalog, catalogSnapshotOf, readModelsRoute,
        createModelsStore, catalogCaps, compactCapacity, syncAgeLabel,
        ModelsSection, ModelsChip, modelRow,
        // The gateway's billing-source map (its `/v1/models` rows carry
        // `quota.source`). Exported so the resolver's inputs can be tested without
        // a browser: the foot's source choice depends on it.
        readCachedQuotaSources, writeCachedQuotaSources, loadQuotaSources, quotaSourceIn,
        QUOTA_SOURCE_CACHE_KEY, QUOTA_SOURCE_TTL_MS, QUOTA_SOURCE_FRESH_MS,
      },
    };
  },
});
