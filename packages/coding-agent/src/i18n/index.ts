/**
 * UI language selection.
 *
 * The active language lives in a module-level cell rather than being threaded
 * through every component: the chrome (welcome block, footer, status row, tips)
 * and the startup warnings emitted from `packages/coding-agent` all read it at
 * render/format time, and none of them own a settings handle. The cell is
 * seeded from `SettingsManager.getLanguage()`, so every entrypoint that builds
 * a settings manager gets the persisted language for free.
 *
 * `translate()` is pure and takes the language explicitly; `t()` reads the cell.
 */
import { DEFAULT_LANGUAGE, type Language, normalizeLanguage } from "./languages.ts";
import { MESSAGES, type MessageKey, type MessageParams } from "./messages.ts";

let activeLanguage: Language = DEFAULT_LANGUAGE;

/** Fill `{placeholder}` slots. Unknown placeholders are left verbatim. */
function formatMessage(template: string, params?: MessageParams): string {
	if (!params) return template;
	return template.replace(/\{(\w+)\}/gu, (match, name: string) => {
		const value = params[name];
		return value === undefined ? match : String(value);
	});
}

export function translate(language: Language, key: MessageKey, params?: MessageParams): string {
	return formatMessage(MESSAGES[normalizeLanguage(language)][key], params);
}

export function createTranslator(language: Language): (key: MessageKey, params?: MessageParams) => string {
	const resolved = normalizeLanguage(language);
	return (key, params) => translate(resolved, key, params);
}

export function getActiveLanguage(): Language {
	return activeLanguage;
}

export function setActiveLanguage(language: Language): void {
	activeLanguage = normalizeLanguage(language);
}

/** Translate using the active language. */
export function t(key: MessageKey, params?: MessageParams): string {
	return translate(activeLanguage, key, params);
}

export {
	DEFAULT_LANGUAGE,
	isLanguage,
	LANGUAGES,
	type Language,
	languageName,
	normalizeLanguage,
} from "./languages.ts";
export { en, MESSAGES, type MessageKey, type MessageParams, zh } from "./messages.ts";
