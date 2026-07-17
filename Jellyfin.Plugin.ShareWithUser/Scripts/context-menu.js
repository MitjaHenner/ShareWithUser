(() => {
	// Wait for Jellyfin globals to be available
	function waitForGlobals(callback) {
		if (typeof ApiClient !== "undefined" && typeof Dashboard !== "undefined") {
			callback();
		} else {
			setTimeout(() => {
				waitForGlobals(callback);
			}, 500);
		}
	}

	waitForGlobals(() => {
		var lastTriggeredItemId = null;
		var lastTriggeredTime = 0;

		// Item detail cache — populated during context-menu type check,
		// reused by showShareDialog to avoid a second API call.
		var cachedItem = null;
		var cachedItemId = null;
		var cachedTime = 0;
		var CACHE_TTL = 60000; // 60s

		/**
		 * Checks if the current user is an administrator.
		 */
		function isAdmin() {
			if (typeof Users !== "undefined" && Users.currentUser) {
				return Promise.resolve(
					Users.currentUser.Policy?.IsAdministrator === true,
				);
			}

			if (typeof ApiClient !== "undefined") {
				return ApiClient.getCurrentUser()
					.then((user) => user.Policy.IsAdministrator === true)
					.catch(() => false);
			}

			return Promise.resolve(false);
		}

		/**
		 * Checks if a string looks like a Jellyfin item ID.
		 */
		function isItemIdLike(str) {
			if (!str) return false;
			return (
				/^[0-9a-f]{32}$/i.test(str) ||
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
					str,
				)
			);
		}

		/**
		 * Extracts the media item ID from the current page context.
		 */
		function getItemId() {
			// Strategy 0: Tracked info button click (primary path)
			if (lastTriggeredItemId && Date.now() - lastTriggeredTime < 10000) {
				return lastTriggeredItemId;
			}

			// Strategy 1: URL parsing (detail pages)
			var match = window.location.pathname.match(/\/details\/[^/]+\/([^/]+)/);
			if (match && isItemIdLike(match[1])) {
				return match[1];
			}

			// Strategy 2: URL query param
			var params = new URLSearchParams(window.location.search);
			var urlId = params.get("id") || params.get("itemId");
			if (urlId && isItemIdLike(urlId)) {
				return urlId;
			}

			// Strategy 3: nowPlayingQueue
			if (
				typeof nowPlayingQueue !== "undefined" &&
				nowPlayingQueue.items &&
				nowPlayingQueue.items.length > 0
			) {
				return nowPlayingQueue.items[0].Id;
			}

			// Strategy 4: Page state
			if (typeof Page !== "undefined" && Page.item) {
				return Page.item.Id;
			}

			// Strategy 5: Action sheet context
			var actionSheet = document.querySelector(".dialogContainer.actionSheet");
			if (!actionSheet) {
				var openDialogs = document.querySelectorAll(".dialogContainer");
				for (var d = 0; d < openDialogs.length; d++) {
					if (openDialogs[d].querySelectorAll(".listItem-button").length > 5) {
						actionSheet = openDialogs[d];
					}
				}
			}

			if (actionSheet) {
				var infoButtons = document.querySelectorAll(
					".infoButton, .paper-icon-button-light",
				);
				for (var ib = 0; ib < infoButtons.length; ib++) {
					var parentCard = infoButtons[ib].closest(
						".card[data-id], .cardBox[data-id]",
					);
					if (parentCard) {
						var parentId = parentCard.getAttribute("data-id");
						if (parentId && isItemIdLike(parentId)) {
							var btnRect = infoButtons[ib].getBoundingClientRect();
							var dist = Math.sqrt(
								(btnRect.left + btnRect.width / 2 - window.innerWidth / 2) **
									2 +
									(btnRect.top + btnRect.height / 2 - window.innerHeight / 2) **
										2,
							);
							if (dist < 300) return parentId;
						}
					}
				}

				var elemAtCenter = document.elementFromPoint(
					window.innerWidth / 2,
					window.innerHeight / 2,
				);
				if (elemAtCenter) {
					var current = elemAtCenter;
					for (var depth = 0; current && depth < 20; depth++) {
						var elemId = current.getAttribute("data-id");
						if (elemId && isItemIdLike(elemId)) return elemId;
						current = current.parentElement;
					}
				}
			}

			// Strategy 6: itemDetailPage
			var itemDetailPage = document.querySelector(".itemDetailPage");
			if (itemDetailPage) {
				var itemIdAttr = itemDetailPage.getAttribute("data-id");
				if (itemIdAttr && isItemIdLike(itemIdAttr)) return itemIdAttr;
			}

			// Strategy 7: focused element
			var focused = document.activeElement;
			if (focused && focused !== document.body) {
				var cardParent = focused.closest(".card[data-id], .cardBox[data-id]");
				if (cardParent) {
					var focusedId = cardParent.getAttribute("data-id");
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
		 * Fetches the media item's details including tags, using a short-lived cache.
		 * Populates the cache so showShareDialog can reuse the data.
		 */
		function fetchItemDetailsCached(userId, itemId) {
			if (cachedItemId === itemId && Date.now() - cachedTime < CACHE_TTL) {
				return Promise.resolve(cachedItem);
			}
			return ApiClient.getItem(userId, itemId).then((item) => {
				cachedItemId = itemId;
				cachedItem = item;
				cachedTime = Date.now();
				return item;
			});
		}

		/**
		 * Returns the set of BaseItemKind values that count as "media".
		 */
		function getMediaTypeSet() {
			return new Set([
				"Movie",
				"Series",
				"Episode",
				"Season",
				"Book",
				"Audio",
				"Song",
				"Album",
				"MusicArtist",
				"Trailer",
				"Video",
				"BoxSet",
			]);
		}

		/**
		 * Checks whether an item ID corresponds to a media-type item.
		 * Uses the cache so the fetch is shared with showShareDialog.
		 */
		function checkIsMediaType(itemId) {
			var userId = ApiClient.getCurrentUserId();
			return fetchItemDetailsCached(userId, itemId).then((item) =>
				getMediaTypeSet().has(item.Type),
			);
		}

		/**
		 * Opens the share dialog for a media item.
		 * Reuses cached item details from the type-check step to avoid a second API call.
		 */
		function showShareDialog(itemId) {
			if (typeof Dashboard !== "undefined" && Dashboard.showLoadingMsg) {
				Dashboard.showLoadingMsg();
			}

			var currentUserId = ApiClient.getCurrentUserId();

			// Use cached item if still valid (populated by checkIsMediaType)
			var itemPromise = fetchItemDetailsCached(currentUserId, itemId);

			Promise.all([
				fetchAllUsers(),
				itemPromise,
				Promise.resolve(currentUserId),
			])
				.then((results) => {
					var allUsers = results[0];
					var item = results[1];
					var userId = results[2];
					var tags = item.Tags || [];

					var users = allUsers.filter((user) => user.Id !== userId);

					if (typeof Dashboard !== "undefined" && Dashboard.hideLoadingMsg) {
						Dashboard.hideLoadingMsg();
					}
					buildAndShowDialog(users, tags, itemId);
				})
				.catch((err) => {
					if (typeof Dashboard !== "undefined" && Dashboard.hideLoadingMsg) {
						Dashboard.hideLoadingMsg();
					}
					console.error("[ShareWithUser] Failed to load share dialog:", err);
					if (typeof Dashboard !== "undefined" && Dashboard.alert) {
						Dashboard.alert({
							text: "Failed to load share dialog: " + err.message,
						});
					}
				});
		}

		/**
		 * Builds the dialog DOM and appends it to the page.
		 */
		function buildAndShowDialog(users, tags, itemId) {
			removeShareDialog();

			var backdrop = document.createElement("div");
			backdrop.className = "dialogBackdrop dialogBackdropOpened";
			backdrop.setAttribute("data-share-dialog-backdrop", "true");

			var dialogContainer = document.createElement("div");
			dialogContainer.className = "dialogContainer";

			var dialog = document.createElement("div");
			dialog.className = "dialog shareDialog formDialog";
			dialog.setAttribute("data-share-dialog", "true");
			dialog.style.minWidth = "300px";
			dialog.style.maxWidth = "600px";
			dialog.style.width = "auto";
			dialog.style.maxHeight = "80vh";

			// Header
			var header = document.createElement("div");
			header.className = "formDialogHeader";

			var closeBtn = document.createElement("button");
			closeBtn.type = "button";
			closeBtn.className = "btnCancel autoSize paper-icon-button-light";
			closeBtn.setAttribute("title", "Close");
			var closeIcon = document.createElement("span");
			closeIcon.className = "material-icons arrow_back";
			closeIcon.setAttribute("aria-hidden", "true");
			closeBtn.append(closeIcon);
			closeBtn.addEventListener("click", closeShareDialog);
			header.append(closeBtn);

			var title = document.createElement("h3");
			title.className = "formDialogHeaderTitle";
			title.textContent = "Share with users";
			header.append(title);

			// Content
			var scrollContent = document.createElement("div");
			scrollContent.className = "formDialogContent smoothScrollY";

			var innerContent = document.createElement("div");
			innerContent.className = "dialogContentInner dialog-content-centered";
			innerContent.style.padding = "0.5em 2em 7em 2em";

			var userList = document.createElement("div");
			userList.className = "checkboxList";

			users.forEach((user) => {
				var isChecked = tags.some(
					(tag) => tag.toLowerCase() === user.Name.toLowerCase(),
				);

				var label = document.createElement("label");
				var checkbox = document.createElement("input");
				checkbox.setAttribute("is", "emby-checkbox");
				checkbox.type = "checkbox";
				checkbox.setAttribute("data-username", user.Name);
				if (isChecked) checkbox.checked = true;
				var nameSpan = document.createElement("span");
				nameSpan.textContent = user.Name;
				label.append(checkbox, nameSpan);
				userList.append(label);
			});

			innerContent.append(userList);

			// Footer
			var footer = document.createElement("div");
			footer.className = "formDialogFooter";

			var cancelBtn = document.createElement("button");
			cancelBtn.is = "emby-button";
			cancelBtn.type = "button";
			cancelBtn.className =
				"emby-button raised button-cancel block btnCancel formDialogFooterItem";
			var cancelText = document.createElement("span");
			cancelText.textContent = "Cancel";
			cancelBtn.append(cancelText);
			cancelBtn.addEventListener("click", closeShareDialog);

			var saveBtn = document.createElement("button");
			saveBtn.is = "emby-button";
			saveBtn.type = "button";
			saveBtn.className =
				"emby-button raised button-submit block btnSave formDialogFooterItem";
			var saveText = document.createElement("span");
			saveText.textContent = "Save";
			saveBtn.append(saveText);
			saveBtn.addEventListener("click", () => {
				var allUsernames = users.map((u) => u.Name);
				saveShareTags(itemId, userList, tags, allUsernames);
				closeShareDialog();
			});

			footer.append(cancelBtn);
			footer.append(saveBtn);
			innerContent.append(footer);
			scrollContent.append(innerContent);

			dialog.append(header);
			dialog.append(scrollContent);
			dialogContainer.append(dialog);

			document.body.append(backdrop);
			document.body.append(dialogContainer);

			dialogContainer.addEventListener("click", (e) => {
				if (e.target === dialogContainer) closeShareDialog();
			});
			backdrop.addEventListener("click", closeShareDialog);

			var escapeHandler = (e) => {
				if (e.key === "Escape") closeShareDialog();
			};
			document.addEventListener("keydown", escapeHandler);
		}

		/**
		 * Saves the selected share tags to the server.
		 */
		function saveShareTags(itemId, userList, existingTags, allUsernames) {
			var selectedUsernames = [];
			userList
				.querySelectorAll('input[type="checkbox"]:checked')
				.forEach((cb) => {
					selectedUsernames.push(cb.getAttribute("data-username"));
				});

			if (typeof Dashboard !== "undefined" && Dashboard.showLoadingMsg) {
				Dashboard.showLoadingMsg();
			}

			// Keep non-username tags, then add selected username tags
			var newTags = existingTags
				.filter(
					(tag) => !allUsernames.some((u) => stringEqualsIgnoreCase(u, tag)),
				)
				.concat(selectedUsernames);

			ApiClient.ajax({
				url: ApiClient.getUrl("Plugins/ShareWithUser/ShareTags"),
				type: "POST",
				contentType: "application/json",
				data: JSON.stringify({ itemId: itemId, tags: newTags }),
			})
				.then(() => {
					if (typeof Dashboard !== "undefined" && Dashboard.hideLoadingMsg) {
						Dashboard.hideLoadingMsg();
					}
				})
				.catch((err) => {
					if (typeof Dashboard !== "undefined" && Dashboard.hideLoadingMsg) {
						Dashboard.hideLoadingMsg();
					}
					console.error("[ShareWithUser] Failed to update tags:", err);
					if (typeof Dashboard !== "undefined" && Dashboard.alert) {
						Dashboard.alert({
							text: "Failed to update share tags (HTTP " + err.status + ").",
						});
					}
				});
		}

		/**
		 * Case-insensitive string comparison.
		 */
		function stringEqualsIgnoreCase(a, b) {
			return (a || "").toLowerCase() === (b || "").toLowerCase();
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
				if (container && container.classList.contains("dialogContainer")) {
					container.remove();
				} else {
					dialog.remove();
				}
			}

			var backdrop = document.querySelector(
				'[data-share-dialog-backdrop="true"]',
			);
			if (backdrop) backdrop.remove();
		}

		/**
		 * Injects the "Share with User..." menu item into a context menu.
		 * Only injects for media-type items (Movie, Episode, Book, Audio, etc.).
		 */
		function injectMenuItem(container) {
			var itemId = null;

			// Determine item ID first so we can check its type
			setTimeout(async () => {
				if (container.querySelector("[data-share-with-user]")) return;

				itemId = getItemId();
				if (!itemId) return;

				// Only show for media items
				var isMedia = await checkIsMediaType(itemId);
				if (!isMedia) return;

				var items = container.querySelectorAll(".actionSheetMenuItem");
				if (!items || items.length === 0) return;

				// Find "Edit metadata" item to insert before
				var editMetadataItem = null;
				for (var i = 0; i < items.length; i++) {
					var textSpan = items[i].querySelector(".actionSheetItemText");
					if (textSpan && textSpan.textContent.includes("Edit metadata")) {
						editMetadataItem = items[i];
						break;
					}
				}

				var shareBtn = document.createElement("button");
				shareBtn.setAttribute("data-share-with-user", "true");
				shareBtn.className =
					"listItem listItem-button actionSheetMenuItem emby-button";
				var iconSpan = document.createElement("span");
				iconSpan.className =
					"actionsheetMenuItemIcon listItemIcon listItemIcon-transparent material-icons";
				iconSpan.textContent = "share";
				var bodySpan = document.createElement("span");
				bodySpan.className = "listItemBody actionsheetListItemBody";
				var textSpan = document.createElement("span");
				textSpan.className = "listItemBodyText actionSheetItemText";
				textSpan.textContent = "Share with user";
				bodySpan.append(textSpan);
				shareBtn.append(iconSpan, bodySpan);

				shareBtn.addEventListener("click", () => {
					container.remove();
					var backdrops = document.querySelectorAll(".dialogBackdrop");
					for (var b = 0; b < backdrops.length; b++) backdrops[b].remove();

					showShareDialog(itemId);
				});

				if (editMetadataItem) {
					editMetadataItem.parentElement.insertBefore(
						shareBtn,
						editMetadataItem,
					);
				} else {
					items.at(-1).parentElement.append(shareBtn);
				}
			}, 100);
		}

		/**
		 * Initializes the plugin: tracks clicks and observes DOM for context menus.
		 */
		function init() {
			isAdmin().then((admin) => {
				if (!admin) return;

				// Track info button clicks to capture item ID
				document.addEventListener(
					"click",
					(e) => {
						var infoButton = e.target.closest(
							".infoButton, .paper-icon-button-light",
						);
						if (infoButton) {
							var parentCard = infoButton.closest(
								".card[data-id], .cardBox[data-id]",
							);
							if (parentCard) {
								var itemId = parentCard.getAttribute("data-id");
								if (itemId && isItemIdLike(itemId)) {
									lastTriggeredItemId = itemId;
									lastTriggeredTime = Date.now();
								}
							}
						}
					},
					true,
				);

				// Track focus for keyboard navigation
				document.addEventListener(
					"focus",
					(e) => {
						var parentCard = e.target.closest(
							".card[data-id], .cardBox[data-id]",
						);
						if (parentCard) {
							var itemId = parentCard.getAttribute("data-id");
							if (itemId && isItemIdLike(itemId)) {
								lastTriggeredItemId = itemId;
								lastTriggeredTime = Date.now();
							}
						}
					},
					true,
				);

				// Observe DOM for context menus
				var observer = new MutationObserver((mutations) => {
					mutations.forEach((mutation) => {
						if (mutation.addedNodes) {
							for (var i = 0; i < mutation.addedNodes.length; i++) {
								var node = mutation.addedNodes[i];
								if (
									node.nodeType === 1 &&
									node.classList &&
									node.classList.contains("dialogContainer")
								) {
									if (node.getAttribute("data-share-dialog")) return;
									injectMenuItem(node);
								}
							}
						}
					});
				});

				observer.observe(document.body, { childList: true, subtree: true });
			});
		}

		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", init);
		} else {
			init();
		}
	});
})();
