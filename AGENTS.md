# Agent Guide for qwen-code

This file is for coding agents working in this repository. It summarizes the
expected commands and style rules derived from the codebase configuration.

## Quick facts

- Runtime: Node.js >= 20 (see root package.json).
- Language: TypeScript (strict mode) across packages.
- Monorepo: npm workspaces under `packages/*`.
- Primary build output: `dist/` and `bundle/`.

## Repo layout (high level)

- `packages/cli`: main CLI implementation.
- `packages/core`: shared core logic.
- `packages/sdk-typescript`: SDK for external consumers.
- `packages/vscode-ide-companion`: VS Code integration.
- `integration-tests`: vitest-driven integration tests.
- `docs-site`: documentation site (relaxed lint rules).

## Build commands

Run from repo root unless noted.

- `npm run build`: build packages (via scripts/build.js).
- `npm run build:packages`: build all workspaces.
- `npm run build:all`: build, build sandbox, build VS Code companion.
- `npm run build:sandbox`: build container sandbox image assets.
- `npm run build:vscode`: build VS Code companion extension.
- `npm run bundle`: generate git info + esbuild bundle + copy assets.

## Lint and format commands

- `npm run lint`: eslint on repo + integration tests.
- `npm run lint:fix`: eslint with fixes.
- `npm run lint:ci`: eslint with max warnings 0.
- `npm run lint:all`: lint via scripts/lint.js (full sweep).
- `npm run format`: prettier write across repo.

## Type checking

- `npm run typecheck`: run `tsc --noEmit` across workspaces.

## Test commands

- `npm run test`: run each workspace test (vitest).
- `npm run test:ci`: workspace tests + scripts tests.
- `npm run test:scripts`: vitest for scripts in `scripts/tests`.
- `npm run test:integration:sandbox:none`: integration tests (no sandbox).
- `npm run test:integration:sandbox:docker`: integration tests + docker sandbox.
- `npm run test:integration:sandbox:podman`: integration tests + podman sandbox.
- `npm run test:integration:sdk:sandbox:none`: integration tests for SDK only.
- `npm run test:integration:cli:sandbox:none`: integration tests excluding SDK.
- `npm run test:terminal-bench`: terminal-bench suite.

## Running a single test (vitest)

Vitest is the test runner. You can pass extra args after `--`.

- Run one test file (workspace):
  - `npm run test --workspace=packages/cli -- path/to/file.test.ts`
- Run one test by name (workspace):
  - `npm run test --workspace=packages/cli -- -t "test name"`
- Run one test file (root integration tests):
  - `npm run test:integration:sandbox:none -- path/to/test.test.ts`
- Run one test by name (integration tests):
  - `npm run test:integration:sandbox:none -- -t "test name"`
- Scripts tests:
  - `npm run test:scripts -- -t "test name"`

## Formatting rules (Prettier)

Configured in `.prettierrc.json`:

- Semicolons required.
- Single quotes.
- Trailing commas always.
- Print width 80.
- Tab width 2.

## ESLint rules (key expectations)

Global config: `eslint.config.js` (flat config).

- ES module imports only; do not use `require()`.
- No default exports (warned in CLI package).
- No `any` (`@typescript-eslint/no-explicit-any`).
- Prefer `const`, no `var`, one variable per declaration.
- Use `as` for type assertions.
- Use `Array<T>` only for complex types; prefer `T[]` (array-simple).
- `eqeqeq` enforced (null allowed for `== null` checks).
- No unused vars; prefix intentionally unused with `_`.
- No string throws; throw `Error` objects (see restricted syntax rule).
- `import/no-internal-modules` is enforced with an allow list.
- No relative package imports (`import/no-relative-packages`).
- React: `prop-types` disabled; JSX runtime enabled.

## TypeScript settings (tsconfig.json)

- `strict: true` with `noImplicitAny`, `noImplicitReturns`, and
  `noUnusedLocals` enabled.
- `noImplicitOverride` and `noPropertyAccessFromIndexSignature` are on.
- ES2023 libs, `moduleResolution: nodenext`, `module: NodeNext`.
- `verbatimModuleSyntax: true` (keep import/export structure intact).
- `jsx: react-jsx`.

## Imports

- Use ES module syntax only (`import` / `export`).
- Prefer type-only imports when possible (eslint enforces consistency).
- Avoid deep internal imports except those in the allow list
  (e.g., `react-dom/test-utils`, `msw/node`, `**/generated/**`).
- In `packages/cli`, default exports are discouraged.

## Naming conventions

- Files: `kebab-case` for folders and non-React files; `PascalCase` for React
  component files when that is already the convention in a folder.
- Types/interfaces/classes: `PascalCase`.
- Variables/functions: `camelCase`.
- Constants: `UPPER_SNAKE_CASE` for true constants, otherwise `camelCase`.
- Test files: `*.test.ts` or `*.test.tsx`.

## Error handling

- Throw `Error` objects with clear messages. Do not throw strings or literals.
- Use early returns for guard clauses; avoid nested conditionals when possible.
- Include context in error messages (module or operation name).

## Code structure and style

- Prefer small, focused modules with explicit exports.
- Use `const` for bindings; only use `let` when reassignment is required.
- Avoid unused code paths; remove unused imports/vars.
- Keep async flows explicit; use `await` rather than raw promises in logic.
- Favor pure functions where practical; isolate side effects.

## React-specific guidance

- Use function components and hooks.
- Prefer `useMemo`/`useCallback` only when there is a real performance need.
- Keep UI components stateless unless they manage UI-only state.

## Testing guidance

- Use `vitest` and `@testing-library` for UI.
- Structure tests with clear arrange/act/assert sections.
- Avoid shared mutable state between tests.
- Use `describe` blocks for grouping by feature or module.

## Pre-commit and lint-staged

- `npm run pre-commit` runs repo checks.
- lint-staged runs `prettier --write` and `eslint --fix` for staged files.

## Cursor / Copilot rules

- No `.cursor/rules`, `.cursorrules`, or `.github/copilot-instructions.md`
  were found in this repository at the time of writing.

## Practical workflow

1. Install deps: `npm ci` (or `npm install`).
2. Make changes in `packages/*`.
3. Run `npm run format` and `npm run lint`.
4. Run targeted tests (single test or workspace).
5. Run `npm run typecheck` if changes affect types.

## Notes for agents

- Do not edit generated output in `dist/` or `bundle/`.
- Prefer workspace scripts when working in a specific package.
- Avoid committing lockfile changes unless the task requires dependency changes.
