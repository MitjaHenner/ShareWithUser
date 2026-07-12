### Story 1.1: Share API Endpoint — Implementation Steps

**type:** feat
**risk:** P1
**context:** domain

**Context**: Add a REST API endpoint that the injected JS can call to trigger a share action. This is the server-side half of the context menu integration. The endpoint accepts an item ID and returns success. Admin-only.

## Requirements

#### ADDED: Admin-only share endpoint
A POST endpoint at `/Plugins/ShareWithUser/Share` that accepts a JSON body with `itemId` and returns 200 OK for admin users, 403 for non-admins.

## Steps

1. Add `ShareController` with POST `/Plugins/ShareWithUser/Share` endpoint accepting `{ itemId: string }` → verify: `dotnet build -c Release`
2. Add admin check in the endpoint — return 403 if not admin → verify: `dotnet build -c Release`
3. Return 200 with `{ shared: true }` for admin users → verify: `dotnet build -c Release`

## Verification Script (Step-by-Step)

1. Build the plugin: `dotnet build -c Release`
2. Deploy to Jellyfin and restart
3. POST to `/Plugins/ShareWithUser/Share` with admin session cookie → expect 200
4. POST to `/Plugins/ShareWithUser/Share` with non-admin session → expect 403

## Out of scope

- Actual share logic (placeholder — just returns success)
- Input validation beyond itemId presence

## Risks

- Jellyfin session cookie may need special handling for API calls from injected JS
- Endpoint path convention must match Jellyfin's plugin routing pattern
