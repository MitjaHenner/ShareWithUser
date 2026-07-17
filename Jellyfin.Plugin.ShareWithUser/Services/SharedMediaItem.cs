using System;
using Jellyfin.Data.Enums;

namespace Jellyfin.Plugin.ShareWithUser.Services;

/// <summary>
/// Represents a media item shared with a user.
/// </summary>
/// <param name="Id">The item's unique identifier.</param>
/// <param name="Name">The item's display name.</param>
/// <param name="Type">The item's base type.</param>
/// <param name="TypeDisplayName">Human-readable type name (for accessibility).</param>
/// <param name="Icon">Material Icons name for the item type.</param>
public record SharedMediaItem(
    Guid Id,
    string Name,
    BaseItemKind Type,
    string TypeDisplayName,
    string Icon);
