# Mobile unit and adapter tests

## Run

Use Node 24 and the pnpm version in package.json. Install with `pnpm install --frozen-lockfile`.
The lockfile includes expo-splash-screen; a missing local package should be restored by installation, not by changing its version.

| Command                                                                              | Scope                                                                   |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `pnpm test`                                                                          | All Node unit and adapter suites                                        |
| `pnpm test:unit`                                                                     | Logic, HTTP/auth, storage and mocked SDK boundaries                     |
| `pnpm test:adapter`                                                                  | SQLite queue, sync/runtime and package/file adapters                    |
| `node --import ./tests/support/register.mjs --test tests/unit/http-request.test.mjs` | One file                                                                |
| `pnpm test:coverage`                                                                 | All Node suites, LCOV and source inventory                              |
| `pnpm test:unit:coverage` / `pnpm test:adapter:coverage`                             | Coverage per group                                                      |
| `node tests/coverage.mjs unit adapter`                                               | Combine existing group line hits and inventory, without rerunning tests |
| `pnpm typecheck`                                                                     | App TypeScript check                                                    |
| `pnpm test:release`                                                                  | Existing release tooling checks                                         |
| `pnpm test:e2e`                                                                      | Existing Playwright web checks (requires Chrome)                        |

Each test file runs in an isolated Node process. Root suites remain discovered; new files belong in tests/unit or tests/adapter.
The existing playtest.test.mjs and package-cache.test.mjs are classified as adapter suites.
Node strips TypeScript and the test loader resolves app aliases and substitutes native SDKs.
Auth is normally replaced with a scripted backend; importing auth.ts?real selects the real session implementation for auth tests.
Tests must restore globals, fake storage, listeners and timers between cases.

## Behavior covered

| Area                                                                                                                 | Test entry points                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP request/response, concurrent refresh, restore, registration and Google roles                                    | tests/unit/http-_.test.mjs, auth-_.test.mjs, profile-update.test.mjs, avatar-api.test.mjs                                                                  |
| Training prepare/start, grant expiry, session continuation                                                           | tests/unit/training-*.test.mjs; tests/adapter/training-launch.test.mjs                                                                                     |
| Persist before ACK, transactional rollback, duplicates/conflicts, 500-event batches, completion replay and ownership | tests/adapter/queue-*.test.mjs                                                                                                                             |
| Lost responses, missing ranges, AwaitingSync, Abandoned recovery                                                     | tests/adapter/training-sync-*.test.mjs                                                                                                                     |
| Single-flight pump, lifecycle cleanup, heartbeat and backoff                                                         | tests/adapter/runtime-*.test.mjs                                                                                                                           |
| Signed URL refresh, cancellation, hash/file failures, cache/pin and capacity                                         | tests/adapter/package-*.test.mjs and tests/package-cache.test.mjs                                                                                          |
| Attempt/download storage and idempotency                                                                             | tests/unit/training-attempt-store.test.mjs, downloads-store-errors.test.mjs                                                                                |
| Playtest operation keys, handoff, recent account, grant retry, terminal recovery                                     | tests/unit/playtest-*.test.mjs, pending-handoff.test.mjs, recent-playtest.test.mjs; tests/adapter/playtest-sync-recovery.test.mjs; tests/playtest.test.mjs |
| Google/Firebase and device binding/revoke/token rotation                                                             | tests/unit/google-native.test.mjs, device-binding.test.mjs, device-revoke.test.mjs                                                                         |
| QR, participation, Learn/bookmarks, trainee AI, history, feedback and support                                        | tests/unit/*-api.test.mjs, qr-participation.test.mjs, learn-bookmarks.test.mjs                                                                             |
| Result wording, missing metrics and backend-authoritative scores                                                     | tests/result-presentation.test.mjs                                                                                                                         |
| Main release opt-out policy                                                                                          | tests/unit/release-policy.test.mjs                                                                                                                         |

SQLite suites execute real node:sqlite transactions behind the Expo adapter fake. They are adapter tests, not pure units.
Files, SecureStore/AsyncStorage, native Unity, Google/Firebase and notification services are fakes. No real backend or provider credentials are used.
These suites verify observable calls, persisted state, replay identities and recovery; they do not establish server authorization or real Android behavior.

## Coverage and limits

Artifacts live in ignored .codex/local/coverage: per-group lcov.info, summary.md and inventory.json.
CI uploads mobile-node-coverage. The summary unions line hits across the selected groups and inventories every .ts/.tsx source under src and app.
Only loaded source files contribute to the executable-line percentage. Unloaded modules are explicitly listed as Not loaded.
V8 measures stripped TypeScript; type declarations and loader behavior limit interpretation. Importing a module is not proof that all its behavior has tests.
There is no arbitrary whole-app percentage gate.

React screens, SessionProvider, navigation/rendering, hooks, real native SDKs, Android lifecycle and Unity gameplay need separate component/device/integration tests.
Keep the existing release and Playwright checks; Node tests do not replace them.

An unresolved production race exists: a refresh already in flight can persist a new session after logout has cleared it.
The regression reproduction is retained locally outside test discovery; it is not pushed as a failing test, skipped, or weakened to make CI green.
The auth logout/pending-request scope therefore remains incomplete until a separate production fix is authorized.

## Requirements dated 23/11

| Requirement                             | Current evidence and remaining dependency                                                                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FireSafetyExpert                        | Existing auth boundary rejects unsupported mobile roles without persisting them. No expert UI/onboarding is added.                                                     |
| Infrastructure, scenarios and appraisal | Tests retain release/manifest/runtime pins and backend response flags. Business permissions belong to BE and are not invented in Mobile fakes.                         |
| Objectives in every mode                | Existing supported modes and package policy are exercised. Objective contract and new gameplay behavior require BE/Unity and corresponding Mobile implementation.      |
| step_count and route_efficiency         | Result tests keep unavailable metrics neutral. Actual values, scoring and dedicated labels remain dependent on the agreed BE/Unity contract and Mobile implementation. |
| Visual logs/profile                     | Requires BE/FE contracts and implementation; the Node suites do not claim coverage.                                                                                    |

## Commit, review and release workflow

Create a task branch from the verified origin/develop after synchronizing the approved main changes.
Implement one coherent test file per commit, with any private fixture; shared helpers precede their consumers.
Run the file and related checks, format the touched paths, inspect git diff --check, stage exact paths, commit, push, and verify the remote SHA.
Keep an early draft PR into develop so every push gets CI. Fix already-pushed harness failures with new commits.
Do not amend published history, force-push, create empty commits or split meaningless changes.

If a test exposes a production defect, preserve its reproduction and expected/actual evidence locally, keep it out of the pushed green suites,
and continue independent work. Do not alter production, skip the regression, or change the expected behavior to hide it.
List every held-back file and dependency in the handoff.

Use merge commits for task branch → develop and then develop → main, preserving individual test commits.
Fetch and inspect the full diff before each merge; satisfy required reviews/checks, verify integration on the actual develop merge SHA,
and retain the task branch. Do not bypass protection.

For an approved code-only main merge, include `[skip-play-release]` in the main merge commit message.
The policy skips release planning, EAS build, Google Play submit and release-tag creation only for a push to main whose head message has that marker.
CI checks remain unconditional. Manual workflow_dispatch and unmarked pushes retain the existing release behavior.
Verify the actual main workflow shows checks successful and plan/build/submit skipped; a marker in a PR description alone is insufficient.
