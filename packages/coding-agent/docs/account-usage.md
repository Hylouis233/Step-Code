# Account usage and local activity

`/usage` opens two tabs: **Overview** and **Account**. `/usage overview` and `/usage account` open either tab directly. `/usage --refresh` and `/usage account --refresh` refresh Account. Session and History are not separate tabs or commands.

## Overview

Overview reads this machine's Step session JSONL files and shows the last 365 local calendar dates. It includes an activity heatmap, daily token/chat totals, reasoning settings recorded at dispatch, discovered/used skills, and plugin/skill runs. `P` switches all projects/current project; `[` and `]` select a date. Narrow terminals show recent weeks while totals still cover the year.

Tokens include assistant replies, tool-reported usage, compaction/branch summaries, and incremental AutoCLM records. Input includes ordinary input plus cache reads/writes. All main-session entries are counted, including restored history and branches; cumulative AutoCLM summaries are not counted again. Subagent tokens contribute to Overview, attributed to their parent project; subagent sessions do not increase the chat count.

Forks/exports carry small origin manifests so copied entries retain their original session/project. Missing legacy parent files and older sessions without activity/provenance records are reported as limited coverage. Skill activation means an actual read of a loaded SKILL.md; plugin ownership comes from discovered manifests/tool registrations. Historical metadata is not inferred from today's configuration.

Reading runs in a worker and does not migrate or rewrite session files. Only statistics/identity metadata is retained in a rebuildable private cache. Message text, prompts, tool arguments, credentials and errors are not copied to that cache. Append-only prefixes are verified, incomplete tails wait for the next scan, corrupt caches rebuild, and concurrent commits compare source identity/prefix under a short lock.

Limits are explicit: 10,000 files, 25,000 selected records, 16 MiB per source line, depth 64, 200,000 JSON tokens, 256 KiB retained metadata per line, 4 KiB per retained string, 1 second per parse and 30 seconds per scan. Budget-limited/invalid records produce coverage notices. Node additionally limits worker heap; the same parser budgets apply in Bun. A process crash can leave a cache lock until its 5-second stale threshold; it does not affect source sessions.

## Account

Account queries the personal Step Plan usage endpoint with the stored CN/Global Plan credential. Model/gateway keys supplied by `STEP_API_KEY` or `--api-key`, platform profiles and unknown profiles do not query that endpoint. Redirects are rejected. Keys stay in the controller, outside renderer/output data.

CODING plans show 5-hour and weekly percentages **used** and reset times. Nonpositive upstream limits mean Unlimited. TOKEN plans show subscription/top-up Credit buckets and reset/expiry times. Credit quantities stay decimal strings/BigInt throughout rendering. Unknown future bucket types are marked unsupported; partial bucket errors are not displayed as zero balance.

The current main-session summary is local and includes restored/inherited history and incremental compression usage. It excludes separate child-session files. Cache hit is cache reads divided by complete input; an empty denominator is Unknown.

Account responses have a 30-second memory cache and a 5-minute display lifetime. Identity/profile/endpoint/key changes invalidate it. Requests are single-flight, time out after 12 seconds and are cancelled when the panel closes or changes tabs/sessions. Attempt generations reject late responses. TTL/cooldown use a monotonic clock; HTTP Retry-After supports seconds and HTTP-date. Visible temporary failures retain a stale snapshot; 401/403 clear the snapshot without deleting credentials. No background polling runs.

## Status and controls

`/status` reads the live local model, provider, reasoning, directory, permissions, loaded AGENTS.md files, account metadata, collaboration mode and session identity. It shows cached quota **remaining**; it never triggers an account request. `D` expands local diagnostic details. Credential presence is not a claim of online validity.

`1`/`2` or arrows switch Usage tabs, `R` refreshes Account, arrows/PageUp/PageDown scroll, and Esc closes. The panel owns its overlay handle so closing it does not pop an approval overlay.

RPC command output uses `extension_ui_request` notifications. Other noninteractive CLI modes use stderr, keeping protocol stdout clear. SDK embedders can use `PlanUsageController`, `scanUsageOverview`, `collectSessionUsage` and the exported presentation types; a custom command host supplies its own presenter/output sink.

## Release verification

Node packages emit `activity-worker.js` beside the chunk that creates it. Bun standalone builds explicitly embed `activity-worker.ts`; release archives still need the existing theme/assets. Test workers from a directory outside the checkout.

The backend must provide schema 1 at `GET /step_plan/v1/usage` before Account is available. A 404 explains that the endpoint is not deployed. Overview and Status remain local. Platform bill amounts, organization Credit and cross-device activity history are outside this feature.
