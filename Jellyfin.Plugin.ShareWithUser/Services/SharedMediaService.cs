using System;
using System.Collections.Generic;
using System.Linq;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Querying;

namespace Jellyfin.Plugin.ShareWithUser.Services;

/// <summary>
/// Queries media items shared with users via tags.
/// </summary>
public sealed class SharedMediaService
{
    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;

    /// <summary>
    /// Initializes a new instance of the <see cref="SharedMediaService"/> class.
    /// </summary>
    /// <param name="libraryManager">Library manager instance.</param>
    /// <param name="userManager">User manager instance.</param>
    public SharedMediaService(ILibraryManager libraryManager, IUserManager userManager)
    {
        _libraryManager = libraryManager;
        _userManager = userManager;
    }

    /// <summary>
    /// Gets all media items shared with each user (by username tag).
    /// When a parent item (e.g. Series) is tagged, children (Seasons/Episodes) are excluded
    /// to avoid redundant listings.
    /// </summary>
    /// <param name="excludeUsername">Username to exclude from results (typically the current user).</param>
    /// <returns>A list of username-to-items mappings.</returns>
    public IReadOnlyList<UserSharedMedia> GetSharedMedia(string? excludeUsername = null)
    {
        var users = _userManager.GetUsers();
        var results = new List<UserSharedMedia>();

        foreach (var user in users)
        {
            if (string.Equals(user.Username, excludeUsername, StringComparison.Ordinal))
            {
                continue;
            }

            var items = GetItemsByTag(user.Username);
            results.Add(new UserSharedMedia(user.Id, user.Username, items));
        }

        return results
            .OrderBy(u => u.Items.Count == 0 ? 1 : 0)
            .ThenBy(u => u.Username, StringComparer.Ordinal)
            .ToArray();
    }

    /// <summary>
    /// Gets media items tagged with the specified tag, excluding children
    /// when their parent is also tagged.
    /// </summary>
    /// <param name="tag">The tag to search for (e.g. a username).</param>
    /// <returns>List of shared media items.</returns>
    public IReadOnlyList<SharedMediaItem> GetItemsByTag(string tag)
    {
        var query = new InternalItemsQuery
        {
            Tags = [tag],
            Recursive = true,
            EnableTotalRecordCount = false,
            DtoOptions = new DtoOptions(false),
        };

        QueryResult<BaseItem>? queryResult = null;

        try
        {
            queryResult = _libraryManager.GetItemsResult(query);
        }
        catch (Exception)
        {
            return Array.Empty<SharedMediaItem>();
        }

        if (queryResult?.Items is null || queryResult.Items.Count == 0)
        {
            return Array.Empty<SharedMediaItem>();
        }

        // Jellyfin tag queries are case-insensitive. Post-filter to only include
        // items where the tag exactly matches the username (case-sensitive).
        var exactMatchItems = queryResult.Items.Where(item =>
            item.Tags?.Any(t => string.Equals(t, tag, StringComparison.Ordinal)) == true)
            .ToList();

        if (exactMatchItems.Count == 0)
        {
            return Array.Empty<SharedMediaItem>();
        }

        // Build a lookup of tagged item IDs and their parent IDs.
        // When a Series is tagged, its Seasons and Episodes are also returned
        // (tags are inherited). We exclude any item whose ancestor is also tagged.
        var taggedItems = exactMatchItems;
        var taggedIds = taggedItems.Select(i => i.Id).ToHashSet();
        var parentMap = taggedItems.ToDictionary(i => i.Id, i => i.ParentId);

        return taggedItems
            .Where(item => !HasTaggedAncestor(item.Id, taggedIds, parentMap))
            .Select(item =>
            {
                var kind = item.GetBaseItemKind();
                var (displayName, icon) = GetTypeInfo(kind);
                return new SharedMediaItem(
                    Id: item.Id,
                    Name: item.Name,
                    Type: kind,
                    TypeDisplayName: displayName,
                    Icon: icon);
            })
            .OrderBy(i => i.TypeDisplayName)
            .ThenBy(i => i.Name)
            .ToArray();
    }

    private static bool HasTaggedAncestor(Guid itemId, HashSet<Guid> taggedIds, Dictionary<Guid, Guid> parentMap)
    {
        var current = itemId;

        while (parentMap.TryGetValue(current, out var parentId) && parentId != Guid.Empty)
        {
            if (taggedIds.Contains(parentId))
            {
                return true;
            }

            current = parentId;
        }

        return false;
    }

    private static (string DisplayName, string Icon) GetTypeInfo(BaseItemKind kind)
    {
        return kind switch
        {
            BaseItemKind.Movie => ("Movie", "movie"),
            BaseItemKind.Series => ("Series", "tv"),
            BaseItemKind.Episode => ("Episode", "tv"),
            BaseItemKind.Season => ("Season", "video_library"),
            BaseItemKind.Video => ("Video", "video_file"),
            BaseItemKind.MusicVideo => ("Music Video", "music_video"),
            BaseItemKind.BoxSet => ("Box Set", "video_library"),
            BaseItemKind.Playlist => ("Playlist", "queue"),
            _ => (kind.ToString(), "video_library")
        };
    }
}
