import type { SessionEntry } from "./session-manager.ts";
export interface SessionUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	total: number;
	cacheHit: number | null;
	invalid: number;
	missing: number;
}

export interface NormalizedUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	total: number;
}

export function normalizeUsage(raw: unknown): NormalizedUsage | undefined {
	if (!raw || typeof raw !== "object") return undefined;
	const u = raw as Record<string, unknown>;
	if (
		![u.input, u.output, u.cacheRead, u.cacheWrite].every(
			(n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0,
		)
	)
		return undefined;
	const input = (u.input as number) + (u.cacheRead as number) + (u.cacheWrite as number),
		output = u.output as number;
	if (!Number.isSafeInteger(input + output)) return undefined;
	return {
		input,
		output,
		cacheRead: u.cacheRead as number,
		cacheWrite: u.cacheWrite as number,
		total: input + output,
	};
}

export function entryUsage(entry: Record<string, unknown>): { raw?: unknown; expected: boolean; assistant: boolean } {
	const message = entry.message as Record<string, unknown> | undefined;
	if (entry.type === "message" && message?.role === "assistant")
		return { raw: message.usage, expected: true, assistant: true };
	if (entry.type === "message" && message?.role === "toolResult")
		return { raw: message.usage, expected: message.usage !== undefined, assistant: false };
	if (entry.type === "compaction" || entry.type === "branch_summary")
		return { raw: entry.usage, expected: entry.usage !== undefined, assistant: false };
	if (entry.type === "custom" && entry.customType === "step-auto-clm-usage") {
		const data = entry.data as Record<string, unknown> | undefined;
		return { raw: data?.usage, expected: true, assistant: false };
	}
	return { expected: false, assistant: false };
}

export function collectSessionUsage(
	entries: readonly SessionEntry[] | readonly Record<string, unknown>[],
): SessionUsage {
	const totals: SessionUsage = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		total: 0,
		cacheHit: null,
		invalid: 0,
		missing: 0,
	};
	for (const entry of entries) {
		const picked = entryUsage(entry as unknown as Record<string, unknown>),
			usage = normalizeUsage(picked.raw);
		if (!usage) {
			if (picked.expected) {
				if (picked.raw === undefined) totals.missing++;
				else totals.invalid++;
			}
			continue;
		}
		if (!Number.isSafeInteger(totals.total + usage.total)) {
			totals.invalid++;
			continue;
		}
		for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"] as const) totals[key] += usage[key];
	}
	totals.cacheHit = totals.input > 0 ? totals.cacheRead / totals.input : null;
	return totals;
}
