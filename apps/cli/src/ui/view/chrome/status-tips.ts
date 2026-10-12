/**
 * The single rotating tip line under the working-status row (same slot and
 * purpose as Claude Code's spinner tips). Unlike CC's second-level rotation,
 * which users complain scrolls by unread, one tip serves a whole turn and the
 * next turn takes the next one. Goal-command tips follow the current goal
 * status without inferring user intent.
 */

import { keyText, type StepGoalStatus, t } from "@step-harness/coding-agent";

/**
 * Rebuilt per call so the pool follows the active UI language instead of being
 * frozen at module load.
 */
export function buildStatusTips(goalStatus?: StepGoalStatus): string[] {
	const general = [
		t("statusTip.theme"),
		t("statusTip.model"),
		t("statusTip.expandToolOutput", { key: keyText("app.tools.expand") }),
		t("statusTip.autocompletePaths"),
		t("statusTip.queueWhileWorking"),
	];
	if (goalStatus === "active") {
		const commands = [
			t("statusTip.goalStatus"),
			t("statusTip.goalPause"),
			t("statusTip.goalEdit"),
			t("statusTip.goalClear"),
		];
		return general.flatMap((tip) => [...commands, tip]);
	}
	if (goalStatus === "paused" || goalStatus === "blocked" || goalStatus === "usage_limited") {
		return general.flatMap((tip) => [t("statusTip.goalResume"), tip]);
	}
	if (goalStatus === "budget_limited") {
		return [t("statusTip.goalEditOrClear"), ...general];
	}
	return [...general, t("statusTip.goalStart")];
}

/**
 * One tip per turn: the pool always starts from its head (/theme — the agreed
 * first tip of every session) and advances in order. A tip never changes
 * mid-turn, and consecutive turns never repeat the same tip (pools of ≥2).
 */
export class StatusTipRotator {
	private pool: readonly string[];
	private index: number;

	// Parameter properties are off (erasableSyntaxOnly) — assign explicitly.
	constructor(pool: readonly string[], startIndex = 0) {
		this.pool = pool;
		this.index = pool.length > 0 ? startIndex % pool.length : 0;
	}

	next(pool: readonly string[] = this.pool): string | undefined {
		if (pool.length !== this.pool.length || pool.some((tip, index) => tip !== this.pool[index])) {
			this.pool = pool;
			this.index = 0;
		}
		if (this.pool.length === 0) return undefined;
		const tip = this.pool[this.index % this.pool.length];
		this.index += 1;
		return tip;
	}
}
