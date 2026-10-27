import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "../src/dict");
const dest = path.join(here, "../dist/dict");
fs.mkdirSync(dest, { recursive: true });
for (const name of fs.readdirSync(src)) {
	if (name.endsWith(".cjs") || name === "LICENSE.txt") {
		fs.copyFileSync(path.join(src, name), path.join(dest, name));
	}
}
