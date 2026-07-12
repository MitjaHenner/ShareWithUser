# Conventions

## Conventional Commits & Semantic Versioning

All changes to this repository MUST follow the [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification. Versioning MUST strictly adhere to [Semantic Versioning 2.0.0](https://semver.org/).

### Commit Message Format
`<type>(<scope>): <description>` (Space after colon is MANDATORY)

### Types & Version Bumps
- `feat`: Minor (x.Y.z) - New feature
- `fix`: Patch (x.y.Z) - Bug fix
- `perf`: Patch (x.y.Z) - Performance improvement
- `docs`, `chore`, `style`, `refactor`, `test`: No bump (unless breaking)
- `BREAKING CHANGE:` (or `!` after type): Major (X.y.z)

## Git Operations

- No direct work on `main` or `master`. Every task MUST start with a feature branch.
- `git push origin <feature-branch>` is allowed for backup or CI; never push directly to `main`/`master`.
- **Git Attribution:** NEVER include `Co-authored-by`, `Co-Authored-By`, or any other footer that attributes code to an AI agent. All commits must appear as if they were authored solely by the human user.

## Agent Workflow Mandates

**AGENTS MUST NEVER BYPASS THE BIGPOWERS WORKFLOW.**
You are operating within the `bigpowers` spec-driven development methodology.
- **No Direct Coding:** When a user issues a directive like "build feature X", you MUST NOT execute the request by writing code directly.
- **Required Skills:** You MUST route all work through the appropriate bigpowers skills.
  - Start with `survey-context` if you lack context.
  - Use `plan-work` to flesh out tasks in `specs/epics/` before writing any feature code.
  - Use `develop-tdd` or `execute-plan` to implement the plan.
  - Use `investigate-bug` for bug reports before writing a fix.
- **Verification Mandate:** Every story implementation MUST end with verification. Wait for user confirmation before declaring done.
- **Traceability Mandate:** Every story MUST have at least one `// story: eNNsNN` tag in its implementing code or test file.
- **Stream Continuity:** When writing large files, output continuously in chunks of ~200 lines. Do not pause between sections.

## Always Green / Shift Left

Solo developers own the whole codebase. **Always Green** means Preflight is green before any forward work.

**Shift Left (1-10-100):** Defects cost roughly 1x to fix in development, 10x in integration, 100x in production. Fixing a red gate now is cheaper than shipping and debugging later.

**Preflight** — `dotnet test && dotnet build`. Preflight MUST pass before kickoff, develop, or verify phases advance.

## Discovered Defects

Any **reproducible gate failure** encountered during unrelated work is a discovered defect.

**fix-or-log ladder (mandatory):**

1. **quick-fix** — trivial, data-only, or single-file fixes within guardrails.
2. **fix-bug** — when quick-fix guardrails abort, or the failure needs investigation (`specs/bugs/BUG-*.md` + TDD).
3. **Log** — only when reproduction is blocked after good-faith attempt; write a BUG spec and stop forward work.

Discovered fixes ship in the **same PR** but in **separate commits** (Conventional Commits).

**Banned dismissive phrases:**

| Banned phrase | Required behavior instead |
|---------------|---------------------------|
| Pre-existing / pre-existing issues | Run fix-or-log; prove with a passing repro after revert |
| unrelated to this session | Same — session boundaries do not waive green gates |
| not introduced by my changes | Bisect or fix anyway; solo-default owns the whole tree |
| out of scope (ignoring a red gate) | Invoke quick-fix or fix-bug |

## specs/ — All Planning Output Goes Here

Every skill that produces written output writes to `specs/` at the project root.

### Key files

| Layer | File | Answers |
|-------|------|---------|
| Session | `specs/state.yaml` | Active flow, epic/bug, step, handoff |
| Release index | `specs/release-plan.yaml` | Target version, WSJF epic list, BCP baseline |
| Progress | `specs/execution-status.yaml` | Flat status keys — sole SoT for story state |
| Scope | `specs/product/SCOPE_LATEST.yaml` | In/out of scope |
| Vision | `specs/product/VISION_LATEST.yaml` | North star / initiative |
| Glossary | `specs/product/GLOSSARY_LATEST.yaml` | Canonical domain terms |
| Epic tasks | `specs/epics/eNN-*.yaml` | Implementation tasks + verify |

## Code Style

- Functions: 4–20 lines. Split if longer.
- Files: under 300 lines. Split by responsibility.
- One thing per method, one responsibility per class (SRP).
- Names: specific and unique. Prefer names whose grep returns < 5 hits.
- Types: explicit. No `dynamic` where a typed alternative exists.
- No code duplication. Extract shared logic.
- Early returns over nested ifs. Max 2 levels of indentation.
- Follow default C# naming conventions (PascalCase public, camelCase private).
- Boy Scout Rule: leave every file you touch at least as clean as you found it.
- SOLID: favor interfaces over concrete types (DIP) when injecting dependencies.

## Comments

- Keep your own comments. Never strip them on refactor.
- Write WHY, not WHAT.
- No obvious comments that restate the code.
- No commented-out code — use git history to recover.

## Tests

- Tests run headless: `dotnet test`.
- Every new function gets a test. Every bug fix gets a regression test.
- Tests are **F**ast, **I**ndependent, **R**epeatable, **S**elf-Validating, **T**imely.
- Never skip a test without an explicit note explaining what is unresolved.
- Test boundary conditions: empty input, maximum, minimum, off-by-one.
- Test through public interfaces only — assert on observable outcomes.

## Dependencies

- Inject dependencies through constructor, not static/singletons.
- Wrap Jellyfin services behind thin project-owned interfaces where appropriate.

## Structure

- Follow Jellyfin plugin SDK conventions.
- Predictable paths: `Models/`, `Services/`, `Api/`, `Tests/`.
- Prefer small focused classes over god files.

## Logging

- Use Jellyfin's logging framework (`ISystemLog`).
- Structured logging for debugging / observability.

## Defensive Code

- **Timeout** — bound long-running operations (e.g., media scanning, network calls)
- **Graceful degradation** — fallback when Jellyfin services or dependencies are unavailable

The agent implements defensive code only for categories explicitly listed here.
