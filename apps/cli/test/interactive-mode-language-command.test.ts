import { getActiveLanguage, setActiveLanguage, SettingsManager } from "@step-harness/coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemorySettingsStorage } from "../../../packages/coding-agent/src/core/settings-manager.ts";
import { InteractiveMode } from "../src/ui/interactive-mode.ts";
import { createFakeInteractiveContext } from "./support/fake-interactive-context.ts";

type LanguageCommandContext = {
	settingsManager: SettingsManager;
};

type InteractiveModePrototype = {
	handleLanguageCommand(this: unknown, searchTerm?: string): void;
};

const interactiveModePrototype = InteractiveMode.prototype as unknown as InteractiveModePrototype;

function createContext(language: "en" | "zh", projectLanguage?: "en" | "zh") {
	const storage = new InMemorySettingsStorage();
	storage.withLock("global", () => JSON.stringify({ language }));
	if (projectLanguage) storage.withLock("project", () => JSON.stringify({ language: projectLanguage }));
	const settingsManager = SettingsManager.fromStorage(storage);
	const setLanguage = vi.spyOn(settingsManager, "setLanguage");
	const withLock = vi.spyOn(storage, "withLock");
	const context = createFakeInteractiveContext<LanguageCommandContext>({ settingsManager });
	return { context, settingsManager, setLanguage, withLock };
}

afterEach(() => setActiveLanguage("en"));

describe("InteractiveMode /language", () => {
	it("reports the current language and usage when called bare", () => {
		const { context, setLanguage, withLock } = createContext("zh");

		interactiveModePrototype.handleLanguageCommand.call(context);

		expect(context.showStatus).toHaveBeenCalledWith("界面语言：中文（zh）\n用法：/language <en|zh>");
		expect(setLanguage).not.toHaveBeenCalled();
		expect(withLock).not.toHaveBeenCalled();
		expect(context.showError).not.toHaveBeenCalled();
	});

	it("switches, persists, and confirms in the newly selected language", async () => {
		const { context, settingsManager, setLanguage } = createContext("en");

		interactiveModePrototype.handleLanguageCommand.call(context, "zh");
		await settingsManager.reload();

		expect(setLanguage).toHaveBeenCalledWith("zh");
		expect(settingsManager.getLanguage()).toBe("zh");
		expect(getActiveLanguage()).toBe("zh");
		expect(context.showStatus).toHaveBeenCalledWith("界面语言已切换为中文（zh）。");
		expect(context.redraw.requestRender).toHaveBeenCalled();
		expect(context.showError).not.toHaveBeenCalled();
	});

	it("accepts a whitespace-padded upper-case language code", async () => {
		const { context, settingsManager, setLanguage } = createContext("zh");

		interactiveModePrototype.handleLanguageCommand.call(context, " EN ");
		await settingsManager.flush();

		expect(setLanguage).toHaveBeenCalledWith("en");
		expect(context.showStatus).toHaveBeenCalledWith("UI language set to English (en).");
	});

	it("reports the effective project language while persisting only the global default", async () => {
		const { context, settingsManager } = createContext("zh", "zh");

		interactiveModePrototype.handleLanguageCommand.call(context, "en");
		expect(settingsManager.getLanguage()).toBe("zh");
		expect(getActiveLanguage()).toBe("zh");
		await settingsManager.reload();

		expect(settingsManager.getGlobalSettings().language).toBe("en");
		expect(settingsManager.getProjectSettings().language).toBe("zh");
		expect(settingsManager.getLanguage()).toBe("zh");
		expect(getActiveLanguage()).toBe("zh");
		expect(context.showStatus).toHaveBeenCalledWith(
			"全局界面语言已设为English（en）。项目设置使界面语言保持为中文（zh）。",
		);
		expect(context.redraw.requestRender).toHaveBeenCalled();
	});

	it("rejects an unsupported language without any storage access or language change", async () => {
		const { context, settingsManager, setLanguage, withLock } = createContext("en");

		interactiveModePrototype.handleLanguageCommand.call(context, "fr");
		await settingsManager.flush();

		expect(setLanguage).not.toHaveBeenCalled();
		expect(withLock).not.toHaveBeenCalled();
		expect(settingsManager.getLanguage()).toBe("en");
		expect(getActiveLanguage()).toBe("en");
		expect(context.showError).toHaveBeenCalledWith('Unknown language "fr". Available languages: en, zh.');
		expect(context.showStatus).not.toHaveBeenCalled();
		expect(context.redraw.requestRender).not.toHaveBeenCalled();
	});
});
