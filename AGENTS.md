# Agent instructions

## Commit attribution

- Keep the Git author and committer as the human contributor's verified GitHub identity.
- AI tools may assist with implementation, but they must not be added as commit co-authors.
- Do not add `Co-authored-by` or `Co-Authored-By` trailers for Claude, Claude Code, Codex, ChatGPT, OpenAI, Anthropic, or another AI client.
- Do not mention the client used to create a change in the commit message solely for attribution.
- Before creating or amending a commit, inspect its metadata and remove any AI-client attribution trailer.

This policy applies to commit metadata. Documentation may mention AI products when that is relevant to the product or feature being documented.

## 1. Scope and reading order

This file defines repository-wide rules for Step-Code. Before changing a directory, also read the `AGENTS.md` files in that directory and its ancestors. Local rules add module constraints; they cannot override this file's commit attribution policy, dependency direction, or public-source boundary.

- `CLAUDE.md` continues to reference this file; do not maintain a second set of repository rules.
- Organize architecture guidance around layers, responsibilities, and ownership. Verify paths, dependencies, commands, and defaults against current source, `package.json`, check scripts, and the relevant documentation.
- Check implementation status before borrowing designs from other repositories. Do not copy obsolete paths, unimplemented plans, or private branch and release procedures.

## 2. Layers and module entry points

Dependencies flow from product entry points toward foundational capabilities. Foundational packages must not depend on products or applications. The table defines allowed internal dependencies, not a requirement to depend on every listed package.

| Layer | Module and local rules | Responsibility | Allowed internal dependencies |
| --- | --- | --- | --- |
| Foundation | [telemetry](packages/telemetry/AGENTS.md) | Telemetry contracts, typed schemas, no-op and in-memory reference implementations | None |
| Foundation | [tui](packages/tui/AGENTS.md) | Terminal input, layout, differential rendering, and generic components | None |
| Foundation | [contracts](packages/contracts/AGENTS.md) | In-process host/Agent interfaces, wire events, and framing | None; runtime dependencies must remain empty |
| Foundation | [config](packages/config/AGENTS.md) | Product-neutral configuration migrations | None |
| Model runtime | [providers](packages/providers/AGENTS.md) | Providers, API dialects, model catalogs, credentials, and vendor adapters | telemetry |
| Agent runtime | [agent-core](packages/agent-core/AGENTS.md) | The single Agent Loop, generic harness, session and context semantics | providers, telemetry |
| Coding product | [coding-agent](packages/coding-agent/AGENTS.md) | Coding sessions, tool policies, extensions, orchestration, Step integrations, and themes | agent-core, providers, config, tui |
| Application host | [apps/cli](apps/cli/AGENTS.md) | argv, startup composition, mode routing, process lifecycle, and interactive UI | coding-agent, agent-core, providers, config, tui |

- Register new workspaces in `pnpm-workspace.yaml`, root `package.json`, and `scripts/workspace-registry.json`. Use the `@step-harness/*` scope for new internal packages.
- Use public package entry points for cross-package calls. Do not depend on another package's `dist/` layout or bypass boundaries with deep source imports.
- `packages/**` must not import `apps/**`. `packages/tui` must not depend on Agent, provider, session, or product code.
- Put new vendor SDKs behind adapters in `packages/providers`. Coding-product integrations such as MCP and plugins belong in `packages/coding-agent`, not the generic Agent Loop or rendering library.

## 3. Ownership of core concepts

| Concept | Semantic owner | Product and host usage |
| --- | --- | --- |
| Agent Loop | `packages/agent-core/src/agent-loop.ts` | coding-agent composes it; TUI, print, JSON, RPC, and SDK reuse it. Do not create another loop. |
| Session / transcript | Generic session contracts in agent-core; coding-agent's `AgentSession` / `SessionManager` own coding-session execution and persistence | UI holds input, connection, selection, and presentation state; it must not become the authority for persistent sessions. |
| Context / compaction | Generic harness in agent-core; message conversion, skill retention, and recovery adapters in coding-agent | Presentation code must not assemble a second model context. Request projection must not rewrite the original transcript. |
| Provider / model | Registration, catalogs, dialects, and adapters in providers | Products select and configure models. Dispatch by API dialect, never by provider name or display metadata. |
| Tool / permission | Generic tool primitives in agent-core; coding tools, registration, permissions, and output retention in coding-agent | Clients present approval requests rather than duplicate permission decisions. Providers do not orchestrate tools. |
| Subagent / workflow / goal / cron / plan / task | `packages/coding-agent/src/features/` | Compose through extensions and the same session lifecycle. Do not infer state from UI text or model replies. |
| Configuration and resources | Neutral migrations in config; settings, trust, and resource resolution in coding-agent's core / step | CLI injects paths, defaults, and UI hooks. Step settings use `config.toml`; credentials, models, and sessions retain their own storage contracts. |
| Theme / TUI | Product themes in coding-agent's `src/theme/`; rendering primitives in tui; interactive composition in `apps/cli/src/ui/` | Components consume the active theme. Do not add another theme registry or rendering loop. |
| Host protocols | Independent in-process and wire contracts in contracts; concrete RPC / stdio protocols in existing mode entry points | Do not assume every mode already uses contracts. Adapt and validate new connections at host boundaries; keep concrete host objects out of contracts. |

## 4. Choosing directories and implementing changes

- Generic context, session, and tool primitives: `packages/agent-core/src/harness/`. Coding-product adapters: `packages/coding-agent/src/core/`.
- Built-in product features and orchestration: `packages/coding-agent/src/features/`. Extension loading, registration, and hooks: `packages/coding-agent/src/core/extensions/`.
- Step login, unified configuration, MCP, plugins, permissions, and feedback: `packages/coding-agent/src/step/`. Plugin manifests: `plugins/`.
- CLI commands and startup: `apps/cli/src/commands/`, `args/`, `bootstrap/`, and `modes/`. Product UI: `apps/cli/src/ui/`.
- Shell / bootstrap / modes enter UI only through `#ui` or `#ui/index`, never deep `#ui/...` imports. UI must not import the shell.
- UI dependencies flow host → runtime → view. Runtime receives host capabilities through its own `RuntimeContext`; view must not import runtime. If used, `ui/state/` is a leaf and must not depend on host, runtime, or view.
- Use existing actions and keybinding tables. Do not hardcode key matching in product logic.
- Provide complete TypeScript types for public interfaces. Prefer `unknown` with validation over unnecessary `any`; verify external APIs against installed dependency types.
- Relative TypeScript imports use `.ts` extensions and follow `check:ts-imports`. Source checked by the root configuration uses erasable syntax; do not add `enum`, parameter properties, or syntax requiring JavaScript emit.
- Do not hand-edit `packages/providers/src/models.generated.ts` or provider data snapshots. Change generator scripts or inputs, then run the corresponding generation commands.
- Preserve existing features and explicit user requirements. Do not delete functionality, weaken checks, or introduce unrelated refactors to make type or boundary checks pass.

## 5. Development and validation

- Use Node.js `>=22.19.0` and the pnpm version in the root manifest. Install with `pnpm install --ignore-scripts`; reproduce the locked environment with `pnpm install --frozen-lockfile --ignore-scripts`.
- Pin direct external dependencies to exact versions. Update the lockfile with dependency changes; do not update dependencies for documentation tasks or bypass lockfile commit checks.
- Run source through root `pnpm step` or `./step-test.sh`. `./step-test.sh --no-env` removes listed provider environment credentials, but local user resources still require care.
- After code changes, run root `pnpm run check`, inspect the full output, and fix errors. It includes Biome autofixes, type checks, and boundary checks; it does not run tests.
- Run relevant tests when changing tests. Run Vitest from the owning package with `pnpm exec vitest --run <test-path>`; tui uses `node --test test/<name>.test.ts`.
- Use `./test.sh` for repository tests and follow the pre-submission requirements in [CONTRIBUTING.md](CONTRIBUTING.md). It isolates user resources and credentials and builds offline if outputs are missing. Do not run a full Vitest suite that may activate real providers directly.
- Unit and regression tests use faux providers, fixtures, mocks, and temporary directories. They must not read real accounts or consume paid model requests.
- For documentation-only changes, verify relative links, directories, and commands and run `git diff --check`. Documentation changes alone do not require builds or model tests.
- When changing Agent Loop, sessions, tool permissions, providers, themes, or cross-process contracts, update the relevant `docs/`, package documentation, and affected `AGENTS.md` files.

## 6. Task execution and Git collaboration

- Before editing, read affected files, local rules, and relevant documentation. For complex or high-risk work, explain steps, tools, acceptance criteria, and rollback. Continue reversible work already authorized by the user.
- Prefer existing tools in `scripts/`. Keep temporary validation scripts in temporary directories, outside product source.
- Do not commit or push unless requested. Stage only explicit paths belonging to the task; do not use `git add .` or `git add -A`.
- If the working directory contains another task's changes, use a separate worktree or touch only your files. Do not stash, clean, or revert other contributors' changes.
- Do not use `git reset --hard`, `git checkout .`, `git clean -fd`, skip hooks, or force-push. If a Git operation conflicts with unrelated files, stop that operation and explain the conflict.
- Commits, PR/MR descriptions, issues, and comments must not include AI-client attribution, bot co-authors, or generated-by footers. Keep author / committer as the current human contributor's Git identity.
- Report the changes, validation evidence, and anything still unverified. Keep delivery notes concise and specific.

## 7. Public source and support directories

- Public source includes code, public tests, local builds, and CI checks. Private telemetry exporters, internal endpoints, release credentials, protected-tag operations, and upload/publication workflows stay in a separate release environment.
- Do not copy internal execution records, private CI configuration, or infrastructure addresses into this repository. Follow the [public-source boundary](docs/open-source-status.md) and `check:public-boundary`.
- Documentation: follow [docs/AGENTS.md](docs/AGENTS.md).
- Check and build scripts: follow [scripts/AGENTS.md](scripts/AGENTS.md).
- Local release packaging and installer templates: follow [infra/release/AGENTS.md](infra/release/AGENTS.md).
- Built-in plugin manifests: follow [plugins/AGENTS.md](plugins/AGENTS.md).
