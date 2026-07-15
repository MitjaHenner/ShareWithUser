using System;
using System.Collections.Generic;

namespace Jellyfin.Plugin.ShareWithUser.Api;

/// <summary>
/// Request model for updating share tags on a media item.
/// </summary>
/// <param name="ItemId">The media item identifier.</param>
/// <param name="Tags">Collection of tag values to set.</param>
public record ShareTagsRequest(Guid ItemId, IEnumerable<string>? Tags);
