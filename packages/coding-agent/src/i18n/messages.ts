/**
 * User-facing static strings, one table per language.
 *
 * Scope is deliberately narrow: static chrome text (startup diagnostics,
 * welcome block, footer, status row, status tips) plus the `/language` command
 * output. Model output, the system prompt, and anything derived from user or
 * provider data stay untranslated.
 *
 * `zh` is typed as `Record<MessageKey, string>`, so a missing or extra key is a
 * compile error — the two tables cannot drift apart. `i18n-messages.test.ts`
 * re-checks the same invariant at runtime for editors that skip type errors.
 *
 * Placeholders are `{name}`-style and filled by `translate()`.
 */

export const en = {
	// Startup diagnostics section headers.
	"diagnostics.skillConflicts": "[Skill conflicts]",
	"diagnostics.promptConflicts": "[Prompt conflicts]",
	"diagnostics.extensionIssues": "[Extension issues]",
	"diagnostics.themeConflicts": "[Theme conflicts]",

	// MCP startup warnings.
	"mcp.couldNotStart": "MCP server '{name}' could not start: {detail}",
	"mcp.couldNotStartAuth":
		"MCP server '{name}' could not start: {detail}\nAuthenticate with: step mcp login {server}, then restart Step.",
	"mcp.couldNotStartMissingExecutable":
		"MCP server '{name}' could not start: '{command}' is not installed or not on PATH. {remedy}",
	"mcp.remedyInstall": "Install it with: {command}, then restart Step.",
	"mcp.remedyInstallGeneric": "Install it, then restart Step.",
	"mcp.discoveryFailed": "MCP discovery failed: {error}",

	// /language command output.
	"language.current": "UI language: {language} ({code})",
	"language.usage": "Usage: /language <en|zh>",
	"language.switched": "UI language set to {language} ({code}).",
	"language.overridden":
		"Global UI language set to {language} ({code}). Project settings keep the UI language at {effectiveLanguage} ({effectiveCode}).",
	"language.unknown": 'Unknown language "{value}". Available languages: {available}.',

	// Welcome block.
	"welcome.tips": "Tips",
	"welcome.firstSessionHint": "Your first message will start a new session.",
	"welcome.unknownModel": "unknown model",
	"welcome.label.session": "session",
	"welcome.label.model": "model",
	"welcome.label.cwd": "cwd",
	"welcome.tip.cron": "View and manage scheduled tasks.",
	"welcome.tip.goal": "Set a goal and keep working toward it across turns.",
	"welcome.tip.ultracode": "Use parallel agents for this session. One turn: ultracode: task.",

	// Footer.
	"footer.contextLeft": "{percent}% context left",
	"footer.thinkingOff": "thinking off",

	// Status row.
	"status.waitingForApproval": "Waiting for approval…",
	"status.thinking": "Thinking...",
	"status.working": "Working...",
	"status.compactingContext": "Compacting context... {hint}",
	"status.autoCompacting": "Auto-compacting... {hint}",
	"status.autoCompactingOverflow": "Context overflow detected, auto-compacting... {hint}",
	"status.summarizingBranch": "Summarizing branch... {hint}",

	// Status tips (one per turn, under the working status row).
	"statusTip.theme": "Use /theme to switch themes (step-blue / step-violet)",
	"statusTip.model": "Use /model to switch models",
	"statusTip.expandToolOutput": "Press {key} to expand tool output",
	"statusTip.autocompletePaths": "Type @ to autocomplete file paths",
	"statusTip.queueWhileWorking": "Press Enter while working to queue a message",
	"statusTip.goalStatus": "Use /goal status to inspect progress and usage",
	"statusTip.goalPause": "Use /goal pause to pause; /goal resume continues it",
	"statusTip.goalEdit": "Use /goal edit to revise the current objective",
	"statusTip.goalClear": "Use /goal clear to end the current goal",
	"statusTip.goalResume": "Use /goal resume to continue the current goal",
	"statusTip.goalEditOrClear": "Use /goal edit to revise the goal, or /goal clear to drop it",
	"statusTip.goalStart": "Use /goal to set a long-running task and keep working across turns",
} as const;

export type MessageKey = keyof typeof en;

export type MessageParams = Record<string, string | number>;

export const zh: Record<MessageKey, string> = {
	// 启动诊断分区标题
	"diagnostics.skillConflicts": "[技能冲突]",
	"diagnostics.promptConflicts": "[提示词冲突]",
	"diagnostics.extensionIssues": "[扩展问题]",
	"diagnostics.themeConflicts": "[主题冲突]",

	// MCP 启动告警
	"mcp.couldNotStart": "MCP 服务器 '{name}' 启动失败：{detail}",
	"mcp.couldNotStartAuth":
		"MCP 服务器 '{name}' 启动失败：{detail}\n请先执行 step mcp login {server} 完成认证，然后重启 Step。",
	"mcp.couldNotStartMissingExecutable": "MCP 服务器 '{name}' 启动失败：未安装 '{command}' 或不在 PATH 中。{remedy}",
	"mcp.remedyInstall": "请先执行 {command} 安装，然后重启 Step。",
	"mcp.remedyInstallGeneric": "请先安装，然后重启 Step。",
	"mcp.discoveryFailed": "MCP 发现失败：{error}",

	// /language 命令输出
	"language.current": "界面语言：{language}（{code}）",
	"language.usage": "用法：/language <en|zh>",
	"language.switched": "界面语言已切换为{language}（{code}）。",
	"language.overridden":
		"全局界面语言已设为{language}（{code}）。项目设置使界面语言保持为{effectiveLanguage}（{effectiveCode}）。",
	"language.unknown": "未知语言“{value}”。可用语言：{available}。",

	// 欢迎区块
	"welcome.tips": "提示",
	"welcome.firstSessionHint": "发送第一条消息即可开始新会话。",
	"welcome.unknownModel": "未知模型",
	"welcome.label.session": "会话",
	"welcome.label.model": "模型",
	"welcome.label.cwd": "目录",
	"welcome.tip.cron": "查看和管理定时任务。",
	"welcome.tip.goal": "设定目标，并在多轮对话中持续推进。",
	"welcome.tip.ultracode": "在当前会话中使用并行智能体。单轮用法：ultracode: 任务。",

	// 底部状态栏
	"footer.contextLeft": "剩余上下文 {percent}%",
	"footer.thinkingOff": "思考已关闭",

	// 状态行
	"status.waitingForApproval": "等待批准…",
	"status.thinking": "思考中...",
	"status.working": "处理中...",
	"status.compactingContext": "正在压缩上下文... {hint}",
	"status.autoCompacting": "正在自动压缩... {hint}",
	"status.autoCompactingOverflow": "检测到上下文溢出，正在自动压缩... {hint}",
	"status.summarizingBranch": "正在总结分支... {hint}",

	// 状态提示（每轮一条，位于工作状态行下方）
	"statusTip.theme": "使用 /theme 切换主题（step-blue / step-violet）",
	"statusTip.model": "使用 /model 切换模型",
	"statusTip.expandToolOutput": "按 {key} 展开工具输出",
	"statusTip.autocompletePaths": "输入 @ 自动补全文件路径",
	"statusTip.queueWhileWorking": "运行期间按 Enter 可排队消息",
	"statusTip.goalStatus": "使用 /goal status 查看进度与用量",
	"statusTip.goalPause": "使用 /goal pause 暂停；/goal resume 继续",
	"statusTip.goalEdit": "使用 /goal edit 修改当前目标",
	"statusTip.goalClear": "使用 /goal clear 结束当前目标",
	"statusTip.goalResume": "使用 /goal resume 继续当前目标",
	"statusTip.goalEditOrClear": "使用 /goal edit 修改目标，或用 /goal clear 放弃目标",
	"statusTip.goalStart": "使用 /goal 设定长期任务，跨轮次持续推进",
};

export const MESSAGES: Record<"en" | "zh", Record<MessageKey, string>> = { en, zh };
