# Jellyfin — How Tags Work on Items

Reference notes from the Jellyfin source (`C:/Users/mitja/Projects/jellyfin`).

## Tag Storage

Tags are stored in **two places**:

### 1. `BaseItemEntity.Tags` (SQLite column)

- **Format**: pipe-delimited string (`"tag1|tag2|tag3"`)
- **Mapping** (`BaseItemMapper.cs`):
  ```csharp
  // Reading: split on '|'
  dto.Tags = string.IsNullOrWhiteSpace(entity.Tags) ? [] : entity.Tags.Split('|');
  // Writing: join with '|'
  entity.Tags = dto.Tags is not null ? string.Join('|', dto.Tags.Distinct(StringComparer.OrdinalIgnoreCase)) : null;
  ```

### 2. `ItemValues` table

- Each tag = separate row with `Type = ItemValueType.Tags` (=4)
- Inherited tags stored with `Type = InheritedTags` (=6)
- Used for querying and filtering

## Tag Property on Items

| Property | Type | Location |
|----------|------|----------|
| `BaseItem.Tags` | `string[]` | `MediaBrowser.Controller/Entities/BaseItem.cs:643` |
| `BaseItemDto.Tags` | `string[]` | `MediaBrowser.Model/Dto/BaseItemDto.cs:389` |

- Initialized to `Array.Empty<string>()` in `BaseItem` constructor
- Exposed via API when `ItemFields.Tags` is requested in DTO options

## How Tags Are Added / Updated

**API endpoint**: `POST /Items/{itemId}` → `ItemUpdateController.UpdateItem`

### Flow

1. **Normalize**: `request.Tags` → trim + deduplicate (case-insensitive)
2. **Diff**: compute `addedTags` / `removedTags` against `item.Tags`
3. **Replace**: `item.Tags = newTags`
4. **Cascade** (respecting `LockedFields.Contains(MetadataField.Tags)`):
   - **Series** → all Seasons → all Episodes
   - **Season** → all Episodes
   - **MusicAlbum** → all tracks
5. **Persist**: `item.OnMetadataChanged()` → `item.UpdateToRepositoryAsync(ItemUpdateType.MetadataEdit)`

### Key code (`ItemUpdateController.cs` — `UpdateItem` private method)

```csharp
var currentTags = item.Tags;
var newTags = request.Tags.Select(t => t.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
var removedTags = currentTags.Except(newTags).ToList();
var addedTags = newTags.Except(currentTags).ToList();
item.Tags = newTags;
```

## Tag Inheritance

`BaseItem.GetInheritedTags()` walks up the chain:

```
item.Tags → parent.Tags → folder.Tags
```

Used for:
- **Allowed/Blocked tags** filtering (`IsVisibleViaTags` — parental controls)
- Stored as `InheritedTags` rows in ItemValues for query performance

## Programmatic Way to Add Tags (from a plugin)

```csharp
// Get the item
var item = _libraryManager.GetItemById<BaseItem>(itemId);

// Modify the Tags array
var newTags = item.Tags.ToList();
newTags.Add("NewTag");
item.Tags = newTags.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();

// Persist
item.OnMetadataChanged();
await item.UpdateToRepositoryAsync(ItemUpdateType.MetadataEdit, cancellationToken);
```

## Tag Persistence Flow

```
ItemUpdateController.UpdateItem()
  → item.Tags = newTags
  → item.OnMetadataChanged()
  → item.UpdateToRepositoryAsync()
    → LibraryManager.UpdateItemAsync()
      → ItemPersistenceService.SaveItems()
        → GetItemValuesToSave()
          → item.Tags.Select(i => (ItemValueType.Tags, i))
          → context.ItemValues (EF Core)
        → BaseItemEntity.Tags = string.Join('|', tags)
          → context.BaseItems (EF Core)
```

## Key Files

| File | Role |
|------|------|
| `MediaBrowser.Controller/Entities/BaseItem.cs` | `Tags` property, `GetInheritedTags()`, `IsVisibleViaTags()` |
| `Jellyfin.Api/Controllers/ItemUpdateController.cs` | `POST /Items/{id}` — update + cascade logic |
| `Jellyfin.Server.Implementations/Item/ItemPersistenceService.cs` | DB persistence (ItemValues table) |
| `Jellyfin.Server.Implementations/Item/BaseItemMapper.cs` | Entity ↔ DTO mapping (pipe-delimited) |
| `src/Jellyfin.Database/.../Entities/BaseItemEntity.cs` | `Tags` column definition |
| `src/Jellyfin.Database/.../Entities/ItemValueType.cs` | `Tags = 4`, `InheritedTags = 6` |
| `Emby.Server.Implementations/Dto/DtoService.cs` | DTO population (`ItemFields.Tags`) |
| `MediaBrowser.Controller/Library/ILibraryManager.cs` | `UpdateItemAsync()`, `UpdateItemsAsync()` |

## Web UI Flow

The metadata editor (`src/components/metadataEditor/metadataEditor.js`):

1. Reads `item.Tags` → populates `#listTags` via `populateListView()`
2. On save: reads `#listTags .textValue` elements → `getListValues()`
3. Sends `Tags: string[]` in `BaseItemDto` body of `POST /Items/{id}`

## ItemValueType Enum

```csharp
public enum ItemValueType
{
    Artist = 0,
    AlbumArtist = 1,
    Genre = 2,
    Studios = 3,
    Tags = 4,
    InheritedTags = 6,
}
```
