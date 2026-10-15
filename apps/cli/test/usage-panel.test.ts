import { afterEach, describe, expect, it, vi } from "vitest";
import { stripTerminalSequences, visibleWidth } from "@step-harness/pi-tui";
import { initTheme, type UsagePresentation } from "@step-harness/coding-agent";
import { UsagePanel, usagePresentationRows } from "../src/ui/view/dialogs/usage-panel.ts";

function model(view: UsagePresentation["view"] = "account"): UsagePresentation {
	const account = { status: "ready" as const, account: { presence: "present" as const, eligible: true, source: "plan", accountId: "123" }, receivedAt: Date.now(), snapshot: { schema_version: 1 as const, observed_at_ms: Date.now(), scope: "personal_account" as const, account: { id: "123" }, plan: { state: "known" as const, family: "coding" as const, name: "Pro", subscription: null }, quota: { state: "known" as const, allowed: true, reason: null, windows: [{ id: "weekly" as const, limited: true, used_percent: 13, resets_at_ms: Date.now() + 100000 }, { id: "five_hour" as const, limited: false, used_percent: null, resets_at_ms: null }], credit_buckets: [] } } };
	return { view, account, status: { version: "1.0", model: "step-model", provider: "step", reasoning: "high", directory: "/work", permissions: "Ask", trusted: true, agents: ["/work/AGENTS.md"], collaboration: "Default", session: "session", state: "idle", context: "10/100", cached: account, account: account.account }, session: { input: 20, output: 2, total: 22, cacheRead: 3, cacheWrite: 0, cacheHit: .15, invalid: 0, missing: 0 }, scope: "all", selectedDate: "2026-10-13", select: vi.fn(), refresh: vi.fn(), selectScope: vi.fn() };
}
afterEach(() => initTheme("dark"));
describe("Usage and Status presentation", () => {
	it("shows only Overview/Account tabs and different used/remaining quota wording", () => {
		const account = usagePresentationRows(model()).join("\n"), status = usagePresentationRows(model("status")).join("\n");
		expect(account).toContain("1 Overview   [2 Account]"); expect(account).not.toMatch(/3 Session|4 History/u); expect(account).toContain("13.0% used"); expect(status).toContain("87.0% left"); expect(status).toContain("Permissions:"); expect(status).toContain("Session:"); expect(status).toContain("no network request");
	});
	it("preserves Credit precision and hides unknown bucket amounts", () => {
		const m = model(); m.account.snapshot!.plan.family = "token"; m.account.snapshot!.quota.windows = [];
		m.account.snapshot!.quota.credit_buckets = [{ type: "topup", total: "9007199254740993", remaining: "9007199254740992", used_percent: 0, resets_at_ms: null, expires_at_ms: null }, { type: "future", unsupported: true, total: "0", remaining: "0", used_percent: null, resets_at_ms: null, expires_at_ms: null }];
		const rendered = usagePresentationRows(m).join("\n"); expect(rendered).toContain("9,007,199,254,740,993"); expect(rendered).toContain("Unsupported bucket type: future");
	});
	it("fits narrow terminals, keeps only the documented tab shortcuts and scrolls", () => {
		initTheme("step-blue"); const m = model(), close = vi.fn(), panel = new UsagePanel(m, vi.fn(), close, () => 18);
		for (const width of [24, 60, 120]) for (const row of panel.render(width)) expect(visibleWidth(row)).toBeLessThanOrEqual(width);
		panel.handleInput("3"); expect(m.select).not.toHaveBeenCalled(); panel.handleInput("1"); expect(m.select).toHaveBeenCalledWith("overview"); panel.handleInput("r"); expect(m.refresh).toHaveBeenCalledOnce(); panel.handleInput("\u001b"); expect(close).toHaveBeenCalledOnce();
		m.view = "status"; expect(panel.render(60).map(stripTerminalSequences).join("\n")).toContain("Model:"); panel.handleInput("\u001b[6~"); expect(panel.render(60).map(stripTerminalSequences).join("\n")).toContain("Weekly");
	});
});
