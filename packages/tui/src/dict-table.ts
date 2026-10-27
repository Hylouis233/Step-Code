import { brotliDecompressSync } from "node:zlib";

export interface WordTrie {
	/** Node reached by a single BMP code unit, or -1. */
	root: Int32Array;
	head: Uint32Array;
	degree: Uint16Array;
	/** -1 when the node is not a dictionary word. */
	cost: Int32Array;
	edgeChar: Uint16Array;
	edgeTo: Int32Array;
}

interface DictTable {
	chars: Uint16Array;
	offsets: Uint32Array;
	lengths: Uint16Array;
	costs: Uint16Array;
	count: number;
}

function copyU16(raw: Buffer, byteOffset: number, count: number): Uint16Array {
	const out = new Uint16Array(count);
	raw.copy(Buffer.from(out.buffer), 0, byteOffset, byteOffset + count * 2);
	return out;
}

function copyU32(raw: Buffer, byteOffset: number, count: number): Uint32Array {
	const out = new Uint32Array(count);
	raw.copy(Buffer.from(out.buffer), 0, byteOffset, byteOffset + count * 4);
	return out;
}

function decodeDict(payload: string): DictTable {
	const raw = brotliDecompressSync(Buffer.from(payload, "base64"));
	const count = raw.readUInt32LE(0);
	const charCount = raw.readUInt32LE(4);
	let p = 8;
	const chars = copyU16(raw, p, charCount);
	p += charCount * 2;
	const offsets = copyU32(raw, p, count);
	p += count * 4;
	const lengths = copyU16(raw, p, count);
	p += count * 2;
	const costs = copyU16(raw, p, count);
	return { chars, offsets, lengths, costs, count };
}

function trieFromDict(dict: DictTable): WordTrie {
	const root = new Int32Array(65536);
	root.fill(-1);
	const cost: number[] = [];
	const edgeHead: number[] = [];
	const edgeCount: number[] = [];
	const edgeChars: number[] = [];
	const edgeTargets: number[] = [];
	const edgeNext: number[] = [];
	const newNode = (): number => {
		const id = cost.length;
		cost.push(-1);
		edgeHead.push(-1);
		edgeCount.push(0);
		return id;
	};
	const addEdge = (node: number, ch: number, to: number) => {
		const edge = edgeChars.length;
		edgeChars.push(ch);
		edgeTargets.push(to);
		edgeNext.push(edgeHead[node]!);
		edgeHead[node] = edge;
		edgeCount[node] = edgeCount[node]! + 1;
	};
	let prev: number[] = [];
	let prevNodes: number[] = [];
	for (let w = 0; w < dict.count; w++) {
		const off = dict.offsets[w]!;
		const len = dict.lengths[w]!;
		if (len === 0) continue;
		let shared = 0;
		const max = len < prev.length ? len : prev.length;
		while (shared < max && dict.chars[off + shared] === prev[shared]) shared++;
		const nodes = prevNodes.slice(0, shared);
		for (let c = shared; c < len; c++) {
			const id = newNode();
			const ch = dict.chars[off + c]!;
			if (c === 0) root[ch] = id;
			else addEdge(nodes[c - 1]!, ch, id);
			nodes.push(id);
		}
		cost[nodes[len - 1]!] = dict.costs[w]!;
		prev = [];
		for (let c = 0; c < len; c++) prev.push(dict.chars[off + c]!);
		prevNodes = nodes;
	}
	const head = new Uint32Array(cost.length);
	const degree = new Uint16Array(cost.length);
	const edgeChar = new Uint16Array(edgeChars.length);
	const edgeTo = new Int32Array(edgeChars.length);
	let cursor = 0;
	const siblings: Array<{ ch: number; to: number }> = [];
	for (let node = 0; node < cost.length; node++) {
		const n = edgeCount[node]!;
		degree[node] = n;
		head[node] = cursor;
		siblings.length = 0;
		for (let edge = edgeHead[node]!; edge >= 0; edge = edgeNext[edge]!) {
			siblings.push({ ch: edgeChars[edge]!, to: edgeTargets[edge]! });
		}
		siblings.sort((a, b) => a.ch - b.ch);
		for (const edge of siblings) {
			edgeChar[cursor] = edge.ch;
			edgeTo[cursor] = edge.to;
			cursor++;
		}
	}
	return { root, head, degree, cost: Int32Array.from(cost), edgeChar, edgeTo };
}

export function loadTrie(payload: string): WordTrie {
	return trieFromDict(decodeDict(payload));
}

function step(trie: WordTrie, node: number, ch: number): number {
	let lo = trie.head[node]!;
	let hi = lo + trie.degree[node]!;
	const chars = trie.edgeChar;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		const found = chars[mid]!;
		if (found < ch) lo = mid + 1;
		else hi = mid;
	}
	if (lo < trie.head[node]! + trie.degree[node]! && chars[lo] === ch) return trie.edgeTo[lo]!;
	return -1;
}

/** Dictionary hits along text[pos, end), shortest first, plus the longest shared prefix. */
export function matchTrie(
	trie: WordTrie,
	text: string,
	pos: number,
	end: number,
	maxStore: number,
): { lens: number[]; costs: number[]; prefix: number } {
	const lens: number[] = [];
	const costs: number[] = [];
	if (pos >= end) return { lens, costs, prefix: 0 };
	const first = text.charCodeAt(pos);
	let node = first < 65536 ? trie.root[first]! : -1;
	if (node < 0) return { lens, costs, prefix: 0 };
	const wordCost = trie.cost[node]!;
	if (wordCost >= 0) {
		lens.push(1);
		costs.push(wordCost);
	}
	let prefix = 1;
	const limit = end - pos;
	for (let len = 2; len <= limit; len++) {
		const next = step(trie, node, text.charCodeAt(pos + len - 1));
		if (next < 0) break;
		node = next;
		prefix = len;
		const nextCost = trie.cost[node]!;
		if (nextCost >= 0 && lens.length < maxStore) {
			lens.push(len);
			costs.push(nextCost);
		}
	}
	return { lens, costs, prefix };
}
