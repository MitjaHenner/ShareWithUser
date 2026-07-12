### Story 1.2: Context Menu JS Injection — Implementation Steps

**type:** feat
**risk:** P1
**context:** domain

**Context**: Register a JavaScript snippet via the JavaScript Injector plugin that observes the Jellyfin context menu (action sheet) DOM and injects a "Share with User..." menu item. Clicking it calls the plugin's REST API.

## Requirements

#### ADDED: Context menu item injection
A JS snippet that watches for the action sheet DOM, injects a menu item, and calls the plugin's API on click. Visible only to admin users.

## Steps

1. Write JS snippet that uses MutationObserver to detect action sheet and inject menu item → verify: `dotnet build -c Release`
2. Embed JS as embedded resource and register via JavaScript Injector PluginInterface → verify: `dotnet build -c Release`
3. Add admin check in JS (read from page DOM or API) → verify: `dotnet build -c Release`

## Verification Script (Step-by-Step)

1. Build the plugin: `dotnet build -c Release`
2. Deploy to Jellyfin with JavaScript Injector installed
3. Right-click a media item as admin → see "Share with User..." in context menu
4. Right-click as non-admin → menu item absent

## Out of scope

- Share dialog / user selection UI (toast placeholder)
- Mobile app support

## Risks

- Action sheet DOM structure may change across Jellyfin versions
- JavaScript Injector not installed → no menu item (graceful degradation)
