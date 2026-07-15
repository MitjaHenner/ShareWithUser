(function () {
    'use strict';

    // Wait for Jellyfin globals to be available
    function waitForGlobals(callback) {
        if (typeof ApiClient !== 'undefined' && typeof Dashboard !== 'undefined') {
            callback();
        } else {
            setTimeout(function () {
                waitForGlobals(callback);
            }, 500);
        }
    }

    waitForGlobals(function () {
        var lastTriggeredItemId = null;
        var lastTriggeredTime = 0;

        /**
         * Checks if the current user is an administrator.
         */
        function isAdmin() {
            if (typeof Users !== 'undefined' && Users.currentUser) {
                return Promise.resolve(Users.currentUser.Policy?.IsAdministrator === true);
            }

            if (typeof ApiClient !== 'undefined') {
                return ApiClient.getCurrentUser().then(function (user) {
                    return user.Policy.IsAdministrator === true;
                }).catch(function () {
                    return false;
                });
            }

            return Promise.resolve(false);
        }

        /**
         * Checks if a string looks like a Jellyfin item ID.
         */
        function isItemIdLike(str) {
            if (!str) return false;
            return /^[0-9a-f]{32}$/i.test(str) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        }

        /**
         * Extracts the media item ID from the current page context.
         */
        function getItemId() {
            // Strategy 0: Tracked info button click (primary path)
            if (lastTriggeredItemId && (Date.now() - lastTriggeredTime) < 10000) {
                return lastTriggeredItemId;
            }

            // Strategy 1: URL parsing (detail pages)
            var match = window.location.pathname.match(/\/details\/[^\/]+\/([^\/]+)/);
            if (match && isItemIdLike(match[1])) {
                return match[1];
            }

            // Strategy 2: URL query param
            var params = new URLSearchParams(window.location.search);
            var urlId = params.get('id') || params.get('itemId');
            if (urlId && isItemIdLike(urlId)) {
                return urlId;
            }

            // Strategy 3: nowPlayingQueue
            if (typeof nowPlayingQueue !== 'undefined' && nowPlayingQueue.items && nowPlayingQueue.items.length > 0) {
                return nowPlayingQueue.items[0].Id;
            }

            // Strategy 4: Page state
            if (typeof Page !== 'undefined' && Page.item) {
                return Page.item.Id;
            }

            // Strategy 5: Action sheet context
            var actionSheet = document.querySelector('.dialogContainer.actionSheet');
            if (!actionSheet) {
                var openDialogs = document.querySelectorAll('.dialogContainer');
                for (var d = 0; d < openDialogs.length; d++) {
                    if (openDialogs[d].querySelectorAll('.listItem-button').length > 5) {
                        actionSheet = openDialogs[d];
                    }
                }
            }

            if (actionSheet) {
                var infoButtons = document.querySelectorAll('.infoButton, .paper-icon-button-light');
                for (var ib = 0; ib < infoButtons.length; ib++) {
                    var parentCard = infoButtons[ib].closest('.card[data-id], .cardBox[data-id]');
                    if (parentCard) {
                        var parentId = parentCard.getAttribute('data-id');
                        if (parentId && isItemIdLike(parentId)) {
                            var btnRect = infoButtons[ib].getBoundingClientRect();
                            var dist = Math.sqrt(
                                (btnRect.left + btnRect.width / 2 - window.innerWidth / 2) ** 2 +
                                (btnRect.top + btnRect.height / 2 - window.innerHeight / 2) ** 2
                            );
                            if (dist < 300) return parentId;
                        }
                    }
                }

                var elemAtCenter = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
                if (elemAtCenter) {
                    var current = elemAtCenter;
                    for (var depth = 0; current && depth < 20; depth++) {
                        var elemId = current.getAttribute('data-id');
                        if (elemId && isItemIdLike(elemId)) return elemId;
                        current = current.parentElement;
                    }
                }
            }

            // Strategy 6: itemDetailPage
            var itemDetailPage = document.querySelector('.itemDetailPage');
            if (itemDetailPage) {
                var itemIdAttr = itemDetailPage.getAttribute('data-id');
                if (itemIdAttr && isItemIdLike(itemIdAttr)) return itemIdAttr;
            }

            // Strategy 7: focused element
            var focused = document.activeElement;
            if (focused && focused !== document.body) {
                var cardParent = focused.closest('.card[data-id], .cardBox[data-id]');
                if (cardParent) {
                    var focusedId = cardParent.getAttribute('data-id');
                    if (focusedId && isItemIdLike(focusedId)) return focusedId;
                }
            }

            return null;
        }

        /**
         * Fetches all Jellyfin users via the API.
         */
        function fetchAllUsers() {
            return ApiClient.getUsers();
        }

        /**
         * Fetches the media item's details including tags.
         */
        function fetchItemDetails(userId, itemId) {
            return ApiClient.getItem(userId, itemId);
        }

        /**
         * Opens the share dialog for a media item.
         */
        function showShareDialog(itemId) {
            if (typeof Dashboard !== 'undefined' && Dashboard.showLoadingMsg) {
                Dashboard.showLoadingMsg();
            }

            var currentUserId = ApiClient.getCurrentUserId();
            Promise.all([fetchAllUsers(), fetchItemDetails(currentUserId, itemId), Promise.resolve(currentUserId)])
                .then(function (results) {
                    var allUsers = results[0];
                    var item = results[1];
                    var userId = results[2];
                    var tags = item.Tags || [];

                    var users = allUsers.filter(function (user) {
                        return user.Id !== userId;
                    });

                    if (typeof Dashboard !== 'undefined' && Dashboard.hideLoadingMsg) {
                        Dashboard.hideLoadingMsg();
                    }
                    buildAndShowDialog(users, tags, itemId);
                })
                .catch(function (err) {
                    if (typeof Dashboard !== 'undefined' && Dashboard.hideLoadingMsg) {
                        Dashboard.hideLoadingMsg();
                    }
                    console.error('[ShareWithUser] Failed to load share dialog:', err);
                    alert('Failed to load share dialog: ' + err.message);
                });
        }

        /**
         * Builds the dialog DOM and appends it to the page.
         */
        function buildAndShowDialog(users, tags, itemId) {
            removeShareDialog();

            var backdrop = document.createElement('div');
            backdrop.className = 'dialogBackdrop dialogBackdropOpened';
            backdrop.setAttribute('data-share-dialog-backdrop', 'true');

            var dialogContainer = document.createElement('div');
            dialogContainer.className = 'dialogContainer';

            var dialog = document.createElement('div');
            dialog.className = 'dialog shareDialog formDialog';
            dialog.setAttribute('data-share-dialog', 'true');
            dialog.style.minWidth = '300px';
            dialog.style.maxWidth = '600px';
            dialog.style.width = 'auto';
            dialog.style.maxHeight = '80vh';

            // Header
            var header = document.createElement('div');
            header.className = 'formDialogHeader';

            var closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'btnCancel autoSize paper-icon-button-light';
            closeBtn.setAttribute('title', 'Close');
            closeBtn.innerHTML = '<span class="material-icons arrow_back" aria-hidden="true"></span>';
            closeBtn.addEventListener('click', closeShareDialog);
            header.appendChild(closeBtn);

            var title = document.createElement('h3');
            title.className = 'formDialogHeaderTitle';
            title.textContent = 'Share with Users';
            header.appendChild(title);

            // Content
            var scrollContent = document.createElement('div');
            scrollContent.className = 'formDialogContent smoothScrollY';

            var innerContent = document.createElement('div');
            innerContent.className = 'dialogContentInner dialog-content-centered';
            innerContent.style.padding = '0.5em 2em 7em 2em';

            var userList = document.createElement('div');
            userList.className = 'checkboxList';

            users.forEach(function (user) {
                var isChecked = tags.some(function (tag) {
                    return tag.toLowerCase() === user.Name.toLowerCase();
                });

                var label = document.createElement('label');
                label.innerHTML =
                    '<input is="emby-checkbox" type="checkbox" data-username="' + escapeHtml(user.Name) + '" ' + (isChecked ? 'checked' : '') + ' />' +
                    '<span>' + escapeHtml(user.Name) + '</span>';
                userList.appendChild(label);
            });

            innerContent.appendChild(userList);

            // Footer
            var footer = document.createElement('div');
            footer.className = 'formDialogFooter';

            var cancelBtn = document.createElement('button');
            cancelBtn.is = 'emby-button';
            cancelBtn.type = 'button';
            cancelBtn.className = 'emby-button raised button-cancel block btnCancel formDialogFooterItem';
            cancelBtn.innerHTML = '<span>Cancel</span>';
            cancelBtn.addEventListener('click', closeShareDialog);

            var saveBtn = document.createElement('button');
            saveBtn.is = 'emby-button';
            saveBtn.type = 'button';
            saveBtn.className = 'emby-button raised button-submit block btnSave formDialogFooterItem';
            saveBtn.innerHTML = '<span>Save</span>';
            saveBtn.addEventListener('click', function () {
                var allUsernames = users.map(function (u) { return u.Name; });
                saveShareTags(itemId, userList, tags, allUsernames);
                closeShareDialog();
            });

            footer.appendChild(cancelBtn);
            footer.appendChild(saveBtn);
            innerContent.appendChild(footer);
            scrollContent.appendChild(innerContent);

            dialog.appendChild(header);
            dialog.appendChild(scrollContent);
            dialogContainer.appendChild(dialog);

            document.body.appendChild(backdrop);
            document.body.appendChild(dialogContainer);

            dialogContainer.addEventListener('click', function (e) {
                if (e.target === dialogContainer) closeShareDialog();
            });
            backdrop.addEventListener('click', closeShareDialog);

            var escapeHandler = function (e) {
                if (e.key === 'Escape') closeShareDialog();
            };
            document.addEventListener('keydown', escapeHandler);
        }

        /**
         * Saves the selected share tags to the server.
         */
        function saveShareTags(itemId, userList, existingTags, allUsernames) {
            var selectedUsernames = [];
            userList.querySelectorAll('input[type="checkbox"]:checked').forEach(function (cb) {
                selectedUsernames.push(cb.getAttribute('data-username'));
            });

            if (typeof Dashboard !== 'undefined' && Dashboard.showLoadingMsg) {
                Dashboard.showLoadingMsg();
            }

            // Keep non-username tags, then add selected username tags
            var newTags = existingTags.filter(function (tag) {
                return !allUsernames.some(function (u) {
                    return stringEqualsIgnoreCase(u, tag);
                });
            }).concat(selectedUsernames);

            ApiClient.ajax({
                url: ApiClient.getUrl('Plugins/ShareWithUser/ShareTags'),
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ itemId: itemId, tags: newTags })
            }).then(function () {
                if (typeof Dashboard !== 'undefined' && Dashboard.hideLoadingMsg) {
                    Dashboard.hideLoadingMsg();
                }
            }).catch(function (err) {
                if (typeof Dashboard !== 'undefined' && Dashboard.hideLoadingMsg) {
                    Dashboard.hideLoadingMsg();
                }
                console.error('[ShareWithUser] Failed to update tags:', err);
                alert('Failed to update share tags (HTTP ' + err.status + ').');
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
        }

        /**
         * Removes the share dialog and its backdrop from the DOM.
         */
        function removeShareDialog() {
            var dialog = document.querySelector('[data-share-dialog="true"]');
            if (dialog) {
                var container = dialog.parentNode;
                if (container && container.classList.contains('dialogContainer')) {
                    container.remove();
                } else {
                    dialog.remove();
                }
            }

            var backdrop = document.querySelector('[data-share-dialog-backdrop="true"]');
            if (backdrop) backdrop.remove();
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
         * Injects the "Share with User..." menu item into a context menu.
         */
        function injectMenuItem(container) {
            setTimeout(function () {
                if (container.querySelector('[data-share-with-user]')) return;

                var items = container.querySelectorAll('.actionSheetMenuItem');
                if (!items || items.length === 0) return;

                // Find "Edit metadata" item to insert before
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
                    container.remove();
                    var backdrops = document.querySelectorAll('.dialogBackdrop');
                    for (var b = 0; b < backdrops.length; b++) backdrops[b].remove();

                    var itemId = getItemId();
                    if (!itemId) {
                        alert('Could not determine the media item. Please try again from the item\'s detail page.');
                        return;
                    }

                    showShareDialog(itemId);
                });

                if (editMetadataItem) {
                    editMetadataItem.parentElement.insertBefore(shareBtn, editMetadataItem);
                } else {
                    items[items.length - 1].parentElement.appendChild(shareBtn);
                }
            }, 100);
        }

        /**
         * Initializes the plugin: tracks clicks and observes DOM for context menus.
         */
        function init() {
            isAdmin().then(function (admin) {
                if (!admin) return;

                // Track info button clicks to capture item ID
                document.addEventListener('click', function (e) {
                    var infoButton = e.target.closest('.infoButton, .paper-icon-button-light');
                    if (infoButton) {
                        var parentCard = infoButton.closest('.card[data-id], .cardBox[data-id]');
                        if (parentCard) {
                            var itemId = parentCard.getAttribute('data-id');
                            if (itemId && isItemIdLike(itemId)) {
                                lastTriggeredItemId = itemId;
                                lastTriggeredTime = Date.now();
                            }
                        }
                    }
                }, true);

                // Track focus for keyboard navigation
                document.addEventListener('focus', function (e) {
                    var parentCard = e.target.closest('.card[data-id], .cardBox[data-id]');
                    if (parentCard) {
                        var itemId = parentCard.getAttribute('data-id');
                        if (itemId && isItemIdLike(itemId)) {
                            lastTriggeredItemId = itemId;
                            lastTriggeredTime = Date.now();
                        }
                    }
                }, true);

                // Observe DOM for context menus
                var observer = new MutationObserver(function (mutations) {
                    mutations.forEach(function (mutation) {
                        if (mutation.addedNodes) {
                            for (var i = 0; i < mutation.addedNodes.length; i++) {
                                var node = mutation.addedNodes[i];
                                if (node.nodeType === 1 && node.classList && node.classList.contains('dialogContainer')) {
                                    if (node.getAttribute('data-share-dialog')) return;
                                    injectMenuItem(node);
                                }
                            }
                        }
                    });
                });

                observer.observe(document.body, { childList: true, subtree: true });
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    });
})();
