/**
 * Rebuild the grapheme/word break tables and ICU dictionaries used by the TUI.
 *
 * The checked-in blobs are derived from Unicode 17 and ICU 78 (the versions
 * shipped with Node 22.23, which is what `Intl.Segmenter` uses in CI):
 *   Unicode 17.0.0 UCD auxiliary GraphemeBreakProperty, WordBreakProperty,
 *   emoji-data, DerivedCoreProperties (InCB), LineBreak
 *   ICU maint/maint-78 brkitr dictionaries: cjdict, thaidict, laodict,
 *   khmerdict, burmesedict
 *
 * Run from packages/tui:
 *   node scripts/build-segmenter-data.mjs --ucd <dir> --dicts <dir>
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "../src/dict");
const args = process.argv.slice(2);
function arg(name, fallback) {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : fallback;
}
const ucd = arg("--ucd", process.env.TEMP);
const dicts = arg("--dicts", process.env.TEMP);

const GCB = {
	Other: 0, CR: 1, LF: 2, Control: 3, Extend: 4, ZWJ: 5, Regional_Indicator: 6,
	Prepend: 7, SpacingMark: 8, L: 9, V: 10, T: 11, LV: 12, LVT: 13, Extended_Pictographic: 14,
};
const WB = {
	Other: 0, CR: 1, LF: 2, Newline: 3, Extend: 4, ZWJ: 5, Regional_Indicator: 6,
	Format: 7, Katakana: 8, Hebrew_Letter: 9, ALetter: 10, Single_Quote: 11,
	Double_Quote: 12, MidNumLet: 13, MidLetter: 14, MidNum: 15, Numeric: 16,
	ExtendNumLet: 17, WSegSpace: 18,
};
const INCB = { None: 0, Consonant: 1, Extend: 2, Linker: 3 };
const F_EXT = 1;
const F_HAN = 2;
const F_HIRA = 4;
const F_KATA = 8;
const F_IDEO = 16;
const F_SA = 32;

const N = 0x110000;
const gcb = new Uint8Array(N);
const wb = new Uint8Array(N);
const flags = new Uint8Array(N);

function parseRanges(file, assign) {
	const text = fs.readFileSync(file, "utf8");
	for (const line of text.split("\n")) {
		const raw = line.split("#")[0].trim();
		if (!raw || raw.startsWith("@")) continue;
		const m = /^([0-9A-F]{4,6})(?:\.\.([0-9A-F]{4,6}))?\s*;\s*(.+)$/.exec(raw);
		if (!m) continue;
		assign(Number.parseInt(m[1], 16), m[2] ? Number.parseInt(m[2], 16) : Number.parseInt(m[1], 16), m[3].trim());
	}
}

parseRanges(path.join(ucd, "GraphemeBreakProperty.txt"), (a, b, name) => {
	const id = GCB[name.split(/\s+/)[0]];
	if (id !== undefined) gcb.fill(id, a, b + 1);
});
parseRanges(path.join(ucd, "WordBreakProperty.txt"), (a, b, name) => {
	const id = WB[name.split(/\s+/)[0]];
	if (id !== undefined) wb.fill(id, a, b + 1);
});
parseRanges(path.join(ucd, "emoji-data.txt"), (a, b, name) => {
	if (name.startsWith("Extended_Pictographic")) {
		for (let cp = a; cp <= b; cp++) flags[cp] |= F_EXT;
	}
});
parseRanges(path.join(ucd, "DerivedCoreProperties.txt"), (a, b, rest) => {
	const parts = rest.split(/\s*;\s*/);
	if (parts[0] !== "InCB") return;
	const id = INCB[parts[1]] ?? 0;
	for (let cp = a; cp <= b; cp++) flags[cp] = (flags[cp] & ~0xc0) | (id << 6);
});
parseRanges(path.join(ucd, "LineBreak.txt"), (a, b, name) => {
	if (name.startsWith("SA")) {
		for (let cp = a; cp <= b; cp++) flags[cp] |= F_SA;
	}
});

const reHan = /^\p{Script=Han}$/u;
const reHira = /^\p{Script=Hiragana}$/u;
const reKata = /^\p{Script=Katakana}$/u;
const reIdeo = /^\p{Ideographic}$/u;
function mark(from, to) {
	for (let cp = from; cp <= to; cp++) {
		const ch = String.fromCodePoint(cp);
		if (reHan.test(ch)) flags[cp] |= F_HAN;
		if (reHira.test(ch)) flags[cp] |= F_HIRA;
		if (reKata.test(ch)) flags[cp] |= F_KATA;
		if (reIdeo.test(ch)) flags[cp] |= F_IDEO;
	}
}
mark(0, 0xffff);
mark(0x20000, 0x3ffff);

let lowJoiners = 0;
for (let cp = 0; cp < 0x300; cp++) {
	const g = gcb[cp];
	if (g !== GCB.Other && g !== GCB.Control && g !== GCB.CR && g !== GCB.LF) lowJoiners++;
}
if (lowJoiners !== 0) throw new Error(`unexpected grapheme joiners below U+0300: ${lowJoiners}`);

function mergeSupp() {
	const ranges = [];
	let start = -1;
	let gg = 0;
	let ww = 0;
	let ff = 0;
	const flush = (end) => {
		if (start >= 0) ranges.push([start, end, gg, ww, ff]);
		start = -1;
	};
	for (let cp = 0x10000; cp < N; cp++) {
		if (gcb[cp] === 0 && wb[cp] === 0 && flags[cp] === 0) {
			if (start >= 0) flush(cp - 1);
			continue;
		}
		if (start >= 0 && gcb[cp] === gg && wb[cp] === ww && flags[cp] === ff) continue;
		if (start >= 0) flush(cp - 1);
		start = cp;
		gg = gcb[cp];
		ww = wb[cp];
		ff = flags[cp];
	}
	if (start >= 0) flush(N - 1);
	return ranges;
}
const supp = mergeSupp();

const bmpBytes = 65536 * 3;
const body = Buffer.alloc(8 + bmpBytes + 4 + supp.length * 11);
body.writeUInt32LE(1, 0);
body.writeUInt32LE(65536, 4);
Buffer.from(gcb.buffer, gcb.byteOffset, 65536).copy(body, 8);
Buffer.from(wb.buffer, wb.byteOffset, 65536).copy(body, 8 + 65536);
Buffer.from(flags.buffer, flags.byteOffset, 65536).copy(body, 8 + 65536 * 2);
let p = 8 + bmpBytes;
body.writeUInt32LE(supp.length, p);
p += 4;
for (const [a, b, gg, ww, ff] of supp) {
	body.writeUInt32LE(a, p);
	body.writeUInt32LE(b, p + 4);
	body.writeUInt8(gg, p + 8);
	body.writeUInt8(ww, p + 9);
	body.writeUInt8(ff, p + 10);
	p += 11;
}
fs.mkdirSync(outDir, { recursive: true });
writeBlob("break-tables.cjs", body.subarray(0, p), "Unicode 17 grapheme, word, and indicator classes.");

function readWords(file, withCost) {
	const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
	const words = [];
	let maxCp = 0;
	let maxLen = 0;
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		let w = trimmed;
		let cost = 0;
		if (withCost) {
			const tab = trimmed.indexOf("\t");
			if (tab <= 0) continue;
			w = trimmed.slice(0, tab);
			cost = Number.parseInt(trimmed.slice(tab + 1), 10);
			if (!Number.isFinite(cost) || cost < 0 || cost > 65535) continue;
		}
		const cps = [...w].map((ch) => ch.codePointAt(0));
		if (cps.some((cp) => cp > 0xffff)) throw new Error(`non-BMP dictionary word in ${file}: ${w}`);
		maxCp = Math.max(maxCp, ...cps);
		maxLen = Math.max(maxLen, cps.length);
		words.push({ cps, cost });
	}
	words.sort((a, b) => {
		const n = Math.min(a.cps.length, b.cps.length);
		for (let i = 0; i < n; i++) if (a.cps[i] !== b.cps[i]) return a.cps[i] - b.cps[i];
		return a.cps.length - b.cps.length;
	});
	console.log(path.basename(file), "words", words.length, "maxLen", maxLen, "maxCp", maxCp.toString(16));
	return words;
}

function packWords(words) {
	let chars = 0;
	for (const w of words) chars += w.cps.length;
	const body = Buffer.alloc(8 + chars * 2 + words.length * (4 + 2 + 2));
	body.writeUInt32LE(words.length, 0);
	body.writeUInt32LE(chars, 4);
	let p = 8;
	const offsets = [];
	let cu = 0;
	for (const w of words) {
		offsets.push(cu);
		for (const cp of w.cps) {
			body.writeUInt16LE(cp, p);
			p += 2;
			cu++;
		}
	}
	for (const off of offsets) {
		body.writeUInt32LE(off, p);
		p += 4;
	}
	for (const w of words) {
		body.writeUInt16LE(w.cps.length, p);
		p += 2;
	}
	for (const w of words) {
		body.writeUInt16LE(w.cost, p);
		p += 2;
	}
	return body;
}

function writeBlob(name, body, notice) {
	const compressed = zlib.brotliCompressSync(body, {
		params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
	});
	const b64 = compressed.toString("base64");
	const file = path.join(outDir, name);
	fs.writeFileSync(
		file,
		`// ${notice}\n` +
			"// Derived from Unicode data, https://www.unicode.org/copyright.html\n" +
			"// ICU dictionary data is used under its license; see ./LICENSE.txt\n" +
			`module.exports = ${JSON.stringify(b64)};\n`,
	);
	console.log(name, "raw", body.length, "brotli", compressed.length, "file", fs.statSync(file).size);
}

const sources = [
	["cjdict.cjs", "cjdict78.txt", true, "ICU 78 cjdict (Chinese/Japanese word costs)."],
	["thaidict.cjs", "thaidict.txt", false, "ICU 78 Thai word list."],
	["laodict.cjs", "laodict.txt", false, "ICU 78 Lao word list."],
	["khmerdict.cjs", "khmerdict.txt", false, "ICU 78 Khmer word list."],
	["burmesedict.cjs", "burmesedict.txt", false, "ICU 78 Myanmar word list."],
];
for (const [name, file, withCost, notice] of sources) {
	writeBlob(name, packWords(readWords(path.join(dicts, file), withCost)), notice);
}
console.log("supp ranges", supp.length);
