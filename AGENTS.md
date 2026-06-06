# AGENTS Guide for qwen-code

This guide is for autonomous/agentic coding tools working in this repository.
It captures practical commands and coding rules from project configuration.

## Quick facts

- Node.js: `>=20`.
- Package manager: `npm` (workspace repo).
- Language: strict TypeScript across packages.
- Workspaces: `packages/*` and `mcp/*`.
- Main generated outputs: `dist/`, `bundle/`, `package/bundle/` (do not edit).

## Repository map

- `packages/cli`: main CLI app.
- `packages/core`: shared runtime/core logic.
- `packages/sdk-typescript`: public TypeScript SDK.
- `packages/vscode-ide-companion`: VS Code integration.
- `packages/webui`: UI components/web surfaces.
- `integration-tests`: integration and terminal bench tests.
- `scripts`: build/lint/release helper scripts + tests.

## Build commands (root)

- `npm run build`: primary build via `scripts/build.js`.
- `npm run build:packages`: build all workspaces.
- `npm run build:sandbox`: build sandbox assets.
- `npm run build:vscode`: build VS Code companion.
- `npm run build:all`: build + sandbox + VS Code.
- `npm run bundle`: generate metadata + esbuild + copy bundle assets.

## Lint, format, typecheck

- `npm run lint`: eslint for repo + integration tests.
- `npm run lint:fix`: same with autofix.
- `npm run lint:ci`: lint with `--max-warnings 0`.
- `npm run lint:all`: full lint sweep via script.
- `npm run format`: prettier write across repo.
- `npm run typecheck`: typecheck all workspaces (`tsc --noEmit` via scripts).

## Test commands

- `npm run test`: run workspace tests in parallel.
- `npm run test:ci`: workspace tests + scripts tests.
- `npm run test:scripts`: tests in `scripts/tests`.
- `npm run test:integration:sandbox:none`: integration tests (no sandbox).
- `npm run test:integration:sandbox:docker`: integration tests with docker sandbox.
- `npm run test:integration:sandbox:podman`: integration tests with podman sandbox.
- `npm run test:integration:sdk:sandbox:none`: integration tests for SDK subset.
- `npm run test:integration:cli:sandbox:none`: integration tests excluding SDK.
- `npm run test:terminal-bench`: terminal benchmark suite.
- `npm run test:terminal-bench:oracle`: terminal bench filtered by `oracle`.
- `npm run test:terminal-bench:qwen`: terminal bench filtered by `qwen`.

## Running a single test (important)

Vitest args pass through after `--`.

- Single test file in a workspace:
  - `npm run test --workspace=packages/cli -- src/path/to/file.test.ts`
- Single test name in a workspace:
  - `npm run test --workspace=packages/cli -- -t "name of test"`
- Single integration test file:
  - `npm run test:integration:sandbox:none -- path/to/test.test.ts`
- Single integration test by name:
  - `npm run test:integration:sandbox:none -- -t "name of test"`
- Single scripts test by name:
  - `npm run test:scripts -- -t "name of test"`

## Pre-commit and safety checks

- `npm run pre-commit`: repository pre-commit checks.
- `lint-staged` runs:
  - `prettier --write` on staged supported files.
  - `eslint --fix --max-warnings 0` on staged JS/TS files.

## Formatting rules (Prettier)

From `.prettierrc.json`:

- `semi: true`.
- `singleQuote: true`.
- `trailingComma: "all"`.
- `printWidth: 80`.
- `tabWidth: 2`.

## TypeScript rules (tsconfig)

- `strict: true` and `noImplicitAny: true`.
- `noImplicitReturns`, `noImplicitOverride`, `noUnusedLocals` enabled.
- `noPropertyAccessFromIndexSignature: true`.
- `module: "NodeNext"`, `moduleResolution: "nodenext"`.
- `target: "es2022"`, `lib: ["ES2023"]`.
- `verbatimModuleSyntax: true`.
- JSX mode: `react-jsx`.

## Import and module conventions

- Use ESM imports/exports only.
- Prefer `import type` for type-only imports.
- Do not use `require()` in TS/TSX code.
- Avoid relative package imports (`import/no-relative-packages`).
- Avoid deep internal imports except existing allowlisted paths.
- In `packages/cli`, prefer named exports; default export is discouraged.

## ESLint expectations (high signal subset)

- No explicit `any`.
- Use `as` style assertions when needed.
- Prefer `T[]` over `Array<T>` for simple array types.
- Enforce strict equality (`eqeqeq`), with `== null` exception.
- Prefer `const`; never use `var`; one declaration per statement.
- Prefix intentionally unused variables/args with `_`.
- Do not throw strings; throw `new Error('message')`.
- Prefer object shorthand and arrow callbacks.
- `no-console` is generally on, with package/file allowlists.

## Naming conventions

- Files/folders: `kebab-case` (except React component files where applicable).
- React component files: `PascalCase` in component-oriented folders.
- Types/interfaces/classes/enums: `PascalCase`.
- Variables/functions/methods: `camelCase`.
- True constants: `UPPER_SNAKE_CASE`.
- Tests: `*.test.ts` / `*.test.tsx`.

## Error handling and control flow

- Throw `Error` instances with actionable messages.
- Include operation context in error text (what failed and where).
- Favor early returns and guard clauses over deep nesting.
- Keep async logic explicit; avoid hidden Promise chains where clarity suffers.

## Code structure guidance

- Keep modules focused and composable.
- Prefer pure helpers; isolate side effects in thin boundaries.
- Keep public exports explicit.
- Do not edit generated outputs (`dist`, `bundle`, generated assets) directly.

## Testing guidance

- Framework: Vitest (and `@testing-library` for UI behavior).
- Use clear arrange/act/assert structure.
- Minimize shared mutable test state.
- Prefer targeted tests first, then broader suite if needed.

## Agent workflow checklist

1. Read relevant files and nearby tests before editing.
2. Make minimal, scoped changes consistent with existing style.
3. Run targeted tests for changed area.
4. Run `npm run lint` and `npm run typecheck` for broad changes.

## Cursor and Copilot policy files

- Checked paths:
  - `.cursor/rules/`
  - `.cursorrules`
  - `.github/copilot-instructions.md`
- Current status: none of the above files exist in this repository.
