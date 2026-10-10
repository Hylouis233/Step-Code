import { setActiveLanguage } from "@step-harness/coding-agent";
import { describe, expect, it, vi } from "vitest";
import { InteractiveMode } from "../src/ui/interactive-mode.ts";
import { createFakeInteractiveContext } from "./support/fake-interactive-context.ts";

type LanguageCommandContext = {
	settingsManager: { getLanguage: () => string; setLanguage: (language: string) => void };
};

type InteractiveModePrototype = {
	handleLanguageCommand(this: unknown, searchTerm?: string): void;
};

const interactiveModePrototype = InteractiveMode.prototype as unknown as InteractiveModePrototype;

/**
 * `language` is what the (fake) settings manager reports; `active` is the i18n
 * cell the chrome renders from. They agree in production because
 * `SettingsManager` seeds the cell from the setting.
 */
function createContext(language: string, active: string) {
	setActiveLanguage(active as "en" | "zh");
	// Mirror SettingsManager.setLanguage: persist, then adopt the language so
	// the confirmation is rendered in the newly selected one.
	const setLanguage = vi.fn((next: string) => setActiveLanguage(next as "en" | "zh"));
	const context = createFakeInteractiveContext<LanguageCommandContext>({
		settingsManager: { getLanguage: () => language, setLanguage },
	});
	return { context, setLanguage };
}

describe("InteractiveMode /language", () => {
	it("reports the current language and usage when called bare", () => {
		const { context, setLanguage } = createContext("zh", "en");

		interactiveModePrototype.handleLanguageCommand.call(context);

		expect(context.showStatus).toHaveBeenCalledWith("UI language: 中文 (zh)\nUsage: /language <en|zh>");
		expect(setLanguage).not.toHaveBeenCalled();
		expect(context.showError).not.toHaveBeenCalled();
	});

	it("switches, persists, and confirms in the newly selected language", () => {
		const { context, setLanguage } = createContext("en", "en");

		interactiveModePrototype.handleLanguageCommand.call(context, "zh");

		expect(setLanguage).toHaveBeenCalledWith("zh");
		// The confirmation is rendered after the switch, so it doubles as proof
		// the new language is live.
		expect(context.showStatus).toHaveBeenCalledWith("界面语言已切换为中文（zh）。");
		expect(context.redraw.requestRender).toHaveBeenCalled();
		expect(context.showError).not.toHaveBeenCalled();
	});

	it("accepts an upper-case language code", () => {
		const { context, setLanguage } = createContext("en", "en");

		interactiveModePrototype.handleLanguageCommand.call(context, " EN ");

		expect(setLanguage).toHaveBeenCalledWith("en");
		expect(context.showStatus).toHaveBeenCalledWith("UI language set to English (en).");
	});

	it("rejects an unsupported language without persisting", () => {
		const { context, setLanguage } = createContext("en", "en");

		interactiveModePrototype.handleLanguageCommand.call(context, "fr");

		expect(setLanguage).not.toHaveBeenCalled();
		expect(context.showError).toHaveBeenCalledWith('Unknown language "fr". Available languages: en, zh.');
		expect(context.showStatus).not.toHaveBeenCalled();
	});
});
