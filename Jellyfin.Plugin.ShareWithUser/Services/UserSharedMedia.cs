using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.ShareWithUser.Services;

/// <summary>
/// Maps a username to their shared media items.
/// </summary>
/// <param name="UserId">The user's unique identifier.</param>
/// <param name="Username">The user's username.</param>
/// <param name="Items">List of media items shared with this user.</param>
public record UserSharedMedia(
    Guid UserId,
    string Username,
    IReadOnlyList<SharedMediaItem> Items);
