import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, expect, test, vi } from "vitest";

const handlers = vi.hoisted(() => ({
	nodeVersion: "v24.0.0",
	onCurl: undefined as undefined | ((args: readonly string[]) => void),
	commandExists: (_command: string): boolean => false,
}));

// steppage-provision.ts promisifies execFile, so the mock must publish the same
// promisify.custom contract the real child_process.execFile exposes.
vi.mock("node:child_process", () => {
	const promisifyCustom = Symbol.for("nodejs.util.promisify.custom");
	const execFile = vi.fn();
	const custom = vi.fn((file: string, args: readonly string[] = []) => {
		return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
			const notFound = (command: string) => {
				const error: NodeJS.ErrnoException = new Error(`spawn ${command} ENOENT`);
				error.code = "ENOENT";
				return error;
			};
			if (file === "node" && args[0] === "--version") {
				resolve({ stdout: `${handlers.nodeVersion}\n`, stderr: "" });
			} else if (file === "cmd" && args[0] === "/d" && args[1] === "/c") {
				const command = args[2] ?? "";
				if (!command.endsWith(".cmd") || !handlers.commandExists(command)) reject(notFound(command));
				else resolve({ stdout: "1.0.0\n", stderr: "" });
			} else if (file === "curl") {
				Promise.resolve()
					.then(() => handlers.onCurl?.(args))
					.then(
						() => resolve({ stdout: "", stderr: "" }),
						(error) => reject(error instanceof Error ? error : new Error(String(error))),
					);
			} else {
				reject(notFound(`${file} ${args.join(" ")}`));
			}
		});
	});
	(execFile as unknown as Record<symbol, unknown>)[promisifyCustom] = custom;
	const spawn = vi.fn(() => {
		throw new Error("spawn must not run on the Windows provisioning path");
	});
	return { execFile, spawn };
});

vi.mock("proper-lockfile", () => ({
	default: {
		lock: vi.fn(async () => async () => undefined),
	},
}));

const { ensureStepPageReady, renderStepPageWrapper, stepPageBundleUrl, stepPageCommandCandidates } = await import(
	"../src/step/steppage-provision.ts"
);

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
	handlers.nodeVersion = "v24.0.0";
	handlers.onCurl = undefined;
	handlers.commandExists = () => false;
});

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "steppage-windows-"));
	roots.push(root);
	await mkdir(join(root, "latest"), { recursive: true });
	await writeFile(join(root, "latest", "steppage-mcp.mjs"), "// fixture bundle\n");
	await mkdir(join(root, "bin"), { recursive: true });
	const env: NodeJS.ProcessEnv = {
		HOME: root,
		USERPROFILE: root,
		PATH: `${join(root, "bin")}:/usr/bin:/bin`,
		STEPCODE_STEPPAGE_INSTALLER_URL: pathToFileURL(join(root, "installer.sh")).href,
	};
	return { root, env };
}

function managedWrapper(root: string): string {
	return join(root, ".local", "bin", "steppage-mcp.cmd");
}

function managedBundle(root: string): string {
	return join(root, ".steppage-mcp", "bin", "steppage-mcp.mjs");
}

test("bundle url derives from the installer url", () => {
	expect(stepPageBundleUrl()).toBe("https://dl.stepfun.com/steppage-mcp/p/latest/steppage-mcp.mjs");
	expect(stepPageBundleUrl({ STEPCODE_STEPPAGE_INSTALLER_URL: "https://mirror.example/steppage/install.sh" })).toBe(
		"https://mirror.example/steppage/latest/steppage-mcp.mjs",
	);
});

test("windows probes the cmd wrapper", () => {
	const managed = join("/home/u", ".local", "bin", "steppage-mcp");
	expect(stepPageCommandCandidates("win32", "/home/u")).toEqual([
		"steppage-mcp",
		"steppage-mcp.cmd",
		`${managed}.cmd`,
	]);
	expect(stepPageCommandCandidates("linux", "/home/u")).toEqual(["steppage-mcp", managed]);
});

test("wrapper runs the bundle through node", () => {
	const bundle = join("C:", "Users", "u", ".steppage-mcp", "bin", "steppage-mcp.mjs");
	expect(renderStepPageWrapper(bundle)).toBe(`@echo off\r\nnode "${bundle}" %*\r\n`);
});

test("windows installs the published bundle and a cmd wrapper", async () => {
	const f = await fixture();
	handlers.commandExists = (command) => command.endsWith(".cmd") && existsSync(command);
	handlers.onCurl = (args) => {
		const url = args.find((arg) => arg.startsWith("file://"));
		const output = args[args.indexOf("-o") + 1];
		if (!url || !output) throw new Error(`unexpected curl args: ${args.join(" ")}`);
		return copyFile(fileURLToPath(url), output);
	};
	expect(await ensureStepPageReady({ env: f.env, platform: "win32" })).toEqual({
		command: managedWrapper(f.root),
		installed: true,
	});
	expect(await readFile(managedBundle(f.root), "utf8")).toBe("// fixture bundle\n");
	expect(await readFile(managedWrapper(f.root), "utf8")).toBe(renderStepPageWrapper(managedBundle(f.root)));
});

test("windows reuses a healthy wrapper without downloading", async () => {
	const f = await fixture();
	await mkdir(dirname(managedWrapper(f.root)), { recursive: true });
	await writeFile(managedWrapper(f.root), renderStepPageWrapper(managedBundle(f.root)));
	handlers.commandExists = (command) => command.endsWith(".cmd") && existsSync(command);
	let curlCalls = 0;
	handlers.onCurl = () => {
		curlCalls += 1;
	};
	expect(await ensureStepPageReady({ env: f.env, platform: "win32" })).toEqual({
		command: managedWrapper(f.root),
		installed: false,
	});
	expect(curlCalls).toBe(0);
	expect(existsSync(managedBundle(f.root))).toBe(false);
});

test("windows requires Node.js >= 20", async () => {
	const f = await fixture();
	handlers.nodeVersion = "v18.20.0";
	handlers.onCurl = () => {
		throw new Error("curl must not run when the Node.js runtime is too old");
	};
	const result = await ensureStepPageReady({ env: f.env, platform: "win32" });
	expect(result.installed).toBe(false);
	expect(result.error).toContain("Node.js >= 20");
	expect(result.error).toContain("v18.20.0");
	expect(existsSync(managedWrapper(f.root))).toBe(false);
});

test("windows failure keeps Step usable and points at step mcp prepare", async () => {
	const f = await fixture();
	handlers.onCurl = () => {
		throw new Error("curl: (22) The requested URL returned error: 404");
	};
	const result = await ensureStepPageReady({ env: f.env, platform: "win32" });
	expect(result.installed).toBe(false);
	expect(result.error).toContain("StepPage is not ready");
	expect(result.error).toContain("step mcp prepare");
	expect(result.error).not.toContain("| sh");
});
