import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { InMemorySettingsStorage, type Settings, SettingsManager } from "../src/core/settings-manager.ts";
import { getActiveLanguage, setActiveLanguage, t } from "../src/i18n/index.ts";
import { readStepConfig } from "../src/step/config-toml.ts";
import { createStepSettingsManager } from "../src/step/settings-manager.ts";

function createManager(global: Settings = {}, project: Settings = {}, projectTrusted = true) {
	const storage = new InMemorySettingsStorage();
	storage.withLock("global", () => JSON.stringify(global));
	storage.withLock("project", () => JSON.stringify(project));
	return { manager: SettingsManager.fromStorage(storage, { projectTrusted }), storage };
}

function expectLanguage(manager: SettingsManager, language: "en" | "zh") {
	expect(manager.getLanguage()).toBe(language);
	expect(getActiveLanguage()).toBe(language);
	expect(t("language.usage")).toBe(language === "en" ? "Usage: /language <en|zh>" : "用法：/language <en|zh>");
}

afterEach(() => setActiveLanguage("en"));

describe("SettingsManager effective language", () => {
	it("loads the default and persists a global language across reload", async () => {
		const { manager, storage } = createManager({ theme: "keep" });
		expectLanguage(manager, "en");
		manager.setLanguage("zh");
		expectLanguage(manager, "zh");
		await manager.flush();
		storage.withLock("global", (current) => {
			expect(JSON.parse(current!)).toEqual({ theme: "keep", language: "zh" });
			return undefined;
		});
		await manager.reload();
		expectLanguage(manager, "zh");
		expectLanguage(SettingsManager.fromStorage(storage), "zh");
	});

	it("keeps trusted project precedence when changing the global default", async () => {
		const { manager, storage } = createManager({ language: "en" }, { language: "zh", theme: "keep" });
		expectLanguage(manager, "zh");
		manager.setLanguage("en");
		expectLanguage(manager, "zh");
		await manager.flush();
		expect(manager.getGlobalSettings().language).toBe("en");
		storage.withLock("project", (current) => {
			expect(JSON.parse(current!)).toEqual({ language: "zh", theme: "keep" });
			return undefined;
		});
		await manager.reload();
		expectLanguage(manager, "zh");
		expectLanguage(SettingsManager.fromStorage(storage), "zh");
	});

	it("uses only the global language until project trust is granted and after it is revoked", async () => {
		const { manager } = createManager({ language: "zh" }, { language: "zh" }, false);
		manager.setLanguage("en");
		expectLanguage(manager, "en");
		await manager.reload();
		expectLanguage(manager, "en");
		manager.setProjectTrusted(true);
		expectLanguage(manager, "zh");
		manager.setProjectTrusted(false);
		expectLanguage(manager, "en");
	});

	it("normalizes an invalid project language consistently during a global write", async () => {
		const { manager } = createManager({ language: "zh" }, { language: "fr" as never });
		expectLanguage(manager, "en");
		manager.setLanguage("zh");
		expectLanguage(manager, "en");
		await manager.reload();
		expectLanguage(manager, "en");
	});

	it("synchronizes temporary overrides and subsequent global and project merges", async () => {
		const { manager } = createManager({ language: "en" });
		manager.applyOverrides({ language: "zh" });
		expectLanguage(manager, "zh");
		expect(manager.getGlobalSettings().language).toBe("en");
		manager.setTheme("keep");
		expectLanguage(manager, "en");
		manager.applyOverrides({ language: "zh" });
		manager.setProjectExtensionPaths([]);
		expectLanguage(manager, "en");
		manager.applyOverrides({ language: "zh" });
		await manager.reload();
		expectLanguage(manager, "en");
	});

	it("forwards language writes through the Step decorator and preserves project TOML", async () => {
		const root = mkdtempSync(join(tmpdir(), "step-language-"));
		const paths = { global: join(root, "global.toml"), project: join(root, "project.toml") };
		const project = '# Project settings\nlanguage = "zh"\npermissionPreset = "ask"\n';
		try {
			writeFileSync(paths.global, '# Global settings\nlanguage = "zh"\ntheme = "keep"\n');
			writeFileSync(paths.project, project);
			const manager = createStepSettingsManager(root, join(root, "agent"), { paths });
			expectLanguage(manager, "zh");
			manager.setLanguage("en");
			expectLanguage(manager, "zh");
			await manager.flush();
			expect(readStepConfig(paths.global)).toEqual({ language: "en", theme: "keep" });
			expect(readFileSync(paths.project, "utf8")).toBe(project);
			await manager.reload();
			expectLanguage(manager, "zh");
			manager.setProjectTrusted(false);
			expectLanguage(manager, "en");
			manager.setProjectTrusted(true);
			expectLanguage(manager, "zh");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
