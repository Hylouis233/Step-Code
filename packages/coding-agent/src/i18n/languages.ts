/**
 * Supported UI languages. The setting persists in `settings.json` under the
 * top-level `language` key (same shape as `defaultThinkingLevel`), so an
 * unknown value means "fall back to English" rather than a hard error.
 */
export type Language = "en" | "zh";

export const DEFAULT_LANGUAGE: Language = "en";

export const LANGUAGES: readonly Language[] = ["en", "zh"];

/** Human-readable name shown by `/language`, in the language itself. */
const LANGUAGE_NAMES: Record<Language, string> = {
	en: "English",
	zh: "中文",
};

export function isLanguage(value: unknown): value is Language {
	return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/** Coerce anything to a Language; unknown values become the default. */
export function normalizeLanguage(value: unknown): Language {
	return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

export function languageName(language: Language): string {
	return LANGUAGE_NAMES[language];
}
