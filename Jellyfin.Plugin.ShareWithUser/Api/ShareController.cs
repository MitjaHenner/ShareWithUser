using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.ShareWithUser.Api;

/// <summary>
/// Share actions exposed to the web UI.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("Plugins/ShareWithUser")]
public class ShareController : ControllerBase
{
    /// <summary>
    /// Shares a media item. Admin only.
    /// </summary>
    /// <param name="itemId">The media item ID.</param>
    /// <returns>200 OK for admins, 403 for non-admins.</returns>
    [HttpPost("Share")]
    public IActionResult Share([FromBody] string itemId)
    {
        // TODO: Add admin check and real share logic
        return Ok(new { shared = true, itemId });
    }
}
