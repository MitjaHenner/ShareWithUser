(function () {
    'use strict';

    try {
        console.log('[ShareWithUser] Script loaded');
    } catch (e) {
        // Script failed to load
        return;
    }

    // Wait for Jellyfin globals to be available
    function waitForGlobals(callback) {
        if (typeof ApiClient !== 'undefined' && typeof Dashboard !== 'undefined') {
            callback();
        } else {
            console.log('[ShareWithUser] Waiting for Jellyfin globals...');
            setTimeout(function () {
                waitForGlobals(callback);
            }, 500);
        }
    }

    waitForGlobals(function () {

    // Track whether our share dialog is currently open
    var shareDialogOpen = false;

    // Track the item ID from the info button that opened the context menu
    var lastTriggeredItemId = null;
    var lastTriggeredTime = 0;

    /**
     * Checks if the current user is an administrator.
     */
    function isAdmin() {
        console.log('[ShareWithUser] Checking admin status...');

        if (typeof Users !== 'undefined' && Users.currentUser) {
            var user = Users.currentUser;
            console.log('[ShareWithUser] Users.currentUser found, IsAdministrator:', user.Policy?.IsAdministrator);
            return Promise.resolve(user.Policy?.IsAdministrator === true);
        }

        if (typeof ApiClient !== 'undefined') {
            console.log('[ShareWithUser] Falling back to ApiClient.getCurrentUser');
            return ApiClient.getCurrentUser().then(function (currentUser) {
                console.log('[ShareWithUser] ApiClient user, IsAdministrator:', currentUser.Policy?.IsAdministrator);
                return currentUser.Policy.IsAdministrator === true;
            }).catch(function (err) {
                console.error('[ShareWithUser] ApiClient.getCurrentUser failed:', err);
                return false;
            });
        }

        console.warn('[ShareWithUser] No user API found');
        return Promise.resolve(false);
    }

    /**
     * Checks if a string looks like a Jellyfin item ID (32 hex chars or 36 char GUID).
     */
    function isItemIdLike(str) {
        if (!str) return false;
        // 32 hex chars (UUID without dashes) or 36 chars (UUID with dashes)
        return /^[0-9a-f]{32}$/i.test(str) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    }

    /**
     * Extracts the media item ID from the current page context.
     */
    function getItemId() {
        console.log('[ShareWithUser] getItemId debugging:');
        console.log('[ShareWithUser]   URL pathname:', window.location.pathname);
        console.log('[ShareWithUser]   URL search:', window.location.search);

        // Strategy 0: Use the tracked item ID from the info button click
        if (lastTriggeredItemId && (Date.now() - lastTriggeredTime) < 10000) {
            console.log('[ShareWithUser] Item ID from tracked click:', lastTriggeredItemId);
            return lastTriggeredItemId;
        }

        // Strategy 1: URL parsing (detail pages like /details/movies/123)
        var path = window.location.pathname;
        var match = path.match(/\/details\/[^\/]+\/([^\/]+)/);
        if (match && isItemIdLike(match[1])) {
            console.log('[ShareWithUser] Item ID from URL:', match[1]);
            return match[1];
        }

        // Strategy 2: URL query param ?id= or ?itemId=
        var params = new URLSearchParams(window.location.search);
        var urlId = params.get('id') || params.get('itemId');
        if (urlId && isItemIdLike(urlId)) {
            console.log('[ShareWithUser] Item ID from URL param:', urlId);
            return urlId;
        }

        // Strategy 3: nowPlayingQueue (now playing bar)
        if (typeof nowPlayingQueue !== 'undefined' && nowPlayingQueue.items && nowPlayingQueue.items.length > 0) {
            var id = nowPlayingQueue.items[0].Id;
            console.log('[ShareWithUser] Item ID from nowPlayingQueue:', id);
            return id;
        }

        // Strategy 4: Page state (detail pages)
        if (typeof Page !== 'undefined' && Page.item) {
            var id2 = Page.item.Id;
            console.log('[ShareWithUser] Item ID from Page.item:', id2);
            return id2;
        }

                // Strategy 5: Look for the action sheet (may not have actionSheet class yet)
        var actionSheet = document.querySelector('.dialogContainer.actionSheet');
        console.log('[ShareWithUser] Action sheet found:', !!actionSheet);

        // Also check for any open dialogs
        var openDialogs = document.querySelectorAll('.dialogContainer');
        console.log('[ShareWithUser] Open dialogs:', openDialogs.length);
        for (var dd = 0; dd < openDialogs.length; dd++) {
            var dlg = openDialogs[dd];
            console.log('[ShareWithUser] Dialog', dd, 'classes:', dlg.className.substring(0, 100), 'display:', dlg.style.display, 'visible:', !!dlg.offsetParent);
            // Check if this dialog has action sheet-like content (listItem buttons)
            var listItems = dlg.querySelectorAll('.listItem-button');
            console.log('[ShareWithUser] Dialog', dd, 'listItem buttons:', listItems.length);
            if (listItems.length > 5) {
                actionSheet = dlg; // Use this as the action sheet
                console.log('[ShareWithUser] Using dialog', dd, 'as action sheet (has listItems)');
            }
        }

        if (actionSheet) {
            // Even if display:none, try to find the trigger element
            // Look for the element that triggered the context menu (infoButton)
            // The infoButton is usually the last focused element before the dialog opened
            var infoButtons = document.querySelectorAll('.infoButton, .paper-icon-button-light');
            console.log('[ShareWithUser] Info buttons:', infoButtons.length);

            // Check for hover/focus state on info buttons
            for (var ib = 0; ib < infoButtons.length; ib++) {
                var btn = infoButtons[ib];
                var parentCard = btn.closest('.card[data-id], .cardBox[data-id]');
                if (parentCard) {
                    var parentId = parentCard.getAttribute('data-id');
                    if (parentId && isItemIdLike(parentId)) {
                        // Check if this button is near the center of the viewport (likely the trigger)
                        var btnRect = btn.getBoundingClientRect();
                        var viewCX = window.innerWidth / 2;
                        var viewCY = window.innerHeight / 2;
                        var btnCX = btnRect.left + btnRect.width / 2;
                        var btnCY = btnRect.top + btnRect.height / 2;
                        var dist = Math.sqrt((btnCX - viewCX) ** 2 + (btnCY - viewCY) ** 2);
                        if (dist < 300) {
                            console.log('[ShareWithUser] Item ID from infoButton near center:', parentId, 'dist:', dist.toFixed(0));
                            return parentId;
                        }
                    }
                }
            }

            // Try elementFromPoint at viewport center (action sheet is usually centered)
            var viewCenterX = window.innerWidth / 2;
            var viewCenterY = window.innerHeight / 2;
            var elemAtCenter = document.elementFromPoint(viewCenterX, viewCenterY);
            if (elemAtCenter) {
                console.log('[ShareWithUser] Element at viewport center:', elemAtCenter.tagName, elemAtCenter.className.substring(0, 100));
                var current = elemAtCenter;
                var depth = 0;
                while (current && depth < 20) {
                    var elemId = current.getAttribute('data-id');
                    if (elemId && isItemIdLike(elemId)) {
                        console.log('[ShareWithUser] Item ID from viewport center parent:', elemId);
                        return elemId;
                    }
                    current = current.parentElement;
                    depth++;
                }
            }
        }

        // Strategy 6: Look for item info in the page (itemDetailPage)
        var itemDetailPage = document.querySelector('.itemDetailPage');
        if (itemDetailPage) {
            var itemIdAttr = itemDetailPage.getAttribute('data-id');
            if (itemIdAttr && isItemIdLike(itemIdAttr)) {
                console.log('[ShareWithUser] Item ID from itemDetailPage data-id:', itemIdAttr);
                return itemIdAttr;
            }
        }

        // Strategy 7: Look for focused element's parent card
        var focused = document.activeElement;
        if (focused && focused !== document.body) {
            var cardParent = focused.closest('.card[data-id], .cardBox[data-id]');
            if (cardParent) {
                var focusedId = cardParent.getAttribute('data-id');
                if (focusedId && isItemIdLike(focusedId)) {
                    console.log('[ShareWithUser] Item ID from focused element parent:', focusedId);
                    return focusedId;
                }
            }
        }

        // Strategy 8: Print debug info about cards and their data-id values
        var allCards = document.querySelectorAll('.card, .cardBox');
        console.log('[ShareWithUser] Total card elements:', allCards.length);
        var cardIds = [];
        for (var k = 0; k < Math.min(allCards.length, 5); k++) {
            var cid = allCards[k].getAttribute('data-id');
            if (cid) cardIds.push(cid);
        }
        console.log('[ShareWithUser] Sample card data-id values:', cardIds);

        console.warn('[ShareWithUser] Could not determine item ID after all strategies');
        return null;
    }

    /**
     * Fetches all Jellyfin users via the API.
     */
    function fetchAllUsers() {
        return ApiClient.getUsers().then(function (users) {
            console.log('[ShareWithUser] Fetched', users.length, 'users');
            return users;
        });
    }

    /**
     * Fetches the current user's ID (synchronous value wrapped in Promise).
     */
    function getCurrentUserId() {
        return Promise.resolve(ApiClient.getCurrentUserId());
    }

    /**
     * Fetches the media item's details including tags.
     */
    function fetchItemDetails(userId, itemId) {
        return ApiClient.getItem(userId, itemId).then(function (item) {
            console.log('[ShareWithUser] Item tags:', item.Tags);
            return item;
        });
    }

    /**
     * Creates and shows the share dialog with checkboxes for each user.
     */
    function showShareDialog(itemId) {
        console.log('[ShareWithUser] showShareDialog called with itemId:', itemId);
        console.log('[ShareWithUser] Dashboard defined:', typeof Dashboard !== 'undefined');

        if (typeof Dashboard !== 'undefined' && Dashboard.showLoadingMsg) {
            Dashboard.showLoadingMsg();
        }

        console.log('[ShareWithUser] Fetching current user ID...');
        getCurrentUserId().then(function (currentUserId) {
            console.log('[ShareWithUser] Current user ID:', currentUserId);
            console.log('[ShareWithUser] Fetching users and item details...');
            return Promise.all([fetchAllUsers(), fetchItemDetails(currentUserId, itemId), Promise.resolve(currentUserId)]);
        }).then(function (results) {
            console.log('[ShareWithUser] Received data, processing...');
            var allUsers = results[0];
            var item = results[1];
            var currentUserId = results[2];
            var tags = item.Tags || [];

            // Filter out the current user
            var users = allUsers.filter(function (user) {
                return user.Id !== currentUserId;
            });

            console.log('[ShareWithUser] Users:', users.length, 'Tags:', tags);

            if (typeof Dashboard !== 'undefined' && Dashboard.hideLoadingMsg) {
                Dashboard.hideLoadingMsg();
            }
            buildAndShowDialog(users, tags, itemId);
        }).catch(function (err) {
            console.error('[ShareWithUser] Failed to load share dialog data:', err);
            if (typeof Dashboard !== 'undefined' && Dashboard.hideLoadingMsg) {
                Dashboard.hideLoadingMsg();
            }
            alert('Failed to load share dialog: ' + err.message);
        });
    }

    /**
     * Builds the dialog DOM and appends it to the page.
     */
    function buildAndShowDialog(users, tags, itemId) {
        // Remove any existing share dialog
        removeShareDialog();

        // Create backdrop
        var backdrop = document.createElement('div');
        backdrop.className = 'dialogBackdrop dialogBackdropOpened';
        backdrop.setAttribute('data-share-dialog-backdrop', 'true');

        // Create dialogContainer (fullscreen centering wrapper)
        var dialogContainer = document.createElement('div');
        dialogContainer.className = 'dialogContainer';

        // Create dialog (the visible box with rounded corners)
        var dialog = document.createElement('div');
        dialog.className = 'dialog shareDialog formDialog';
        dialog.setAttribute('data-share-dialog', 'true');
        dialog.style.minWidth = '320px';
        dialog.style.maxWidth = '500px';
        dialog.style.width = 'auto';
        dialog.style.maxHeight = '80vh';

        // Header (matches Jellyfin formDialogHeader exactly)
        var header = document.createElement('div');
        header.className = 'formDialogHeader';

        var title = document.createElement('h3');
        title.className = 'formDialogHeaderTitle';
        title.textContent = 'Share with Users';
        header.appendChild(title);

        // Right-side buttons container
        var headerButtons = document.createElement('div');
        headerButtons.className = 'dialogHeader flex align-items-center justify-content-center';

        // Close button (paper-icon-button-light = no background)
        var closeBtn = document.createElement('button');
        closeBtn.is = 'paper-icon-button-light';
        closeBtn.type = 'button';
        closeBtn.className = 'btnCancel btnClose autoSize';
        closeBtn.setAttribute('title', 'Close');
        closeBtn.innerHTML = '<span class="material-icons close" aria-hidden="true"></span>';
        closeBtn.addEventListener('click', closeShareDialog);
        headerButtons.appendChild(closeBtn);
        header.appendChild(headerButtons);

        // Scrollable content (matches formDialogContent)
        var scrollContent = document.createElement('div');
        scrollContent.className = 'formDialogContent smoothScrollY';
        scrollContent.style.paddingTop = '2em';

        // Inner content wrapper (matches dialogContentInner)
        var innerContent = document.createElement('div');
        innerContent.className = 'dialogContentInner dialog-content-centered';

        var userList = document.createElement('div');
        userList.className = 'checkboxList';

        users.forEach(function (user) {
            var isChecked = tags.some(function (tag) {
                return tag.toLowerCase() === user.Name.toLowerCase();
            });

            var listItem = document.createElement('div');
            listItem.className = 'listItem listItem-button';
            listItem.innerHTML =
                '<div class="listItemBody">' +
                    '<label class="checkboxContainer">' +
                        '<input type="checkbox" class="emby-checkbox" data-username="' + escapeHtml(user.Name) + '" ' + (isChecked ? 'checked' : '') + ' />' +
                        '<span class="checkboxLabel">' + escapeHtml(user.Name) + '</span>' +
                    '</label>' +
                '</div>';
            userList.appendChild(listItem);
        });

        innerContent.appendChild(userList);

        // Footer (matches Edit Metadata dialog footer)
        var footer = document.createElement('div');
        footer.className = 'formDialogFooter';

        var cancelBtn = document.createElement('button');
        cancelBtn.is = 'emby-button';
        cancelBtn.type = 'button';
        cancelBtn.className = 'raised button-cancel btnCancel';
        cancelBtn.innerHTML = '<span>Cancel</span>';
        cancelBtn.style.flexBasis = '12em';
        cancelBtn.addEventListener('click', closeShareDialog);

        var saveBtn = document.createElement('button');
        saveBtn.is = 'emby-button';
        saveBtn.type = 'button';
        saveBtn.className = 'raised button-submit btnSave';
        saveBtn.innerHTML = '<span>Save</span>';
        saveBtn.style.flexBasis = '12em';
        saveBtn.addEventListener('click', function () {
            saveShareTags(itemId, userList, tags);
            closeShareDialog();
        });

        footer.appendChild(cancelBtn);
        footer.appendChild(saveBtn);

        // Footer inside innerContent (matches Edit Metadata dialog structure)
        innerContent.appendChild(footer);

        // Assemble: scrollContent > innerContent
        scrollContent.appendChild(innerContent);

        // Assemble: dialog > header + scrollContent
        dialog.appendChild(header);
        dialog.appendChild(scrollContent);
        dialogContainer.appendChild(dialog);

        document.body.appendChild(backdrop);
        document.body.appendChild(dialogContainer);

        // Click outside dialog (on container) closes it
        dialogContainer.addEventListener('click', function (e) {
            if (e.target === dialogContainer) {
                closeShareDialog();
            }
        });

        // Backdrop click closes dialog
        backdrop.addEventListener('click', closeShareDialog);

        // Escape key closes dialog
        var escapeHandler = function (e) {
            if (e.key === 'Escape') {
                closeShareDialog();
            }
        };
        document.addEventListener('keydown', escapeHandler);

        shareDialogOpen = true;
        console.log('[ShareWithUser] Share dialog opened for item', itemId);
    }

    /**
     * Saves the selected share tags to the server via Jellyfin's Items API.
     */
    function saveShareTags(itemId, userList, existingTags) {
        var selectedUsernames = [];
        userList.querySelectorAll('input[type="checkbox"]:checked').forEach(function (checkbox) {
            selectedUsernames.push(checkbox.getAttribute('data-username'));
        });

        console.log('[ShareWithUser] Saving tags for item', itemId, ':', selectedUsernames);

        if (typeof Dashboard !== 'undefined' && Dashboard.showLoadingMsg) {
            Dashboard.showLoadingMsg();
        }

        // Build new tag list: keep non-username tags, add selected username tags
        var newTags = existingTags.filter(function (tag) {
            return !selectedUsernames.some(function (u) {
                return stringEqualsIgnoreCase(u, tag);
            });
        });
        newTags = newTags.concat(selectedUsernames);

        console.log('[ShareWithUser] New tags:', newTags);

        // Use Jellyfin's Items API to update tags
        // POST /Items/{id} with the item data
        var requestData = {
            Id: itemId,
            Tags: newTags
        };

        console.log('[ShareWithUser] Request body:', JSON.stringify(requestData));

        ApiClient.ajax({
            url: ApiClient.getUrl('Items/' + itemId),
            type: 'POST',
            dataType: 'json',
            contentType: 'application/json',
            data: JSON.stringify(requestData)
        }).then(function (response) {
            console.log('[ShareWithUser] Tags updated successfully:', newTags);
            if (typeof Dashboard !== 'undefined' && Dashboard.hideLoadingMsg) {
                Dashboard.hideLoadingMsg();
            }
        }).catch(function (err) {
            if (typeof Dashboard !== 'undefined' && Dashboard.hideLoadingMsg) {
                Dashboard.hideLoadingMsg();
            }
            console.error('[ShareWithUser] Failed to update tags:', err);
            console.error('[ShareWithUser] Response status:', err.status);
            console.error('[ShareWithUser] Response text:', err.responseText);
            alert('Failed to update share tags (HTTP ' + err.status + '). See console for details.');
        });
    }

    /**
     * Case-insensitive string comparison.
     */
    function stringEqualsIgnoreCase(a, b) {
        return (a || '').toLowerCase() === (b || '').toLowerCase();
    }

    /**
     * Closes and removes the share dialog.
     */
    function closeShareDialog() {
        removeShareDialog();
        shareDialogOpen = false;
    }

    /**
     * Removes the share dialog and its backdrop from the DOM.
     */
    function removeShareDialog() {
        var dialog = document.querySelector('[data-share-dialog="true"]');
        if (dialog) {
            // Remove the parent dialogContainer too
            var container = dialog.parentNode;
            if (container && container.classList.contains('dialogContainer')) {
                container.remove();
            } else {
                dialog.remove();
            }
        }

        var backdrop = document.querySelector('[data-share-dialog-backdrop="true"]');
        if (backdrop) {
            backdrop.remove();
        }
    }

    /**
     * Escapes HTML special characters.
     */
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Injects the "Share with User..." menu item into a dialog context menu.
     */
    function injectMenuItem(container) {
        setTimeout(function () {
            // Guard: skip if this container already has our button
            if (container.querySelector('[data-share-with-user]')) {
                console.log('[ShareWithUser] Menu item already present, skipping');
                return;
            }

            var items = container.querySelectorAll('.actionSheetMenuItem');
            console.log('[ShareWithUser] Found', items.length, 'menu items');

            if (!items || items.length === 0) {
                console.warn('[ShareWithUser] No .actionSheetMenuItem items found');
                return;
            }

            // Find the "Edit metadata" item to insert before it
            var editMetadataItem = null;
            for (var i = 0; i < items.length; i++) {
                var textSpan = items[i].querySelector('.actionSheetItemText');
                if (textSpan && textSpan.textContent.includes('Edit metadata')) {
                    editMetadataItem = items[i];
                    break;
                }
            }

            var shareBtn = document.createElement('button');
            shareBtn.setAttribute('data-share-with-user', 'true');
            shareBtn.className = 'listItem listItem-button actionSheetMenuItem emby-button';
            shareBtn.innerHTML =
                '<span class="actionsheetMenuItemIcon listItemIcon listItemIcon-transparent material-icons">share</span>' +
                '<span class="listItemBody actionsheetListItemBody"><span class="listItemBodyText actionSheetItemText">Share with User...</span></span>';

            shareBtn.addEventListener('click', function () {
                // Close the context menu and its backdrop
                container.remove();
                var backdrops = document.querySelectorAll('.dialogBackdrop');
                for (var b = 0; b < backdrops.length; b++) {
                    backdrops[b].remove();
                }

                // Get item ID and show dialog
                var itemId = getItemId();
                if (!itemId) {
                    console.error('[ShareWithUser] Could not determine item ID');
                    alert('Could not determine the media item. Please try again from the item\'s detail page.');
                    return;
                }

                console.log('[ShareWithUser] Share button clicked for item:', itemId);
                showShareDialog(itemId);
            });

            if (editMetadataItem) {
                editMetadataItem.parentElement.insertBefore(shareBtn, editMetadataItem);
            } else {
                items[items.length - 1].parentElement.appendChild(shareBtn);
            }
            console.log('[ShareWithUser] Menu item injected');
        }, 100);
    }

    /**
     * Observes DOM mutations to detect when the action sheet (context menu) appears.
     * Also tracks info button clicks to capture the item ID.
     */
    function init() {
        isAdmin().then(function (admin) {
            console.log('[ShareWithUser] isAdmin:', admin);
            if (!admin) {
                console.warn('[ShareWithUser] Not admin, skipping menu injection');
                return;
            }

            // Track info button clicks to capture the item ID from the parent card
            document.addEventListener('click', function (e) {
                var target = e.target;
                // Walk up to find the info button
                var infoButton = target.closest('.infoButton, .paper-icon-button-light');
                if (infoButton) {
                    var parentCard = infoButton.closest('.card[data-id], .cardBox[data-id]');
                    if (parentCard) {
                        var itemId = parentCard.getAttribute('data-id');
                        if (itemId && isItemIdLike(itemId)) {
                            lastTriggeredItemId = itemId;
                            lastTriggeredTime = Date.now();
                            console.log('[ShareWithUser] Tracked info button click for item:', itemId);
                        }
                    }
                }
            }, true); // capture phase

            // Also track focus changes (for keyboard navigation)
            document.addEventListener('focus', function (e) {
                var target = e.target;
                var parentCard = target.closest('.card[data-id], .cardBox[data-id]');
                if (parentCard) {
                    var itemId = parentCard.getAttribute('data-id');
                    if (itemId && isItemIdLike(itemId)) {
                        lastTriggeredItemId = itemId;
                        lastTriggeredTime = Date.now();
                    }
                }
            }, true); // capture phase

            var observer = new MutationObserver(function (mutations) {
                mutations.forEach(function (mutation) {
                    if (mutation.addedNodes) {
                        for (var i = 0; i < mutation.addedNodes.length; i++) {
                            var node = mutation.addedNodes[i];
                            if (node.nodeType === 1 && node.classList && node.classList.contains('dialogContainer')) {
                                // Skip our own share dialog
                                if (node.getAttribute('data-share-dialog')) {
                                    console.log('[ShareWithUser] Skipping own share dialog');
                                    return;
                                }
                                console.log('[ShareWithUser] Detected dialogContainer');
                                injectMenuItem(node);
                            }
                        }
                    }
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            console.log('[ShareWithUser] MutationObserver started');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    }); // waitForGlobals
})();
