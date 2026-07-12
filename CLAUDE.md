<!-- BEGIN bigpowers:project -->
# ShareWithUser — Claude Code

Read CONVENTIONS.md before any GitHub or git operation.

## Project
A Jellyfin plugin to share media with specific users.
Stack: C#, .NET 9, Jellyfin plugin

## Commands
| Action | Command |
|--------|---------|
| Run    | `dotnet build -c Release` then copy DLL to Jellyfin plugins folder |
| Test   | `dotnet test` |
| Build  | `dotnet build -c Release` |
| Lint   | `dotnet build` (warnings as errors via jellyfin.ruleset) |
| Preflight | `dotnet build -c Release` |
| CI     | `gh pr checks` (when a PR is open) |

## Architecture
A Jellyfin plugin with a sharing service, user permission mapper, and a web UI panel for managing shares.

## Conventions
- Default C# naming conventions (PascalCase for public members, camelCase for private)
- Follow Jellyfin plugin SDK patterns and conventions

## Never
- Never dismiss reproducible gate failures as pre-existing or out of scope
- Never proceed on red Preflight or red CI — invoke quick-fix or fix-bug first
- Never modify Jellyfin core code

## Agent Rules
- **Workflow Mandate:** You MUST use the bigpowers skills (e.g. `plan-work`, `develop-tdd`, `orchestrate-project`) to perform tasks. DO NOT write code directly in response to a user prompt like "build this feature".
- **Always Green:** Preflight and CI must be green before forward work. Reproducible gate failures require **fix-or-log** (quick-fix → fix-bug) per CONVENTIONS § Discovered Defects.
- Read specs/ before writing code.
- All planning and specifications MUST be written to `specs/` (`product/SCOPE_LATEST.yaml`, `release-plan.yaml`, `epics/`) before any code is generated.
- Write the minimum code that solves the stated problem. Nothing extra.
- Run tests after every change. Show evidence before declaring done.
- One clarifying question beats a wrong assumption baked into 200 lines.
<!-- END bigpowers:project -->

<!-- BEGIN bigpowers:learned-preferences -->
## Learned User Preferences
- Always use forward slashes (`/`) or properly quoted paths for file commands on Windows — backslashes break `ls`, `bash`, and similar shell tools.

## Workspace Facts
<!-- END bigpowers:learned-preferences -->
