# dsh-turn-cost

[![dsh plugin](https://img.shields.io/badge/DSH-plugin-4d6bfe)](https://github.com/yib0601/dsh-turn-cost)
[![topics](https://img.shields.io/badge/topics-dsh--plugin%20%C2%B7%20deepseek--harness-2ea44f)](https://github.com/topics/dsh-plugin)
[![version](https://img.shields.io/badge/version-1.16.0-blue)](package.json)

> DSH 插件（`dsh-plugin`）。标签：`dsh` · `dsh-plugin` · `deepseek-harness` · `deepseek` · `plugin` · `cost-tracking` · `token-usage` · `llm-pricing` · `dashboard`

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）Web 端加两个能力：**按官方单价把每一轮的 token 用量换算成钱**，以及**跨会话「用量总览」（替代 `dsh-context`）**。

- 逐轮徽章：每个 assistant 动作后面跟一枚金额徽章，点开看 input / cacheRead / cacheWrite / output 四个 token 桶各花了多少
- 底部会话累计：状态栏一枚药丸显示本会话累计花费；设了预算后显示 `花费 / 预算` 与进度条，超支转红
- 币种 CNY（默认）/ USD 可切：CNY 优先用厂商官方人民币行，缺省按汇率折算并标 `fx`
- DeepSeek 峰谷分时计价：历史金额按请求发生时刻落档，不按「现在」重定价
- 用量总览：跨会话仪表盘（KPI、构成、环形图、趋势、模型花费榜、7 日双指标、周对齐热力图）、会话「上下文」页签、`/context` 命令弹窗、右侧栏 Context 页签、Agent 家族卡（上下文页内）、逐请求浏览器（筛选 / 排序 / CSV / 分页）
- 上下文明细：「上下文」页新增一张卡，把「已用 174K」拆到条目——**每个工具定义**各自的估价（86 个工具不再是一个匿名 17K）、**系统提示词分区**（按标题 / `【…】` 标签 / 三段式 banner 切分，逐区估价 + **点开读完整正文**）、**消息构成**（用户输入 / 助手回答 / 助手思考 / 工具参数 / 工具结果，各给条数与占比）、**占用最大的 24 条**（带工具名、轮次与预览）；每行都能展开读正文；卡内三个页签 + 名称/内容搜索 + 按大小/名称排序。**四层视觉层级**：整窗摘要条（三段占比与图例）→ 带条目计数徽标的页签 → 本页签量级行（总量 / 占上下文 / 条目数，附搜索与排序）→ 带列头的条目行（名称 · 一行摘要 · 量级条 · tokens · 占比，头名行加强、其余淡出）；数字各有分母，窄到右栏宽度自动收起摘要列与量级条。三项合计与 DSH 内置 `contextBreakdown` 逐项相等（同一会话日志实测 `8104 / 17129 / 356622` 完全一致），不是另一套口径，只是把同一笔账拆开
- 订阅额度 + 到期倒计时：侧栏脚「用量总览」是一条两行卡片——第一行标题右侧是「剩 12 天」倒计时（取最长额度窗口的重置时刻，≤7 天转黄、≤3 天转红），第二行是 5 小时 / 周 / 月三条微型计量条；侧栏折叠时收成一枚「54% / 12天」小方块。按请求的 **provider id** 自动选源（同名的 `deepseek-v4.1-flash` 可能由 DeepSeek 官方、OpenCode 或 `ai-router` 服务，只有 provider 说明是谁的订阅在扣）：OpenCode Go 给三档用量窗口，DeepSeek 给账户余额（充值 / 赠送拆项在悬浮明细里）；改模型立即换源；自建网关（如 `ai-router`）按上游密钥计费、网关自身不设配额，卡片只写「此供应商无额度可查」而不显示任何数字、也不发额度请求；认不出供应商同样留白而不是猜一个源。仪表盘磁贴主数字是最紧那档、副行是倒计时。**先画上次读数再静默回填**：每次成功读数按源缓存在 `localStorage`，刷新页面 / chunk 重载时立刻显示上次的数字而不是「读取中…」，后台再静默读一次覆盖它（缓存 5 小时过期，任一窗口已重置即作废）；读失败时保留旧数字并标注「正在后台重试」，轮询 5 分钟一次，标签页回到前台或网络恢复时也补读一次。Host 侧读密钥、按源 5 分钟缓存，页面拿不到密钥
- 模型清单自动同步 + 「模型目录」页（自建网关）：`ai-router` 这类 **pi-ai 内置目录之外的 provider 路由**在 DSH 里没有运行时模型目录——profile 里声明的 `models` 就是模型选择器。插件在**你查看模型时**（设置面板一打开，或点进「设置 → 模型目录」）先画上次的清单、再在后台静默核对网关，核对结果有变化才写回；同一窗口内不重复打网关。核对时逐行生成条目（显示名 `<平台> · <计费> · <名字> · <窗口>` / `<名字> · <计费>自动降级`、输入模态、上下文与输出上限、思考档位与两个 `anthropic-messages` compat 开关），与已存清单逐条比较，**只在不一致时**经 DSH 的 `settings` 服务整体写回（校验条目 + 落盘 profile + 重建 provider 一个事务，不打任何 DSH 补丁、不改 `node_modules`、不直接写 profile 文件）。拉取失败 / 清单为空 / 显示名越界（含 router 历史标记）一律保持旧清单；行上没声明的模态与档位不补不猜。状态与手动触发：`GET /dsh-turn-cost/models[?force=1]`。零配置，环境变量见下
- 项目记忆（原 `dsh-project-memory` 合成一个插件）：给会话一套**跨轮跨会话的长期记忆**——文档与代码符号索引（带 `path:line` 引用）、经验条目（lesson `问题 → 修法`、decision `选了什么 + 为什么`、procedure 步骤、experience 记录）、以及带步骤与热文件的任务记录。每步可选静默注入一段记忆（entry 常驻块 + 相关性门控 + 单会话预算；同一条不重发），召回按 BM25（可选 leanvec 向量层重排）跨三层检索；写入侧做近重复检测与分层强化、超容量归档。**12 个工具**（`list_tasks` / `select_task` / `archive_task` / `show_task_panel` / `index_doc` / `index_repo` / `query_memory` / `remember` / `forget` / `save_lesson` / `watch_repo` / `pm_stats`）+ 唯一命令 `/tasks`（裸 `/tasks` 给任务清单快照，动作由面板按钮驱动）+ 宿主 skill `project-memory`。界面是懒加载的第三个 chunk：任务面板（`shell.overlay` 浮层，任务页 / 记忆页 / 新建表单 / 分页）、`/tasks` 的命令节点、`show_task_panel` 的工具视图、`/` 菜单的「工作流」组，以及插件详情页的可视化设置卡（启动全量索引 / 刷新间隔 / 检索时扩展查询）。索引与召回全本地，索引期零 LLM 调用；数据落在项目根的 `.dsh-project-memory/`，家目录 / 系统目录默认拒绝当根
- 费用偏好、预算、显隐开关全在插件自有设置页，`localStorage` 本地持久化

| 逐轮徽章 | 会话累计与预算 |
|---|---|
| ![badge](docs/shots/badge-details.png) | ![dashboard](docs/shots/dashboard.png) |

| 上下文页签 | 设置页 |
|---|---|
| ![context tab](docs/shots/context-tab.png) | ![settings](docs/shots/settings-page.png) |

| 上下文明细（点开任一条读正文：提示词某一段、某个工具的真实 schema） |
|---|
| ![context items](docs/shots/context-items.png) |

| 订阅余额（侧栏脚 + 仪表盘磁贴） |
|---|
| ![subscription balance](docs/shots/subscription-balance.png) |

更多截图见 [`docs/shots/`](docs/shots/)。

## 安装

插件以 `link:` 方式挂进 DSH profile（改完源码重启即生效，无需发版）：

```bash
git clone https://github.com/yib0601/dsh-turn-cost.git
cd dsh-turn-cost
dsh plugin --profile web add "link:$PWD"
```

装完重启 `dsh web`。

模型清单同步零配置即开（默认同步 `ai-router`、每 10 分钟一轮、启动 20s 后首轮）。需要改时用环境变量：

| 变量 | 默认 | 作用 |
|---|---|---|
| `DSH_TURN_COST_MODEL_SYNC` | 开 | `0` / `off` 关闭整个循环 |
| `DSH_TURN_COST_MODEL_ROUTES` | `ai-router` | 逗号分隔的 provider 路由（`llm-pi-ai` 的 `providers` 键） |
| `DSH_TURN_COST_MODEL_SYNC_MS` | `600000` | 兜底轮询间隔（毫秒）；设 `0` 即完全不轮询，只在查看模型时核对 |
| `DSH_TURN_COST_MODEL_BOOT_MS` | `20000` | 首轮延迟（毫秒） |
| `DSH_TURN_COST_MODEL_STALE_MS` | `300000` | 读请求认定「缓存过期、该后台核对」的年龄 |
| `DSH_TURN_COST_SETTINGS_NS` | `llm-pi-ai` | 承载 `providers` 的 settings 条目 id |

`package.json` 里的 `dsh.compatibility.dshReleases` 声明了已适配的 DSH 版本（0.2.2-rc.2 至 rc.5）。

## 结构

| 文件 | 角色 |
|---|---|
| `index.js` | Host 入口：注册 3 个 `tc*` session 投影（timeline / headers / activity）、额度路由、模型清单同步，并挂载项目记忆引擎（两边各自 try/catch，一边失败不连坐另一边） |
| `src/memory/` | 项目记忆 Host 半边（64 个文件，按职责分目录）：`chunker` / `doc-index` / `index-pipeline`（索引）· `recall` / `vector-index` / `similarity`（三层检索 + 可选向量重排）· `auto-inject` / `inject-visible`（每步注入与预算）· `insight-store` / `store`（经验实体与落盘）· `watch` / `lazy`（增量与懒索引）· `tools/` · `commands/` · `util/` |
| `skills/project-memory/` | 宿主 skill（`SKILL.md` + `scripts/pm-digest.mjs` 体检脚本），随包发布 |
| `host/schema.js`、`host/fold.js`、`host/projections.js` | Host 侧折叠：token 桶、峰谷分档、命令 / 文件 / 工具调用流水（纯 Node，防御式） |
| `host/model-sync/` | Host 侧模型清单自动同步（缓存优先：读用已存清单应答，stale 时后台核对）：`naming.js`（显示名语义与幂等剥壳）· `catalog.js`（行 → DSH 条目）· `listing.js`（拉取与解析 `/v1/models`）· `sync.js`（比较与写回策略）· `mount.js`（settings/credentials/定时/状态路由） |
| `client.js` | Client 入口：官方价目表与算价纯函数、本地偏好 store、徽章 / 药丸、槽位注册 |
| `client.context.js` | 懒加载 chunk：仪表盘、上下文页签（含 Agent 家族卡）、`/context` 弹窗 |
| `client.memory.js` | 项目记忆的懒加载 chunk（由 `client-memory-src/` 的 23 个模块按宿主 `__ModuleLoader__` 协议装配；源码一改就要重新装配并 touch `client.js`）：任务面板、`/tasks` 命令节点、`show_task_panel` 工具视图、`/` 菜单「工作流」斜杠源、插件设置卡 |
| `locale/{zh,en}.json` | 两个 locale 命名空间 `turnCost` / `tcContext` |
| `contracts/modules.yaml` | 模块契约（负责 / 不负责 / 对外暴露） |
| `test/` | `node --test test/`，价目表、Host 折叠/额度/模型同步的纯函数与路由测试，外加模型目录页的渲染与缓存优先行为测试（`model-catalog-client.test.js` 用桩 React 直接执行组件与 store） |

设计取舍、数据契约（读哪些投影字段、封顶多少条）见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)；价目表与峰谷规则见 [`docs/PRICING.md`](docs/PRICING.md)；功能细节见 [`docs/DETAIL.md`](docs/DETAIL.md)。

## 测试

```bash
node --test test/
```

## 边界

只用官方价目表（不采信 models.dev 之类第三方价格）；只换算 DSH 已经折叠好的 token 用量，不重算、不改写会话日志、不 append 任何 session 事件；不统计联网搜索 / OCR 等按次计费项；上下文浏览器里的「请求内容」只渲染页面内存中的聊天快照，关页即消失。
