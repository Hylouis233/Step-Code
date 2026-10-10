import { parse } from "yaml";
import { stripBom } from "./text.ts";

type ParsedFrontmatter<T extends Record<string, unknown>> = {
	frontmatter: T;
	body: string;
};

/** Location and reason of a frontmatter syntax error, flattened onto a single line. */
export interface FrontmatterErrorDetails {
	/** 1-based line in the file, when the parser reports one. */
	line?: number;
	/** 1-based column in the file, when the parser reports one. */
	column?: number;
	/** Parser reason, without the quoted source line or caret. */
	reason: string;
}

const normalizeNewlines = (value: string): string => value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const extractFrontmatter = (content: string): { yamlString: string | null; body: string } => {
	const normalized = normalizeNewlines(stripBom(content));

	if (!normalized.startsWith("---")) {
		return { yamlString: null, body: normalized };
	}

	const endIndex = normalized.indexOf("\n---", 3);
	if (endIndex === -1) {
		return { yamlString: null, body: normalized };
	}

	return {
		yamlString: normalized.slice(4, endIndex),
		body: normalized.slice(endIndex + 4).trim(),
	};
};

export const parseFrontmatter = <T extends Record<string, unknown> = Record<string, unknown>>(
	content: string,
): ParsedFrontmatter<T> => {
	const { yamlString, body } = extractFrontmatter(content);
	if (!yamlString) {
		return { frontmatter: {} as T, body };
	}
	const parsed = parse(yamlString);
	return { frontmatter: (parsed ?? {}) as T, body };
};

export const stripFrontmatter = (content: string): string => parseFrontmatter(content).body;

/**
 * The YAML block always starts on file line 2 (right after the opening `---`), so parser line
 * numbers are shifted to point at the line a user actually edits.
 */
const YAML_TO_FILE_LINE_OFFSET = 1;

/**
 * Flatten a `yaml` parse error into a single line.
 *
 * The `yaml` package appends a quoted (and possibly truncated) source line plus a caret to its
 * messages, which wraps into an unreadable block inside the diagnostics list.
 */
export function describeFrontmatterError(error: unknown): FrontmatterErrorDetails {
	const message = error instanceof Error ? error.message : String(error);
	const [headline] = message.split("\n");
	const location = /^(.*?)\s+at line (\d+), column (\d+)/.exec(headline ?? "");
	const position = (error as { linePos?: Array<{ line?: number; col?: number }> }).linePos?.[0];
	const line = position?.line ?? (location ? Number(location[2]) : undefined);
	const column = position?.col ?? (location ? Number(location[3]) : undefined);
	const reason = (location?.[1] ?? headline ?? "").trim() || "invalid YAML";

	return {
		line: line === undefined ? undefined : line + YAML_TO_FILE_LINE_OFFSET,
		column,
		reason,
	};
}

/** A plain scalar cannot contain ": ", so its presence means the value needs quoting. */
const hasUnquotedColonSeparator = (value: string): boolean => /:(\s|$)/.test(value);

/** Drop a trailing `#` comment; `#` only starts a comment after whitespace. */
const stripTrailingComment = (value: string): string => value.replace(/\s+#.*$/, "");

/**
 * Detect the classic frontmatter mistake of an unquoted `": "` inside the description scalar,
 * which `yaml` rejects as a nested mapping.
 */
export function hasUnquotedColonInDescription(content: string): boolean {
	const { yamlString } = extractFrontmatter(content);
	if (!yamlString) return false;

	const lines = yamlString.split("\n");
	for (let index = 0; index < lines.length; index++) {
		const key = /^([ \t]*)description[ \t]*:[ \t]*(.*)$/.exec(lines[index]);
		if (!key) continue;

		const value = stripTrailingComment(key[2]);
		// Quoted, flow and block scalars may legally contain ": ".
		if (value === "" || /^[|>&*"'[\]{}]/.test(value)) continue;
		if (hasUnquotedColonSeparator(value)) return true;

		// A plain scalar may continue on more deeply indented lines.
		const indent = key[1].length;
		for (let next = index + 1; next < lines.length; next++) {
			const line = lines[next];
			if (line.trim() === "") continue;
			const lineIndent = /^[ \t]*/.exec(line)?.[0].length ?? 0;
			if (lineIndent <= indent) break;
			if (hasUnquotedColonSeparator(stripTrailingComment(line))) return true;
		}
	}

	return false;
}

/**
 * Build a single-line, actionable diagnostic for a frontmatter syntax error, e.g.
 * `/path/SKILL.md: invalid YAML frontmatter at line 3, column 14: Nested mappings are not allowed
 * in compact mappings — description contains an unquoted ":" — wrap the value in double quotes`.
 */
export function formatFrontmatterError(filePath: string, error: unknown, content: string): string {
	const { line, column, reason } = describeFrontmatterError(error);
	const at =
		line !== undefined && column !== undefined
			? ` at line ${line}, column ${column}`
			: line !== undefined
				? ` at line ${line}`
				: "";
	const hint = hasUnquotedColonInDescription(content)
		? ' — description contains an unquoted ":" — wrap the value in double quotes'
		: "";

	return `${filePath}: invalid YAML frontmatter${at}: ${reason}${hint}`;
}
