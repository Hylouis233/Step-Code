import { createRequire } from "node:module";
import { brotliDecompressSync } from "node:zlib";

/** Grapheme_Cluster_Break ids packed by scripts/build-segmenter-data.mjs. */
export const GCB = {
	Other: 0,
	CR: 1,
	LF: 2,
	Control: 3,
	Extend: 4,
	ZWJ: 5,
	RI: 6,
	Prepend: 7,
	SpacingMark: 8,
	L: 9,
	V: 10,
	T: 11,
	LV: 12,
	LVT: 13,
	ExtPict: 14,
} as const;

/** Word_Break ids packed by scripts/build-segmenter-data.mjs. */
export const WB = {
	Other: 0,
	CR: 1,
	LF: 2,
	Newline: 3,
	Extend: 4,
	ZWJ: 5,
	RI: 6,
	Format: 7,
	Katakana: 8,
	Hebrew: 9,
	ALetter: 10,
	SQ: 11,
	DQ: 12,
	MidNumLet: 13,
	MidLetter: 14,
	MidNum: 15,
	Numeric: 16,
	ExtNumLet: 17,
	WSeg: 18,
} as const;

export const F_EXT = 1;
export const F_HAN = 2;
export const F_HIRA = 4;
export const F_KATA = 8;
export const F_IDEO = 16;
export const F_SA = 32;

const INCB_CONSONANT = 1;
const INCB_EXTEND = 2;
const INCB_LINKER = 3;

let loaded = false;
let gcbBmp = new Uint8Array(0);
let wbBmp = new Uint8Array(0);
let flagsBmp = new Uint8Array(0);
let suppStart = new Uint32Array(0);
let suppEnd = new Uint32Array(0);
let suppGcb = new Uint8Array(0);
let suppWb = new Uint8Array(0);
let suppFlags = new Uint8Array(0);

function readBreakTables(): string {
	return createRequire(import.meta.url)("./dict/break-tables.cjs") as string;
}

function ensureTables(): void {
	if (loaded) return;
	const raw = brotliDecompressSync(Buffer.from(readBreakTables(), "base64"));
	if (raw.readUInt32LE(0) !== 1 || raw.readUInt32LE(4) !== 65536) {
		throw new Error("unsupported break table");
	}
	let p = 8;
	gcbBmp = raw.subarray(p, p + 65536);
	p += 65536;
	wbBmp = raw.subarray(p, p + 65536);
	p += 65536;
	flagsBmp = raw.subarray(p, p + 65536);
	p += 65536;
	const count = raw.readUInt32LE(p);
	p += 4;
	suppStart = new Uint32Array(count);
	suppEnd = new Uint32Array(count);
	suppGcb = new Uint8Array(count);
	suppWb = new Uint8Array(count);
	suppFlags = new Uint8Array(count);
	for (let i = 0; i < count; i++) {
		suppStart[i] = raw.readUInt32LE(p);
		suppEnd[i] = raw.readUInt32LE(p + 4);
		suppGcb[i] = raw.readUInt8(p + 8);
		suppWb[i] = raw.readUInt8(p + 9);
		suppFlags[i] = raw.readUInt8(p + 10);
		p += 11;
	}
	loaded = true;
}

export function breakTablesLoaded(): boolean {
	return loaded;
}

function suppAt(cp: number): number {
	let lo = 0;
	let hi = suppStart.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (suppStart[mid]! <= cp) lo = mid + 1;
		else hi = mid;
	}
	const i = lo - 1;
	if (i >= 0 && cp <= suppEnd[i]!) return i;
	return -1;
}

export function gcbOf(cp: number): number {
	ensureTables();
	if (cp < 65536) return gcbBmp[cp] ?? 0;
	const i = suppAt(cp);
	return i < 0 ? 0 : suppGcb[i]!;
}

export function wbOf(cp: number): number {
	ensureTables();
	if (cp < 65536) return wbBmp[cp] ?? 0;
	const i = suppAt(cp);
	return i < 0 ? 0 : suppWb[i]!;
}

export function flagsOf(cp: number): number {
	ensureTables();
	if (cp < 65536) return flagsBmp[cp] ?? 0;
	const i = suppAt(cp);
	return i < 0 ? 0 : suppFlags[i]!;
}

export function incbOf(cp: number): number {
	return (flagsOf(cp) >> 6) & 3;
}

export function isExtendedPictographic(cp: number): boolean {
	return (flagsOf(cp) & F_EXT) !== 0;
}

export { INCB_CONSONANT, INCB_EXTEND, INCB_LINKER };

export function readCodePoint(text: string, index: number): { cp: number; next: number } {
	const unit = text.charCodeAt(index);
	if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < text.length) {
		const low = text.charCodeAt(index + 1);
		if (low >= 0xdc00 && low <= 0xdfff) {
			return { cp: ((unit - 0xd800) << 10) + (low - 0xdc00) + 0x10000, next: index + 2 };
		}
	}
	return { cp: unit, next: index + 1 };
}
