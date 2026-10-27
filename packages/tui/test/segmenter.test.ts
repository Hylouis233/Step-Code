import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { nextGraphemeEnd } from "../src/grapheme.ts";
import { getWordSegmenter, visibleWidth } from "../src/utils.ts";

const icu78 = (process.versions.icu ?? "").startsWith("78.");
const here = path.dirname(fileURLToPath(import.meta.url));

function showWords(text: string): string {
	return [...getWordSegmenter().segment(text)]
		.map((part) => JSON.stringify(part.segment) + (part.isWordLike ? "*" : ""))
		.join("|");
}

function showGraphemes(text: string): string {
	const bounds = [0];
	let i = 0;
	while (i < text.length) {
		const end = nextGraphemeEnd(text, i);
		if (end <= i) break;
		bounds.push(end);
		i = end;
	}
	return bounds.join(",");
}

describe("pure segmenter", () => {
	it("defers break tables and dictionaries until a lookup needs them", () => {
		const script = `
			import { breakTablesLoaded } from "./src/break-data.ts";
			import { getGraphemeSegmenter, getWordSegmenter, visibleWidth } from "./src/utils.ts";
			import { loadedDictionaries } from "./src/word-break.ts";
			const graphemes = [...getGraphemeSegmenter().segment("hello 你好")];
			if (graphemes.length !== 8) throw new Error("graphemes " + graphemes.length);
			if (visibleWidth("hello 你好") !== 10) throw new Error("width " + visibleWidth("hello 你好"));
			if (breakTablesLoaded()) throw new Error("tables loaded for plain text");
			if (loadedDictionaries().cj) throw new Error("dictionary loaded for graphemes");
			const mark = [...getGraphemeSegmenter().segment("e\\u0301")].map((part) => part.segment);
			if (mark.join("|") !== "e\\u0301") throw new Error("mark " + mark.join("|"));
			if (!breakTablesLoaded()) throw new Error("tables not loaded for a combining mark");
			if ([...getWordSegmenter().segment("hello")][0].segment !== "hello") throw new Error("latin");
			if ([...getWordSegmenter().segment("你")][0].segment !== "你") throw new Error("single han");
			if (loadedDictionaries().cj) throw new Error("dictionary loaded before a multi-character Han word");
			const words = [...getWordSegmenter().segment("你好")].map((part) => part.segment).join("|");
			if (words !== "你好") throw new Error(words);
			if (!loadedDictionaries().cj || loadedDictionaries().thai) throw new Error("dictionary load flags");
		`;
		const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
			cwd: path.join(here, ".."),
			encoding: "utf8",
		});
		assert.equal(result.status, 0, result.stderr || result.stdout);
	});

	it("preserves the dictionary words the editor tests depend on", () => {
		const pinned: Array<[string, string]> = [
			["你好世界", '"你好"*|"世界"*'],
			["中华人民共和国", '"中华"*|"人民"*|"共和国"*'],
			["我是中国人", '"我是"*|"中国人"*'],
			["今天天气不错", '"今天"*|"天气"*|"不错"*'],
			["今天天气不错吧", '"今天"*|"天气"*|"不错"*|"吧"*'],
			["東京都", '"東京"*|"都"*'],
			["カタカナと漢字", '"カタカナ"*|"と"*|"漢字"*'],
			["私は学生です", '"私"*|"は"*|"学生"*|"です"*'],
			["これはテストです", '"これ"*|"は"*|"テスト"*|"です"*'],
			["でした", '"で"*|"した"*'],
			["ました", '"ま"*|"した"*'],
			["foo.bar", '"foo.bar"*'],
			["foo:bar", '"foo:bar"*'],
			["__", '"__"*'],
			["_", '"_"'],
			["々", '"々"'],
			["々々", '"々"*|"々"*'],
			["一々", '"一々"*'],
			["x々y", '"x"*|"々"|"y"*'],
		];
		for (const [text, expected] of pinned) {
			assert.equal(showWords(text), expected, text);
		}
	});

	it("measures the widths the renderer already relies on", () => {
		assert.equal(visibleWidth(""), 0);
		assert.equal(visibleWidth("abc"), 3);
		assert.equal(visibleWidth("你好"), 4);
		assert.equal(visibleWidth("\t"), 3);
		assert.equal(visibleWidth("a\tb"), 5);
		assert.equal(visibleWidth("\x1b[31m你好\x1b[0m"), 4);
		assert.equal(visibleWidth("🇨🇳"), 2);
		assert.equal(visibleWidth("🇨"), 2);
		assert.equal(visibleWidth("a\u0301"), 1);
	});

	it("does not construct Intl.Segmenter in production sources", () => {
		const roots = [path.join(here, "../src"), path.join(here, "../../../apps/cli/src")];
		const offenders: string[] = [];
		const visit = (dir: string) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					if (entry.name === "dict" || entry.name === "node_modules") continue;
					visit(full);
					continue;
				}
				if (!entry.name.endsWith(".ts")) continue;
				const text = fs.readFileSync(full, "utf8");
				if (text.includes("new Intl.Segmenter")) offenders.push(full);
			}
		};
		for (const root of roots) visit(root);
		assert.deepEqual(offenders, []);
	});
});

describe("segmenter versus Intl", { skip: icu78 ? false : "local ICU is not 78" }, () => {
	const words = [
		"你好世界",
		"中华人民共和国",
		"我是中国人",
		"今天天气不错吧",
		"東京都",
		"カタカナと漢字",
		"私は学生です",
		"これはテストです",
		"でした",
		"ました",
		"你好世界。你好，世界",
		"hello world",
		"foo.bar",
		"foo:bar",
		"foo...bar",
		"it's",
		"123.45",
		"a_b_c",
		"___",
		"1️⃣",
		"a\u200Db",
		"👨‍👩‍👧‍👦",
		"🇨🇳",
		"🇨🇦🇺🇸",
		"ﾊﾝｶｸ",
		"漢\u3099字",
		"foo\u200bbar",
		"x々y",
		"々々々",
		"一々",
		"__",
		"_",
		"helloสวัสดี",
		"สวัสดีครับ",
		"ภาษาไทย",
		"ສະບາຍດີ",
		"안녕하세요",
		"가나다",
		"한_글",
		"カタカナ_foo",
		"5_️",
		"한글‍",
		"한‍글",
		"a️",
		"你好️",
		"スナ‍👦",
		"\r\n",
		"   ",
		"a\u00a0b",
		"www.example.com",
		"rock'n'roll",
		"can't",
		"１",
		"Ａ",
	];
	const graphemes = [
		"a",
		"a\u0301",
		"\r\n",
		"👨‍👩‍👧‍👦",
		"🇨🇳",
		"🇨🇦🇺🇸",
		"1️⃣",
		"a\u200Db",
		"ก\u0e31",
		"हिन्दी",
		"\u0937\u094d\u091f",
		"abc你",
		"*\uFE0F\u20E3",
	];

	function intlWords(text: string): string {
		const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
		return [...segmenter.segment(text)]
			.map((part) => JSON.stringify(part.segment) + (part.isWordLike ? "*" : ""))
			.join("|");
	}
	function intlGraphemes(text: string): string {
		const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
		return [...segmenter.segment(text)]
			.map((part) => part.index)
			.concat(text.length)
			.join(",");
	}

	it("matches curated word and grapheme samples", () => {
		for (const text of words) assert.equal(showWords(text), intlWords(text), JSON.stringify(text));
		for (const text of graphemes) assert.equal(showGraphemes(text), intlGraphemes(text), JSON.stringify(text));
	});

	it("matches random mixed strings and BMP singletons", () => {
		const pool = [
			..."abcXYZ019 foo.bar, it's a_b 你好世界ひらがなカタカナ한글々ー「」。，👨‍👩‍👧‍👦🇨🇳1️⃣*\u0301\u3099\u200d\u200bสวัสดีกข",
		];
		let state = 0x12345678;
		const next = () => {
			state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
			return state;
		};
		for (let n = 0; n < 400; n++) {
			const len = 1 + (next() % 24);
			let text = "";
			for (let i = 0; i < len; i++) text += pool[next() % pool.length]!;
			assert.equal(showWords(text), intlWords(text), JSON.stringify(text));
			if (n < 200) assert.equal(showGraphemes(text), intlGraphemes(text), JSON.stringify(text));
		}
		for (let cp = 0; cp <= 0xffff; cp++) {
			if (cp >= 0xd800 && cp <= 0xdfff) continue;
			if (cp % 32 !== 0 && cp > 0x7f && !(cp >= 0x3000 && cp <= 0x30ff) && !(cp >= 0x4e00 && cp <= 0x4eff)) continue;
			const text = String.fromCharCode(cp);
			assert.equal(showWords(text), intlWords(text), `U+${cp.toString(16)}`);
		}
	});
});
