import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type CustomEntry, SessionManager } from "../../src/core/session-manager.ts";
import { assistantMsg, userMsg } from "../utilities.ts";

describe("SessionManager.saveCustomEntry", () => {
	it("saves custom entries and includes them in tree traversal", () => {
		const session = SessionManager.inMemory();

		// Save a message
		const msgId = session.appendMessage({ role: "user", content: "hello", timestamp: 1 });

		// Save a custom entry
		const customId = session.appendCustomEntry("my_data", { foo: "bar" });

		// Save another message
		const msg2Id = session.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "hi" }],
			api: "anthropic-messages",
			provider: "anthropic",
			model: "test",
			usage: {
				input: 1,
				output: 1,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 2,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: 2,
		});

		// Custom entry should be in entries
		const entries = session.getEntries();
		expect(entries).toHaveLength(3);

		const customEntry = entries.find((e) => e.type === "custom") as CustomEntry;
		expect(customEntry).toBeDefined();
		expect(customEntry.customType).toBe("my_data");
		expect(customEntry.data).toEqual({ foo: "bar" });
		expect(customEntry.id).toBe(customId);
		expect(customEntry.parentId).toBe(msgId);

		// Tree structure should be correct
		const path = session.getBranch();
		expect(path).toHaveLength(3);
		expect(path[0].id).toBe(msgId);
		expect(path[1].id).toBe(customId);
		expect(path[2].id).toBe(msg2Id);

		// buildSessionContext should work (custom entries skipped in messages)
		const ctx = session.buildSessionContext();
		expect(ctx.messages).toHaveLength(2); // only message entries
	});
});

const roots: string[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function persistedFixture(flush: boolean) {
	const directory = mkdtempSync(join(tmpdir(), "step-session-rollback-"));
	roots.push(directory);
	const session = SessionManager.create(directory, directory);
	session.appendMessage(userMsg("hello"));
	if (flush) session.appendMessage(assistantMsg("ready"));
	return { directory, session, file: session.getSessionFile()! };
}

describe("SessionManager failed persistence", () => {
	it.each(["partial", "complete"])("restores persisted bytes after a %s append fails", (kind) => {
		const { directory, session, file } = persistedFixture(true);
		const before = readFileSync(file);
		const leaf = session.getLeafId();
		vi.spyOn(session, "_persist").mockImplementationOnce((entry) => {
			const line = `${JSON.stringify(entry)}\n`;
			appendFileSync(file, kind === "partial" ? line.slice(0, 37) : line);
			throw new Error("write or close failed");
		});
		expect(() => session.appendCustomEntry("ultraloop-session-mode", { enabled: true })).toThrow(
			"write or close failed",
		);
		expect(session.getLeafId()).toBe(leaf);
		expect(readFileSync(file)).toEqual(before);
		expect(SessionManager.open(file, directory).getEntries()).toEqual(session.getEntries());
		// A subsequent append remains readable and does not resurrect the rejected mode.
		session.appendCustomEntry("next-control", { enabled: false });
		expect(SessionManager.open(file, directory).getEntries()).toEqual(session.getEntries());
		expect(readFileSync(file, "utf8")).not.toContain("ultraloop-session-mode");
	});

	it("removes a failed first flush and retries all buffered entries", () => {
		const { directory, session, file } = persistedFixture(false);
		expect(existsSync(file)).toBe(false);
		vi.spyOn(session, "_persist").mockImplementationOnce(() => {
			writeFileSync(file, '{"type":"session"');
			throw new Error("first flush failed");
		});
		expect(() => session.appendMessage(assistantMsg("rejected"))).toThrow("first flush failed");
		expect(existsSync(file)).toBe(false);
		session.appendMessage(assistantMsg("accepted"));
		expect(SessionManager.open(file, directory).getEntries()).toEqual(session.getEntries());
		expect(readFileSync(file, "utf8")).not.toContain("rejected");
	});

	it("does not delete another writer's file when exclusive creation fails", () => {
		const { session, file } = persistedFixture(false);
		vi.spyOn(session, "_persist").mockImplementationOnce(() => {
			writeFileSync(file, "other writer");
			throw Object.assign(new Error("already exists"), { code: "EEXIST" });
		});
		expect(() => session.appendMessage(assistantMsg("rejected"))).toThrow("already exists");
		expect(readFileSync(file, "utf8")).toBe("other writer");
	});

	it("reports rollback failure and blocks subsequent writes to the uncertain journal", () => {
		const { session, file } = persistedFixture(true);
		const remove = vi.spyOn(session, "_persist").mockImplementationOnce(() => {
			rmSync(file);
			throw new Error("persist failed");
		});
		expect(() => session.appendCustomEntry("rejected", {})).toThrow(/could not be rolled back/);
		expect(() => session.appendCustomEntry("later", {})).toThrow(/repair the journal/);
		expect(remove).toHaveBeenCalledTimes(1);
	});
});
