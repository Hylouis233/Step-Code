import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InMemorySettingsStorage, SettingsManager } from "../src/core/settings-manager.ts";
import { StepTomlSettingsStorage } from "../src/step/config-toml.ts";

function createManager(global: Record<string, unknown>, project: Record<string, unknown> = {}, projectTrusted = true) {
	const storage = new InMemorySettingsStorage();
	storage.withLock("global", () => JSON.stringify(global));
	storage.withLock("project", () => JSON.stringify(project));
	return { manager: SettingsManager.fromStorage(storage, { projectTrusted }), storage };
}

describe("ultracode default consent", () => {
	it.each([null, "false", "true", 0, 1, {}, []])("rejects malformed JSON value %j", (value) => {
		const { manager } = createManager({ ultracodeDefault: value });
		expect(manager.getUltracodeDefault()).toBe(false);
		expect(manager.getGlobalSettings().ultracodeDefault).toEqual(value);
	});

	it.each([
		{ global: true, project: false, expected: false },
		{ global: false, project: true, expected: true },
		{ global: true, project: "false", expected: false },
		{ global: false, project: "true", expected: false },
	])("honors trusted project precedence: $global / $project", ({ global, project, expected }) => {
		const { manager } = createManager({ ultracodeDefault: global }, { ultracodeDefault: project });
		expect(manager.getUltracodeDefault()).toBe(expected);
	});

	it("ignores untrusted project settings and tracks trust transitions", () => {
		const { manager } = createManager({ ultracodeDefault: false }, { ultracodeDefault: true }, false);
		expect(manager.getUltracodeDefault()).toBe(false);
		manager.setProjectTrusted(true);
		expect(manager.getUltracodeDefault()).toBe(true);
		manager.setProjectTrusted(false);
		expect(manager.getUltracodeDefault()).toBe(false);
	});

	it("preserves the configured default across unrelated saves and reads a reload", async () => {
		const { manager, storage } = createManager({ ultracodeDefault: true });
		manager.setTheme("light");
		await manager.flush();
		expect(SettingsManager.fromStorage(storage).getUltracodeDefault()).toBe(true);
		storage.withLock("global", () => JSON.stringify({ ultracodeDefault: false }));
		await manager.reload();
		expect(manager.getUltracodeDefault()).toBe(false);
	});

	it("does not rewrite malformed saved preferences", async () => {
		const { manager, storage } = createManager({ ultracodeDefault: "false" });
		expect(manager.getUltracodeDefault()).toBe(false);
		manager.setTheme("light");
		await manager.flush();
		storage.withLock("global", (current) => {
			expect(JSON.parse(current!).ultracodeDefault).toBe("false");
			return undefined;
		});
	});
});

describe("ultracode default TOML storage", () => {
	it.each([
		{ raw: "true", expected: true },
		{ raw: "false", expected: false },
		{ raw: '"false"', expected: false },
	])("reads $raw without truthiness coercion", ({ raw, expected }) => {
		const dir = mkdtempSync(join(tmpdir(), "step-ultracode-default-"));
		try {
			const global = join(dir, "global.toml");
			writeFileSync(global, `ultracodeDefault = ${raw}\n`);
			const storage = new StepTomlSettingsStorage(dir, {}, { global, project: join(dir, "project.toml") });
			expect(SettingsManager.fromStorage(storage).getUltracodeDefault()).toBe(expected);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
