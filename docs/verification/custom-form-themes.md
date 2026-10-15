# Custom form themes verification

Verified on 2026-10-15 for `.scratch/form-themes/issues/01-custom-form-themes.md` and its parent spec. Global theme settings and dynamic global inheritance belong to ticket 02.

## Implementation

A nullable draft theme and nullable version theme represent custom appearance versus inheritance. Theme-only saves use the existing authenticated, team-scoped draft boundary. Publishing, restore, and discard include the theme choice. The public loading boundary returns only the current version's theme; the embed and designer explicitly use SurveyJS Default Light when inheriting.

Theme writes are serialized in the designer, tracked before autosave starts, and included in the existing publish/reset blocking. Failed saves retain unsaved status and expose an independent error and retry action. Switching appearance choice refreshes an open Theme tab and disables its modification controls while inheriting.

## Automated checks

- Focused draft, publishing, version-history, public-load database, public handler, and embed-load suites: 132 tests passed.
- The strengthened independent-save and required public theme contract tests: 54 tests passed.
- Pre-existing-record upgrade test: passed. A draft and published version created before the theme migration inherit afterward; content and save stamps stay unchanged.
- Full suite (`node node_modules/vitest/vitest.mjs run --maxWorkers=2`): 1,021 passed, 5 failed, across 68 files. Four unchanged n8n form-pass tests use the fixed expiry `2026-10-10T12:00:00.000Z`, which is now past, and fail the existing expiry constraint. They reproduce in isolation. One teams/RLS `beforeEach` hook exceeded 10 seconds; the affected test passed in isolation.
- Typecheck: passed (`tsc --noEmit`).
- Biome: all 20 changed TypeScript/TSX files passed. The repository-wide check has pre-existing skill-file/configuration diagnostics.
- Embed production bundle: passed (`node --experimental-strip-types embed/build.mts`).
- Local Supabase security advisor attempted; unavailable because no local database is running on port 54322. No shared database migration or edge-function deployment was performed.

## Browser acceptance

Used the installed browser tooling with a temporary localhost fixture, the real DraftCreator, DraftStatus, PublishButton, DiscardButton, and embed bundle, and a freshly migrated PGlite database. The fixture replaced Next Server Action transport with local HTTP adapters to the same database operations. It was removed afterward; no browser-test framework was added. This verifies component behavior and SQL lifecycle together; it does not verify authenticated Next Server Action transport against the shared Supabase environment.

Observed:

- Opening the Theme tab retains inheritance and presents standard appearance with editing disabled.
- Choosing custom starts from the displayed standard appearance. Editing an accent color autosaves and survives designer reload.
- A delayed theme save disables publication until saved.
- A failed theme save leaves publication disabled, reports failure, and offers retry. Successful retry clears unsaved status.
- Draft custom edits and returning to inheritance do not change the published embed.
- Publishing a custom choice produces the same visible accent color in preview and embed.
- Publishing inheritance restores the standard embed appearance.
- Restoring the custom version refreshes the draft choice and preview; discarding returns to the current inherited choice.
- Republishing the restored custom version restores its appearance in the embed.

## Standards review

Parallel standards review found two presentation issues (visible label/description and error icon), both fixed. No remaining actionable findings or baseline smells.

## Spec review

Parallel spec review found no remaining actionable findings after the active Theme tab refresh and upgrade test were added.
