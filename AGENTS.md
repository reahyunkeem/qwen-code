# Agent Guide for qwen-code

This file is for coding agents working in this repository. It summarizes the
expected commands and style rules derived from the codebase configuration.

## Quick facts

- Runtime: Node.js >= 20 (see `package.json`).
- Language: TypeScript (strict) across workspaces.
- Monorepo: npm workspaces under `packages/*`.
- Primary build output: `dist/` and `bundle/` (do not edit directly).

## Repo layout (high level)

- `packages/cli`: main CLI implementation.
- `packages/core`: shared core logic.
- `packages/sdk-typescript`: SDK for external consumers.
- `packages/vscode-ide-companion`: VS Code integration.
- `integration-tests`: vitest-driven integration tests.
- `docs-site`: documentation site (relaxed lint rules).

## Build commands (repo root)

- `npm run build`: build packages (scripts/build.js).
- `npm run build:packages`: build all workspaces.
- `npm run build:all`: build + sandbox + VS Code companion.
- `npm run build:sandbox`: build sandbox image assets.
- `npm run build:vscode`: build VS Code companion extension.
- `npm run bundle`: generate git info + esbuild bundle + copy assets.

## Lint, format, typecheck

- `npm run lint`: eslint on repo + integration tests.
- `npm run lint:fix`: eslint with fixes.
- `npm run lint:ci`: eslint with max warnings 0.
- `npm run lint:all`: lint via scripts/lint.js (full sweep).
- `npm run format`: prettier write across repo.
- `npm run typecheck`: `tsc --noEmit` across workspaces.

## Tests (vitest)

- `npm run test`: run each workspace test (parallel, if present).
- `npm run test:ci`: workspace tests + scripts tests.
- `npm run test:scripts`: vitest for `scripts/tests`.
- `npm run test:integration:sandbox:none`: integration tests (no sandbox).
- `npm run test:integration:sandbox:docker`: integration tests + docker sandbox.
- `npm run test:integration:sandbox:podman`: integration tests + podman sandbox.
- `npm run test:integration:sdk:sandbox:none`: integration tests for SDK only.
- `npm run test:integration:cli:sandbox:none`: integration tests excluding SDK.
- `npm run test:terminal-bench`: terminal-bench suite.
- `npm run test:terminal-bench:oracle`: terminal-bench oracle filter.
- `npm run test:terminal-bench:qwen`: terminal-bench qwen filter.

## Run a single test

Vitest accepts extra args after `--`.

- Workspace test file:
  - `npm run test --workspace=packages/cli -- path/to/file.test.ts`
- Workspace test name:
  - `npm run test --workspace=packages/cli -- -t "test name"`
- Integration test file:
  - `npm run test:integration:sandbox:none -- path/to/test.test.ts`
- Integration test name:
  - `npm run test:integration:sandbox:none -- -t "test name"`
- Scripts test name:
  - `npm run test:scripts -- -t "test name"`

## Formatting (Prettier)

Configured in `.prettierrc.json`:

- Semicolons required.
- Single quotes.
- Trailing commas always.
- Print width 80, tab width 2.

## TypeScript settings (tsconfig.json)

- `strict: true` with `noImplicitAny`, `noImplicitReturns`, `noUnusedLocals`.
- `noImplicitOverride` and `noPropertyAccessFromIndexSignature` enabled.
- `module: NodeNext`, `moduleResolution: nodenext`, `verbatimModuleSyntax: true`.
- ES2023 libs, target ES2022, `jsx: react-jsx`.

## Imports

- ES module syntax only (`import` / `export`).
- Prefer type-only imports when possible.
- No relative package imports (`import/no-relative-packages`).
- Avoid deep internal imports except allow list (e.g., `msw/node`,
  `react-dom/test-utils`, `**/generated/**`).
- In `packages/cli`, default exports are discouraged (`import/no-default-export`).

## ESLint expectations (high level)

- No `any` (`@typescript-eslint/no-explicit-any`).
- No `require()` (use ES imports).
- Use `as` for type assertions.
- Prefer `T[]` over `Array<T>` for simple types.
- `eqeqeq` enforced (allow `== null`).
- One var per declaration; prefer `const`, no `var`.
- No unused vars (prefix intentionally unused with `_`).
- No string throws; throw `new Error('message')`.
- Prefer arrow callbacks and object shorthand.
- React: `prop-types` disabled; JSX runtime enabled.

## Naming conventions

- Files: `kebab-case` for folders and non-React files.
- React components: `PascalCase` when that folder uses it.
- Types/interfaces/classes: `PascalCase`.
- Variables/functions: `camelCase`.
- Constants: `UPPER_SNAKE_CASE` for true constants.
- Tests: `*.test.ts` or `*.test.tsx`.

## Error handling

- Throw `Error` objects with clear context (module or operation).
- Use early returns for guard clauses; avoid deep nesting.

## Code structure

- Prefer small, focused modules with explicit exports.
- Keep async flows explicit; use `await` in logic.
- Favor pure functions; isolate side effects.

## Testing guidance

- Use `vitest` and `@testing-library` for UI.
- Clear arrange/act/assert sections.
- Avoid shared mutable state.

## Tooling hooks

- `npm run pre-commit` runs repo checks.
- lint-staged runs `prettier --write` and `eslint --fix --max-warnings 0`.

## Cursor / Copilot rules

- No `.cursor/rules`, `.cursorrules`, or `.github/copilot-instructions.md`
  found in this repository at the time of writing.

## Practical workflow

1. Install deps: `npm ci` (or `npm install`).
2. Make changes in `packages/*`.
3. Run `npm run format` and `npm run lint`.
4. Run targeted tests (single test or workspace).
5. Run `npm run typecheck` if changes affect types.
