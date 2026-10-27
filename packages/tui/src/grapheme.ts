import {
	GCB,
	gcbOf,
	INCB_CONSONANT,
	INCB_EXTEND,
	INCB_LINKER,
	incbOf,
	isExtendedPictographic,
	readCodePoint,
} from "./break-data.ts";
import type { TextSegmenter } from "./segmenter.ts";

/**
 * Next code unit joins the current grapheme only when it can be Extend, ZWJ,
 * SpacingMark, a Hangul continuation, or a regional indicator. Characters
 * below U+0300 are never joiners (CR×LF is handled by the caller). False
 * positives fall through to the class tables; a false negative would split a
 * cluster, so unknown units stay on the slow path.
 */
function joinsForward(unit: number): boolean {
	if (unit < 0x0300) return false;
	if (unit >= 0x4e00 && unit <= 0x9fff) return false;
	if (unit >= 0x3400 && unit <= 0x4dbf) return false;
	if (unit >= 0xac00 && unit <= 0xd7a3) return false;
	if (unit >= 0x3041 && unit <= 0x3096) return false;
	if (unit >= 0x30a1 && unit <= 0x30fa) return false;
	if (unit >= 0xff01 && unit <= 0xff60) return false;
	return true;
}

function isBmpControl(unit: number): boolean {
	return (unit <= 0x1f && unit !== 0x0a && unit !== 0x0d) || (unit >= 0x7f && unit <= 0x9f) || unit === 0x00ad;
}

function isInertBase(unit: number): boolean {
	if (unit < 0x0300) return !isBmpControl(unit) && unit !== 0x0d && unit !== 0x0a;
	return !joinsForward(unit);
}

function graphemeContinues(prev: number[], nextCp: number): boolean {
	const prevCp = prev[prev.length - 1]!;
	const prevClass = gcbOf(prevCp);
	const nextClass = gcbOf(nextCp);
	if (prevClass === GCB.CR && nextClass === GCB.LF) return true;
	if (prevClass === GCB.Control || prevClass === GCB.CR || prevClass === GCB.LF) return false;
	if (nextClass === GCB.Control || nextClass === GCB.CR || nextClass === GCB.LF) return false;
	if (
		prevClass === GCB.L &&
		(nextClass === GCB.L || nextClass === GCB.V || nextClass === GCB.LV || nextClass === GCB.LVT)
	) {
		return true;
	}
	if ((prevClass === GCB.LV || prevClass === GCB.V) && (nextClass === GCB.V || nextClass === GCB.T)) return true;
	if ((prevClass === GCB.LVT || prevClass === GCB.T) && nextClass === GCB.T) return true;
	if (nextClass === GCB.Extend || nextClass === GCB.ZWJ || nextClass === GCB.SpacingMark) return true;
	if (prevClass === GCB.Prepend) return true;
	if (incbOf(nextCp) === INCB_CONSONANT) {
		let j = prev.length - 1;
		let sawLinker = false;
		while (j >= 0) {
			const kind = incbOf(prev[j]!);
			if (kind !== INCB_EXTEND && kind !== INCB_LINKER) break;
			if (kind === INCB_LINKER) sawLinker = true;
			j--;
		}
		if (sawLinker && j >= 0 && incbOf(prev[j]!) === INCB_CONSONANT) return true;
	}
	if (prevClass === GCB.ZWJ && isExtendedPictographic(nextCp)) {
		let j = prev.length - 2;
		while (j >= 0 && gcbOf(prev[j]!) === GCB.Extend) j--;
		if (j >= 0 && isExtendedPictographic(prev[j]!)) return true;
	}
	if (prevClass === GCB.RI && nextClass === GCB.RI) {
		let count = 0;
		for (let j = prev.length - 1; j >= 0 && gcbOf(prev[j]!) === GCB.RI; j--) count++;
		if (count % 2 === 1) return true;
	}
	return false;
}

function slowGraphemeEnd(text: string, start: number, limit: number): number {
	const cps: number[] = [];
	let i = start;
	while (i < limit) {
		const current = readCodePoint(text, i);
		cps.push(current.cp);
		if (current.next >= limit) return limit;
		const next = readCodePoint(text, current.next);
		if (!graphemeContinues(cps, next.cp)) return current.next;
		i = current.next;
	}
	return limit;
}

/** End index (UTF-16) of the grapheme cluster starting at `start`. */
export function nextGraphemeEnd(text: string, start: number, limit = text.length): number {
	if (start >= limit) return limit;
	const unit = text.charCodeAt(start);
	if (unit < 0x0300) {
		const next = start + 1 < limit ? text.charCodeAt(start + 1) : -1;
		if (unit === 0x0d && next === 0x0a) return start + 2;
		if (isBmpControl(unit) || next < 0x0300 || !joinsForward(next)) return start + 1;
		return slowGraphemeEnd(text, start, limit);
	}
	if (unit < 0xd800 && isInertBase(unit)) {
		if (start + 1 >= limit) return limit;
		if (!joinsForward(text.charCodeAt(start + 1))) return start + 1;
	}
	return slowGraphemeEnd(text, start, limit);
}

/** Start index of the grapheme that ends at `index`, or 0 when `index` is 0. */
export function graphemeStartBefore(text: string, index: number): number {
	const end = index < text.length ? index : text.length;
	let prev = 0;
	let i = 0;
	while (i < end) {
		const next = nextGraphemeEnd(text, i, end);
		if (next <= i) return i;
		prev = i;
		i = next;
	}
	return prev;
}

export function* iterateGraphemes(input: string): Generator<Intl.SegmentData> {
	let i = 0;
	while (i < input.length) {
		const end = nextGraphemeEnd(input, i);
		if (end <= i) return;
		yield { segment: input.slice(i, end), index: i, input };
		i = end;
	}
}

export const graphemeSegmenter: TextSegmenter = {
	segment(input: string): Iterable<Intl.SegmentData> {
		return iterateGraphemes(input);
	},
};
