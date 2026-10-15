import { describe, expect, it } from "vitest";
import { LANGUAGES, MESSAGES, type MessageKey, translate } from "../src/i18n/index.ts";

const enKeys = Object.keys(MESSAGES.en).sort();
const zhKeys = Object.keys(MESSAGES.zh).sort();

describe("i18n message tables", () => {
	it("declares the same key set in every language", () => {
		expect(zhKeys).toEqual(enKeys);
	});

	it("has no empty or placeholder-only strings", () => {
		for (const language of LANGUAGES) {
			for (const [key, value] of Object.entries(MESSAGES[language])) {
				expect(value.trim(), `${language}/${key}`).not.toBe("");
			}
		}
	});

	it("keeps the placeholder set of each translation identical to English", () => {
		const placeholdersOf = (value: string): string[] => value.match(/\{(\w+)\}/gu)?.sort() ?? [];
		for (const key of enKeys as MessageKey[]) {
			expect(placeholdersOf(MESSAGES.zh[key]), `zh/${key}`).toEqual(placeholdersOf(MESSAGES.en[key]));
		}
	});

	it("fills placeholders and leaves unknown ones verbatim", () => {
		expect(translate("en", "mcp.couldNotStart", { name: "figma", detail: "boom" })).toBe(
			"MCP server 'figma' could not start: boom",
		);
		expect(translate("zh", "mcp.couldNotStart", { name: "figma", detail: "boom" })).toBe(
			"MCP 服务器 'figma' 启动失败：boom",
		);
		expect(translate("en", "mcp.couldNotStart", { name: "figma" })).toBe(
			"MCP server 'figma' could not start: {detail}",
		);
	});

	it("falls back to English for an unknown language code", () => {
		expect(translate("fr" as never, "welcome.tips")).toBe(MESSAGES.en["welcome.tips"]);
	});
});
