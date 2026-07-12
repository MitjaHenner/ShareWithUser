# BUG-001: Script not loading on refresh (intermittent)

**Severity:** Medium
**Status:** Known
**Reported:** 2025-07-12

## Description
On page refresh, the `context-menu.js` script sometimes fails to load entirely — no `[ShareWithUser]` messages appear in the browser console. On subsequent navigations (without refresh), the script loads fine.

## Reproduction
1. Hard refresh the Jellyfin web UI (Ctrl+Shift+R)
2. Open browser console
3. Look for `[ShareWithUser] Script loaded` message
4. ~50% of the time, no `[ShareWithUser]` messages appear at all

## Expected
The script should load on every page refresh and log `[ShareWithUser] Script loaded`.

## Observed
No `[ShareWithUser]` console output at all, meaning the script either:
- Wasn't injected by JavaScript Injector
- Threw an error before the first `console.log`
- Loaded before `console` was available

## Hypotheses
1. **Race condition with JavaScript Injector** — the script is registered before JavaScript Injector is fully initialized on cold start
2. **Script loads before `console` is ready** — the `console.log('[ShareWithUser] Script loaded')` throws silently
3. **Embedded resource not loaded** — the script content is null/empty on some plugin initializations
4. **Jellyfin script manager timing** — the script is queued but not executed before the page transitions

## Investigation Needed
- Check Jellyfin server logs for `[ShareWithUser]` or `JavaScriptRegistrationService` messages
- Add a `<script>` tag with inline error handling to detect load failures
- Check if `LoadEmbeddedScript()` returns null intermittently
- Verify JavaScript Injector is loaded before registration

## Workaround
Navigate away and back (e.g., Home → Movies → Home) instead of hard refresh.

## Related
- The `waitForGlobals()` retry mechanism was added to address timing issues, but the script may not even be reaching that point.
