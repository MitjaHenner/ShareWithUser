# Share With User

A [Jellyfin](https://jellyfin.org) plugin that lets you share media items with specific users by tagging them with usernames.

## Features

- **Context menu integration** — right-click any media item to share it with users
- **Tag-based sharing** — shares are stored as standard Jellyfin tags, matching target usernames
- **Shared media dashboard** — view what's been shared with each user from the plugin settings page
- **Parent-aware queries** — when a parent item (e.g. a series) is tagged, children are excluded from results

## Requirements

- Jellyfin 10.11+
- [.NET 9.0 Runtime](https://dotnet.microsoft.com/download/dotnet/9.0)
- [JavaScript Injector plugin](https://github.com/nickdxa/JavaScript-Injector) (for context menu support)

## Installation

1. Download the latest release from the [releases page](https://github.com/MitjaHenner/ShareWithUser/releases)
2. Copy the DLL to your Jellyfin plugins folder
3. Restart Jellyfin
4. Enable the plugin from Dashboard > Plugins > Share With User

## Usage

### Prerequisites

For each user you want to share media with, add their **exact username as an allowed tag** in Jellyfin's parental control settings:

1. Navigate to **Dashboard > Networking > Parental Control**
2. Under **Allowed tags**, add the username (case-sensitive)
3. Repeat for each user

Without this step, the plugin cannot apply username tags to media items.

### Sharing media

Right-click any media item in the Jellyfin web UI and select "Share with user" to add username tags. Items tagged with a username will appear in that user's shared media list.

### Viewing shared media

Navigate to Dashboard > Plugins > Share With User to see all shared media grouped by user.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/Plugins/ShareWithUser/ShareTags` | Update share tags on a media item (admin only) |
| `GET`  | `/Plugins/ShareWithUser/SharedMedia` | Get all shared media grouped by user |

## License

GPL-3.0 — see [LICENSE](LICENSE)
