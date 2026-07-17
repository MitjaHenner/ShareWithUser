using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.ShareWithUser.Services;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.ShareWithUser.Api;

/// <summary>
/// Share actions exposed to the web UI.
/// </summary>
[ApiController]
[Authorize]
[Route("Plugins/ShareWithUser")]
public class ShareController : ControllerBase
{
    private readonly ILibraryManager _libraryManager;
    private readonly SharedMediaService _sharedMediaService;

    /// <summary>
    /// Initializes a new instance of the <see cref="ShareController"/> class.
    /// </summary>
    /// <param name="libraryManager">Library manager instance.</param>
    /// <param name="sharedMediaService">Shared media service instance.</param>
    public ShareController(ILibraryManager libraryManager, SharedMediaService sharedMediaService)
    {
        _libraryManager = libraryManager;
        _sharedMediaService = sharedMediaService;
    }

    /// <summary>
    /// Updates share tags on a media item. Admin only (enforced by Jellyfin auth middleware).
    /// </summary>
    /// <param name="request">The share tags request.</param>
    /// <returns>NoContent on success, NotFound if item does not exist.</returns>
    /// <response code="204">Tags updated.</response>
    /// <response code="404">Item not found.</response>
    [HttpPost("ShareTags")]
    public async Task<ActionResult> UpdateShareTags([FromBody] ShareTagsRequest request)
    {
        Plugin.Instance?.EnsureScriptRegistered();

        var item = _libraryManager.GetItemById(request.ItemId);
        if (item is null)
        {
            return NotFound();
        }

        var newTags = request.Tags?.Select(t => t.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray()
                      ?? Array.Empty<string>();
        item.Tags = newTags;

        item.OnMetadataChanged();
        await item.UpdateToRepositoryAsync(ItemUpdateType.MetadataEdit, CancellationToken.None).ConfigureAwait(false);

        return NoContent();
    }

    /// <summary>
    /// Gets all media items shared with each user (by username tag).
    /// When a parent item (e.g. Series) is tagged, children are excluded.
    /// Excludes the currently logged-in user from the results.
    /// </summary>
    /// <returns>Mapping of usernames to their shared media items.</returns>
    [HttpGet("SharedMedia")]
    public ActionResult<IReadOnlyList<UserSharedMedia>> GetSharedMedia()
    {
        Plugin.Instance?.EnsureScriptRegistered();

        var currentUsername = User?.Identity?.Name;
        return Ok(_sharedMediaService.GetSharedMedia(currentUsername));
    }
}
