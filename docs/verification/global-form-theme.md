# Global form theme verification

Implementation for `.scratch/form-themes/issues/02-global-theme-inheritance.md`, checked on 2026-10-15.

## Behavior

Super Admins can save or clear SurveyJS theme JSON in Settings. JSON syntax errors are reported before writing; a database constraint validates the installed SurveyJS 3.1.2 ITheme/IHeader shape, including CSS variable values, enums, and opacity ranges. Failed writes preserve the saved settings. Theme changes are audited.

The existing settings RLS and column write grants remain in place. An authenticated theme-only RPC delegates to a private, restricted definer function and exposes no other settings. Designer previews read this theme on page load. Starting customization clones the displayed appearance; inheritance continues to be represented by a null draft/version theme.

The service-only `load_form` boundary resolves the published custom theme, then today's global theme, then null (standard SurveyJS appearance). It does not merge themes or change drafts or versions. Existing publish, restore, and discard operations preserve the custom/inherited choice.

## Verification

- Typecheck passed.
- Biome passed for all changed TypeScript/TSX files.
- Database permissions test passed after first failing before implementation.
- Version lifecycle test passed for dynamic inheritance, custom precedence, draft isolation, restore/discard, clearing, and unchanged inherited snapshots.
- Public load-handler and embed-load contract suites passed: 58 tests.
- Full suite outside the sandbox (`node node_modules/vitest/vitest.mjs run --maxWorkers=2`): 1,038 passed, 4 failed across 69 files. All four failures are unchanged `n8n-form-passes.test.ts` cases whose fixed expiry is now past, failing `form_passes_expires_at_check`; the same failures were documented for ticket 01. All changed feature suites passed. Earlier sandbox attempts encountered missing Vitest temporary module files and were not reliable full-suite results.
- Security advisor attempted against local Supabase, but no database is listening on port 54322. Migrations were exercised through migrated PGlite databases. No shared database or edge deployment was performed.

## Browser limitation

Browser acceptance remains unverified. A temporary local fixture using the real SettingsForm, DraftCreator, embed bundle, and migrated PGlite database started successfully. The in-app browser could not connect to loopback; the Windows computer-use capability then stopped because it could not determine the browser URL confidently. No visual acceptance claims are made. The fixture used HTTP adapters rather than authenticated Next Server Action transport.

Remaining acceptance: global JSON save/clear and errors, inherited preview, copying the displayed theme when starting customization, custom independence after later global changes, and published embed rendering. Run against a migrated environment before marking the ticket fully verified.

## Review

Standards: no documented breaches or actionable heuristic smells found.

Spec: no code correctness defects or scope creep found; browser acceptance is partially verified only through automated boundaries.
