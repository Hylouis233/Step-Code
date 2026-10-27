import { createRequire } from "node:module";
import {
	F_HAN,
	F_HIRA,
	F_IDEO,
	F_KATA,
	F_SA,
	flagsOf,
	GCB,
	gcbOf,
	isExtendedPictographic,
	readCodePoint,
	WB,
	wbOf,
} from "./break-data.ts";
import { loadTrie, matchTrie, type WordTrie } from "./dict-table.ts";
import type { TextSegmenter } from "./segmenter.ts";

const MAX_COST = 0xffffffff;
const KATA_COST = [8192, 984, 408, 240, 204, 252, 300, 372, 480];
const MARK = /^\p{M}$/u;

interface Unit {
	cp: number;
	index: number;
	wb: number;
	ex: boolean;
	cj: boolean;
	hangul: boolean;
	alp: boolean;
	hebrew: boolean;
	ideo: boolean;
	hira: boolean;
	kataWb: boolean;
	extPict: boolean;
	sea: number;
}

interface Cursor {
	pos: number;
}

const loaded = { cj: false, thai: false, lao: false, khmer: false, burmese: false };
let cjDict: WordTrie | undefined;
let thaiDict: WordTrie | undefined;
let laoDict: WordTrie | undefined;
let khmerDict: WordTrie | undefined;
let burmeseDict: WordTrie | undefined;

function readCjdict(): string {
	return createRequire(import.meta.url)("./dict/cjdict.cjs") as string;
}
function readThaidict(): string {
	return createRequire(import.meta.url)("./dict/thaidict.cjs") as string;
}
function readLaodict(): string {
	return createRequire(import.meta.url)("./dict/laodict.cjs") as string;
}
function readKhmerdict(): string {
	return createRequire(import.meta.url)("./dict/khmerdict.cjs") as string;
}
function readBurmesedict(): string {
	return createRequire(import.meta.url)("./dict/burmesedict.cjs") as string;
}

export function loadedDictionaries(): { cj: boolean; thai: boolean; lao: boolean; khmer: boolean; burmese: boolean } {
	return { ...loaded };
}

function cjDictionary(): WordTrie {
	if (!cjDict) {
		cjDict = loadTrie(readCjdict());
		loaded.cj = true;
	}
	return cjDict;
}
function thaiDictionary(): WordTrie {
	if (!thaiDict) {
		thaiDict = loadTrie(readThaidict());
		loaded.thai = true;
	}
	return thaiDict;
}
function laoDictionary(): WordTrie {
	if (!laoDict) {
		laoDict = loadTrie(readLaodict());
		loaded.lao = true;
	}
	return laoDict;
}
function khmerDictionary(): WordTrie {
	if (!khmerDict) {
		khmerDict = loadTrie(readKhmerdict());
		loaded.khmer = true;
	}
	return khmerDict;
}
function burmeseDictionary(): WordTrie {
	if (!burmeseDict) {
		burmeseDict = loadTrie(readBurmesedict());
		loaded.burmese = true;
	}
	return burmeseDict;
}

function isHangulSyllable(cp: number): boolean {
	return cp >= 0xac00 && cp <= 0xd7a3;
}

function isKatakanaCp(cp: number): boolean {
	return (cp >= 0x30a1 && cp <= 0x30fe && cp !== 0x30fb) || (cp >= 0xff66 && cp <= 0xff9f);
}

function katakanaCost(len: number): number {
	return len > 8 ? 8192 : KATA_COST[len]!;
}

function seaKind(cp: number, flags: number): number {
	if ((flags & F_SA) === 0) return 0;
	if (cp >= 0x0e00 && cp <= 0x0e7f) return 1;
	if (cp >= 0x0e80 && cp <= 0x0eff) return 2;
	if ((cp >= 0x1000 && cp <= 0x109f) || (cp >= 0xaa60 && cp <= 0xaa7f) || (cp >= 0xa9e0 && cp <= 0xa9ff)) return 3;
	if ((cp >= 0x1780 && cp <= 0x17ff) || (cp >= 0x19e0 && cp <= 0x19ff)) return 4;
	return 0;
}

function classify(text: string): Unit[] {
	const units: Unit[] = [];
	for (let i = 0; i < text.length; ) {
		const { cp, next } = readCodePoint(text, i);
		const wb = wbOf(cp);
		const flags = flagsOf(cp);
		const gcb = gcbOf(cp);
		const han = (flags & F_HAN) !== 0;
		const hira = (flags & F_HIRA) !== 0;
		const kata = (flags & F_KATA) !== 0;
		const scriptKana = han || hira || kata;
		const hangul = isHangulSyllable(cp);
		const ex = (wb === WB.Extend && !han) || wb === WB.Format || wb === WB.ZWJ;
		const complex =
			(flags & F_SA) !== 0 && wb !== WB.Extend && gcb !== GCB.Control && wb !== WB.Format && wb !== WB.ZWJ;
		units.push({
			cp,
			index: i,
			wb,
			ex,
			cj: scriptKana || cp === 0x30fc || cp === 0xff70 || cp === 0xff9e || cp === 0xff9f,
			hangul,
			alp: (wb === WB.ALetter && !hangul && !scriptKana) || complex,
			hebrew: wb === WB.Hebrew,
			ideo: (flags & F_IDEO) !== 0,
			hira,
			kataWb: wb === WB.Katakana,
			extPict: isExtendedPictographic(cp),
			sea: seaKind(cp, flags),
		});
		i = next;
	}
	return units;
}

function nextBase(units: Unit[], from: number): Unit | undefined {
	for (let i = from + 1; i < units.length; i++) if (!units[i]!.ex) return units[i];
	return undefined;
}

function prevBase(units: Unit[], from: number): Unit | undefined {
	for (let i = from - 1; i >= 0; i--) if (!units[i]!.ex) return units[i];
	return undefined;
}

function midLetter(wb: number): boolean {
	return wb === WB.MidLetter || wb === WB.MidNumLet || wb === WB.SQ;
}

function midNum(wb: number): boolean {
	return wb === WB.MidNum || wb === WB.MidNumLet || wb === WB.SQ;
}

function extLeft(unit: Unit): boolean {
	return unit.alp || unit.hebrew || unit.wb === WB.Numeric || unit.wb === WB.Katakana || unit.wb === WB.ExtNumLet;
}

function extRight(unit: Unit): boolean {
	return unit.alp || unit.hebrew || unit.wb === WB.Numeric || unit.wb === WB.Katakana;
}

/** True when ICU's word rules place a boundary before units[k]. */
function ruleBreak(units: Unit[], k: number): boolean {
	const prev = units[k - 1]!;
	const next = units[k]!;
	if (prev.wb === WB.CR && next.wb === WB.LF) return false;
	if (prev.wb === WB.CR || prev.wb === WB.LF || prev.wb === WB.Newline) return true;
	if (next.wb === WB.CR || next.wb === WB.LF || next.wb === WB.Newline) return true;
	if (prev.wb === WB.ZWJ && next.extPict) return false;
	if (prev.wb === WB.WSeg && next.wb === WB.WSeg) return false;
	if (next.ex) return false;
	if (prev.cj && next.cj) return false;
	if (prev.hangul && next.hangul) return false;
	let pi = k - 1;
	while (pi >= 0 && units[pi]!.ex) pi--;
	if (pi < 0) return true;
	const left = units[pi]!;
	if ((left.alp || left.hebrew) && (next.alp || next.hebrew)) return false;
	if (left.wb === WB.Katakana && next.wb === WB.Katakana) return false;
	if (left.wb === WB.Numeric && next.wb === WB.Numeric) return false;
	if ((left.alp || left.hebrew) && next.wb === WB.Numeric) return false;
	if (left.wb === WB.Numeric && (next.alp || next.hebrew)) return false;
	if (extLeft(left) && next.wb === WB.ExtNumLet) return false;
	if (left.wb === WB.ExtNumLet && extRight(next)) return false;
	if ((left.alp || left.hebrew) && midLetter(next.wb)) {
		const nxt = nextBase(units, k);
		if (nxt && (nxt.alp || nxt.hebrew)) return false;
	}
	if (midLetter(left.wb) && (next.alp || next.hebrew)) {
		const prv = prevBase(units, pi);
		if (prv && (prv.alp || prv.hebrew)) return false;
	}
	if (left.hebrew && next.wb === WB.SQ) return false;
	if (left.hebrew && next.wb === WB.DQ) {
		const nxt = nextBase(units, k);
		if (nxt?.hebrew) return false;
	}
	if (left.wb === WB.DQ && next.hebrew) {
		const prv = prevBase(units, pi);
		if (prv?.hebrew) return false;
	}
	if (left.wb === WB.Numeric && midNum(next.wb)) {
		const nxt = nextBase(units, k);
		if (nxt && nxt.wb === WB.Numeric) return false;
	}
	if (midNum(left.wb) && next.wb === WB.Numeric) {
		const prv = prevBase(units, pi);
		if (prv && prv.wb === WB.Numeric) return false;
	}
	if (next.wb === WB.RI) {
		let count = 0;
		let i = k - 1;
		while (i >= 0) {
			if (units[i]!.wb === WB.RI) {
				count++;
				i--;
				continue;
			}
			if (units[i]!.ex) {
				let j = i;
				while (j >= 0 && units[j]!.ex) j--;
				if (j >= 0 && units[j]!.wb === WB.RI) {
					i = j;
					continue;
				}
			}
			break;
		}
		if (count % 2 === 1) return false;
	}
	return true;
}

function wordLike(units: Unit[], start: number, end: number): boolean {
	for (let i = start; i < end - 1; i++) {
		if (units[i]!.wb === WB.ZWJ && units[i + 1]!.extPict) return false;
	}
	let tail = end - 1;
	while (tail >= start && units[tail]!.ex) tail--;
	if (tail >= start && tail < end - 1) {
		const base = units[tail]!;
		const status = base.ideo || base.hira || base.kataWb || base.alp || base.hebrew || base.wb === WB.Numeric;
		if (!status) return false;
	}
	let kana = 0;
	let extNum = 0;
	let wordish = false;
	for (let i = start; i < end; i++) {
		const unit = units[i]!;
		if (unit.ideo || unit.hira || unit.kataWb || unit.hangul || unit.alp || unit.hebrew || unit.wb === WB.Numeric) {
			wordish = true;
		}
		if (unit.cj) kana++;
		if (unit.wb === WB.ExtNumLet) extNum++;
	}
	return wordish || kana >= 2 || extNum >= 2;
}

function divideCjk(text: string): number[] {
	const n = text.length;
	if (n === 0) return [];
	const dict = cjDictionary();
	const best = new Uint32Array(n + 1);
	best.fill(MAX_COST);
	best[0] = 0;
	const prev = new Int32Array(n + 1);
	prev.fill(-1);
	let prevKata = false;
	for (let i = 0; i < n; i++) {
		if (best[i] === MAX_COST) continue;
		const cp = text.charCodeAt(i);
		const found = matchTrie(dict, text, i, Math.min(i + 20, n), 20);
		for (let m = 0; m < found.lens.length; m++) {
			const len = found.lens[m]!;
			const at = i + len;
			const nextCost = best[i]! + found.costs[m]!;
			if (nextCost < best[at]!) {
				best[at] = nextCost;
				prev[at] = i;
			}
		}
		if (found.lens[0] !== 1 && !isHangulSyllable(cp)) {
			const at = i + 1;
			const nextCost = best[i]! + 255;
			if (nextCost < best[at]!) {
				best[at] = nextCost;
				prev[at] = i;
			}
		}
		const isKata = isKatakanaCp(cp);
		if (!prevKata && isKata) {
			let run = 1;
			let j = i + 1;
			while (j < n && run < 20 && isKatakanaCp(text.charCodeAt(j))) {
				j++;
				run++;
			}
			if (run < 20) {
				const at = i + run;
				const nextCost = best[i]! + katakanaCost(run);
				if (nextCost < best[at]!) {
					best[at] = nextCost;
					prev[at] = i;
				}
			}
		}
		prevKata = isKata;
	}
	if (best[n] === MAX_COST) return [];
	const breaks: number[] = [];
	for (let i = prev[n]!; i > 0 && breaks.length <= n; i = prev[i]!) breaks.push(i);
	breaks.reverse();
	return breaks;
}

function normalizeRun(units: Unit[], from: number, to: number): { text: string; map: number[] | null } | undefined {
	const raw: number[] = [];
	for (let i = from; i < to; i++) {
		const cp = units[i]!.cp;
		if (cp > 0xffff) return undefined;
		raw.push(cp);
	}
	const literal = String.fromCodePoint(...raw);
	if (literal.normalize("NFKC") === literal) return { text: literal, map: null };
	const cps: number[] = [];
	const map: number[] = [];
	let chunk = "";
	let chunkStart = 0;
	let bad = false;
	const flush = () => {
		if (!chunk || bad) return;
		for (const ch of chunk.normalize("NFKC")) {
			const cp = ch.codePointAt(0)!;
			if (cp > 0xffff) {
				bad = true;
				return;
			}
			cps.push(cp);
			map.push(chunkStart);
		}
		chunk = "";
	};
	for (let i = from; i < to; i++) {
		const ch = String.fromCodePoint(units[i]!.cp);
		if (!chunk) {
			chunk = ch;
			chunkStart = units[i]!.index;
			continue;
		}
		const combined = chunk + ch;
		if (combined.normalize("NFKC") === chunk.normalize("NFKC") + ch.normalize("NFKC")) {
			flush();
			chunk = ch;
			chunkStart = units[i]!.index;
		} else {
			chunk = combined;
		}
	}
	flush();
	if (bad || cps.length === 0) return undefined;
	return { text: String.fromCodePoint(...cps), map };
}

class PossibleWord {
	count = 0;
	prefix = 0;
	offset = -1;
	mark = 0;
	current = 0;
	cu: number[] = [];

	candidates(text: string, cursor: Cursor, rangeEnd: number, dict: WordTrie): number {
		const start = cursor.pos;
		if (start !== this.offset) {
			this.offset = start;
			const found = matchTrie(dict, text, start, rangeEnd, 20);
			this.cu = found.lens;
			this.count = found.lens.length;
			this.prefix = found.prefix;
			if (this.count <= 0) cursor.pos = start;
		}
		if (this.count > 0) cursor.pos = start + this.cu[this.count - 1]!;
		this.current = this.count - 1;
		this.mark = this.current;
		return this.count;
	}

	acceptMarked(cursor: Cursor): number {
		cursor.pos = this.offset + this.cu[this.mark]!;
		return this.cu[this.mark]!;
	}

	backUp(cursor: Cursor): boolean {
		if (this.current > 0) {
			this.current--;
			cursor.pos = this.offset + this.cu[this.current]!;
			return true;
		}
		return false;
	}

	markCurrent(): void {
		this.mark = this.current;
	}

	markedCP(): number {
		return this.cu[this.mark]!;
	}
}

interface SeaSpec {
	dictionary(): WordTrie;
	/** Thai rejects a span of four or fewer code points. The other engines use code units. */
	codePoints: boolean;
	isEnd(cp: number): boolean;
	isBegin(cp: number): boolean;
	isMark(cp: number): boolean;
	suffix: boolean;
}

function isMark(cp: number): boolean {
	return MARK.test(String.fromCodePoint(cp));
}

function peekCp(text: string, pos: number): number {
	return readCodePoint(text, pos).cp;
}

function countCodePoints(text: string, start: number, end: number): number {
	let n = 0;
	for (let i = start; i < end; ) {
		i = readCodePoint(text, i).next;
		n++;
	}
	return n;
}

const THAI_PAIYANNOI = 0x0e2f;
const THAI_MAIYAMOK = 0x0e46;

function thaiSuffix(cp: number): boolean {
	return cp === THAI_PAIYANNOI || cp === THAI_MAIYAMOK;
}

function stepBack(text: string, cursor: Cursor): number {
	const p = cursor.pos - 1;
	const low = text.charCodeAt(p);
	if (low >= 0xdc00 && low <= 0xdfff && p > 0) {
		const high = text.charCodeAt(p - 1);
		if (high >= 0xd800 && high <= 0xdbff) {
			cursor.pos = p - 1;
			return ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
		}
	}
	cursor.pos = p;
	return low;
}

function stepForward(text: string, cursor: Cursor): number {
	const read = readCodePoint(text, cursor.pos);
	cursor.pos = read.next;
	return read.cp;
}

function chooseAhead(
	slot: PossibleWord,
	words: PossibleWord[],
	wordsFound: number,
	text: string,
	cursor: Cursor,
	rangeEnd: number,
	dict: WordTrie,
): void {
	if (cursor.pos >= rangeEnd) return;
	while (true) {
		const second = words[(wordsFound + 1) % 3]!;
		if (second.candidates(text, cursor, rangeEnd, dict) > 0) {
			slot.markCurrent();
			if (cursor.pos >= rangeEnd) return;
			while (true) {
				const third = words[(wordsFound + 2) % 3]!;
				if (third.candidates(text, cursor, rangeEnd, dict) > 0) {
					slot.markCurrent();
					return;
				}
				if (!second.backUp(cursor)) break;
			}
		}
		if (!slot.backUp(cursor)) return;
	}
}

function divideSea(text: string, rangeStart: number, rangeEnd: number, spec: SeaSpec): number[] {
	if (spec.codePoints) {
		if (countCodePoints(text, rangeStart, rangeEnd) <= 4) return [];
	} else if (rangeEnd - rangeStart < 4) {
		return [];
	}
	const dict = spec.dictionary();
	const words = [new PossibleWord(), new PossibleWord(), new PossibleWord()];
	const cursor: Cursor = { pos: rangeStart };
	const breaks: number[] = [];
	let wordsFound = 0;
	while (cursor.pos < rangeEnd) {
		const current = cursor.pos;
		let cpWordLength = 0;
		let cuWordLength = 0;
		const slot = words[wordsFound % 3]!;
		const candidates = slot.candidates(text, cursor, rangeEnd, dict);
		if (candidates === 1) {
			cuWordLength = slot.acceptMarked(cursor);
			cpWordLength = slot.markedCP();
			wordsFound++;
		} else if (candidates > 1) {
			chooseAhead(slot, words, wordsFound, text, cursor, rangeEnd, dict);
			cuWordLength = slot.acceptMarked(cursor);
			cpWordLength = slot.markedCP();
			wordsFound++;
		}
		if (cursor.pos < rangeEnd && cpWordLength < 3) {
			const look = words[wordsFound % 3]!;
			if (look.candidates(text, cursor, rangeEnd, dict) <= 0 && (cuWordLength === 0 || look.prefix < 3)) {
				let remaining = rangeEnd - (current + cuWordLength);
				let chars = 0;
				for (;;) {
					const pcIndex = cursor.pos;
					const pc = stepForward(text, cursor);
					const pcSize = cursor.pos - pcIndex;
					chars += pcSize;
					remaining -= pcSize;
					if (remaining <= 0) break;
					const uc = peekCp(text, cursor.pos);
					if (spec.isEnd(pc) && spec.isBegin(uc)) {
						const probe = words[(wordsFound + 1) % 3]!;
						const num = probe.candidates(text, cursor, rangeEnd, dict);
						cursor.pos = current + cuWordLength + chars;
						if (num > 0) break;
					}
				}
				if (cuWordLength <= 0) wordsFound++;
				cuWordLength += chars;
			} else {
				cursor.pos = current + cuWordLength;
			}
		}
		while (cursor.pos < rangeEnd && spec.isMark(peekCp(text, cursor.pos))) {
			const before = cursor.pos;
			stepForward(text, cursor);
			cuWordLength += cursor.pos - before;
		}
		if (spec.suffix && cursor.pos < rangeEnd && cuWordLength > 0) {
			const look = words[wordsFound % 3]!;
			const ucStart = peekCp(text, cursor.pos);
			if (look.candidates(text, cursor, rangeEnd, dict) <= 0 && thaiSuffix(ucStart)) {
				let uc = ucStart;
				if (uc === THAI_PAIYANNOI) {
					const prev = stepBack(text, cursor);
					const blocked = thaiSuffix(prev);
					stepForward(text, cursor);
					if (!blocked) {
						const at = cursor.pos;
						stepForward(text, cursor);
						cuWordLength += cursor.pos - at;
						uc = cursor.pos < rangeEnd ? peekCp(text, cursor.pos) : 0;
					}
				}
				if (uc === THAI_MAIYAMOK && cursor.pos < rangeEnd) {
					const prev = stepBack(text, cursor);
					const blocked = prev === THAI_MAIYAMOK;
					stepForward(text, cursor);
					if (!blocked) {
						const at = cursor.pos;
						stepForward(text, cursor);
						cuWordLength += cursor.pos - at;
					}
				}
			} else {
				cursor.pos = current + cuWordLength;
			}
		}
		if (cuWordLength > 0) breaks.push(current + cuWordLength);
		if (cursor.pos <= current) {
			cursor.pos = readCodePoint(text, current).next;
		}
	}
	if (breaks.length > 0 && breaks[breaks.length - 1]! >= rangeEnd) breaks.pop();
	return breaks;
}

function saMark(cp: number, from: number, to: number): boolean {
	return cp === 0x20 || (cp >= from && cp <= to && (flagsOf(cp) & F_SA) !== 0 && isMark(cp));
}

const SEA: Record<number, SeaSpec> = {
	1: {
		dictionary: thaiDictionary,
		codePoints: true,
		isEnd: (cp) =>
			cp >= 0x0e00 && cp <= 0x0e7f && (flagsOf(cp) & F_SA) !== 0 && cp !== 0x0e31 && !(cp >= 0x0e40 && cp <= 0x0e44),
		isBegin: (cp) => (cp >= 0x0e01 && cp <= 0x0e2e) || (cp >= 0x0e40 && cp <= 0x0e44),
		isMark: (cp) => saMark(cp, 0x0e00, 0x0e7f),
		suffix: true,
	},
	2: {
		dictionary: laoDictionary,
		codePoints: false,
		isEnd: (cp) => cp >= 0x0e80 && cp <= 0x0eff && (flagsOf(cp) & F_SA) !== 0 && !(cp >= 0x0ec0 && cp <= 0x0ec4),
		isBegin: (cp) =>
			(cp >= 0x0e81 && cp <= 0x0eae) || (cp >= 0x0edc && cp <= 0x0edd) || (cp >= 0x0ec0 && cp <= 0x0ec4),
		isMark: (cp) => saMark(cp, 0x0e80, 0x0eff),
		suffix: false,
	},
	3: {
		dictionary: burmeseDictionary,
		codePoints: false,
		isEnd: (cp) =>
			((cp >= 0x1000 && cp <= 0x109f) || (cp >= 0xaa60 && cp <= 0xaa7f) || (cp >= 0xa9e0 && cp <= 0xa9ff)) &&
			(flagsOf(cp) & F_SA) !== 0,
		isBegin: (cp) => cp >= 0x1000 && cp <= 0x102a,
		isMark: (cp) =>
			cp === 0x20 ||
			(((cp >= 0x1000 && cp <= 0x109f) || (cp >= 0xaa60 && cp <= 0xaa7f) || (cp >= 0xa9e0 && cp <= 0xa9ff)) &&
				(flagsOf(cp) & F_SA) !== 0 &&
				isMark(cp)),
		suffix: false,
	},
	4: {
		dictionary: khmerDictionary,
		codePoints: false,
		isEnd: (cp) =>
			((cp >= 0x1780 && cp <= 0x17ff) || (cp >= 0x19e0 && cp <= 0x19ff)) &&
			(flagsOf(cp) & F_SA) !== 0 &&
			cp !== 0x17d2,
		isBegin: (cp) => cp >= 0x1780 && cp <= 0x17b3,
		isMark: (cp) =>
			saMark(cp, 0x1780, 0x17ff) || (cp >= 0x19e0 && cp <= 0x19ff && (flagsOf(cp) & F_SA) !== 0 && isMark(cp)),
		suffix: false,
	},
};

function pushCjk(units: Unit[], from: number, to: number, bounds: number[]): void {
	if (to - from < 2) return;
	const norm = normalizeRun(units, from, to);
	if (!norm) return;
	const rel = divideCjk(norm.text);
	for (const at of rel) {
		const index = norm.map ? norm.map[at] : units[from + at]!.index;
		if (index !== undefined) bounds.push(index);
	}
}

function dictSplit(text: string, units: Unit[], start: number, end: number): Array<[number, number]> {
	const endIndex = end < units.length ? units[end]!.index : text.length;
	const bounds = [units[start]?.index ?? 0];
	let i = start;
	while (i < end) {
		if (units[i]!.cj) {
			let j = i + 1;
			while (j < end && units[j]!.cj) j++;
			pushCjk(units, i, j, bounds);
			i = j;
			continue;
		}
		const sea = units[i]!.sea;
		if (sea !== 0) {
			let j = i + 1;
			while (j < end && units[j]!.sea === sea) j++;
			const rangeStart = units[i]!.index;
			const rangeEnd = j < units.length ? units[j]!.index : text.length;
			const spec = SEA[sea];
			if (spec) {
				for (const br of divideSea(text, rangeStart, rangeEnd, spec)) {
					if (br > rangeStart && br < rangeEnd) bounds.push(br);
				}
			}
			i = j;
			continue;
		}
		i++;
	}
	bounds.push(endIndex);
	bounds.sort((a, b) => a - b);
	const unique: number[] = [];
	for (const bound of bounds) {
		if (unique.length === 0 || unique[unique.length - 1] !== bound) unique.push(bound);
	}
	const out: Array<[number, number]> = [];
	for (let b = 0; b < unique.length - 1; b++) out.push([unique[b]!, unique[b + 1]!]);
	return out;
}

export function segmentWords(text: string): Intl.SegmentData[] {
	const units = classify(text);
	const n = units.length;
	const brk = new Uint8Array(n + 1);
	brk[0] = 1;
	brk[n] = 1;
	for (let k = 1; k < n; k++) if (ruleBreak(units, k)) brk[k] = 1;
	const parts: Intl.SegmentData[] = [];
	let start = 0;
	for (let k = 1; k <= n; k++) {
		if (!brk[k]) continue;
		const like = wordLike(units, start, k);
		for (const [a, b] of dictSplit(text, units, start, k)) {
			parts.push({ segment: text.slice(a, b), index: a, input: text, isWordLike: like });
		}
		start = k;
	}
	return parts;
}

export const wordSegmenter: TextSegmenter = {
	segment(input: string): Iterable<Intl.SegmentData> {
		return segmentWords(input);
	},
};
