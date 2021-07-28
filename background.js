/* Make context menu items */
browser.menus.create({
    id: "pop-this-tab",
    title: browser.i18n.getMessage("pop-this-tab"),
    contexts: ["tab"],
    onclick: async (info, tab) => { pop_this_tab(tab) }
});
browser.menus.create({
    id: "pop-tabs-to-the-right",
    title: browser.i18n.getMessage("pop-tabs-to-the-right"),
    contexts: ["tab"],
    onclick: async (info, tab) => { pop_tabs_to_the_right(tab) }
});
browser.menus.create({
    id: "pop-highlighted-tabs",
    title: browser.i18n.getMessage("pop-highlighted-tabs"),
    contexts: ["tab"],
    onclick: async (info, tab) => { pop_highlighted_tabs(tab.windowId) }
});

/* menus.onShown listener to disable actions when they're useless.
 *
 * pop-this-tab:
 *   useless if no other tabs -> enabled if there's more than 1 tab
 * pop-tabs-to-the-right:
 *   useless for leftmost tab -> enabled if tab's index is > 0
 *   redundant for rightmost tab -> enabled if tab's index is < (length-1)
 * pop-highlighted-tabs:
 *   useless if no tabs are highlighted -> enabled if hl_tabs.length >= 1
 *   useless if all tabs are highlighted -> enabled if hl_tabs.length < cur
 */
var poptabs_next_menuid = 1; // A unique ID for the next menu instance
var poptabs_last_menuid = 0; // ID of the most recently-shown menu instance
browser.menus.onShown.addListener(async (info, tab) => {
    // Take next_menuid for the current instance; post-increment next_menuid
    var menuid = poptabs_next_menuid++;
    // The current instance is now the last-seen menuid.
    poptabs_last_menuid = menuid;
    // XXX: do we need to check for hidden/pinned tabs here?
    const win_tabs = await browser.tabs.query({ windowId: tab.windowId });
    const hl_tabs = win_tabs.filter(t => t.highlighted);
    // Back from await - if this menu isn't the one being shown anymore, bail out
    if (menuid !== poptabs_last_menuid) { return; }
    // We're good, update & refresh the menu.
    browser.menus.update("pop-this-tab",
        { enabled: (win_tabs.length > 1) });
    browser.menus.update("pop-tabs-to-the-right",
        { enabled: ((tab.index > 0) && (tab.index < win_tabs.length-1)) });
    browser.menus.update("pop-highlighted-tabs",
        { enabled: ((hl_tabs.length >= 1) && (hl_tabs.length < win_tabs.length)) });
    browser.menus.refresh();
});

/* Helper function to get the current tab, since onCommand callbacks don't
 * get a `tab` object like menu.onClick does. */
async function get_current_tab() {
    return browser.tabs.query({currentWindow: true, active: true})
                       .then(matched_tabs => matched_tabs[0]);
}

/* Set up keyboard command listener(s).
 *
 * IMHO it makes sense to have the "pop-this-tab" keyboard command actually pop
 * all highlighted tabs - the active tab is (AFAICT) always highlighted, and I
 * can't think of any case where a user would highlight multiple tabs, and then
 * want to *only* pop the active one. (Good thing, too, because I really can't
 * seem to find a third usable keyboard shortcut for "pop-highlighted-tabs".
 *
 * Still, there might be a use case (or user preference?) for this to be a "pop
 * active tab only" shortcut, so I'm going to leave this variable in place to
 * switch behavior if needed.
 */
var pop_this_tab_pops_highlighted = true;

browser.commands.onCommand.addListener(async (command) => {
    if ((pop_this_tab_pops_highlighted) && (command === "pop-this-tab")) {
        command = "pop-highlighted-tabs";
    }
    if (command === "pop-this-tab") {
        pop_this_tab(await get_current_tab());
    } else if (command === "pop-tabs-to-the-right") {
        pop_tabs_to_the_right(await get_current_tab());
    } else if (command === "pop-highlighted-tabs") {
        pop_highlighted_tabs(await get_current_tab().then(tab => tab.windowId));
    }
});

/* Command handlers. These find the tab(s) to be moved and check for useless
 * actions, then pass the actual list of tabs to `pop_tabs()` */
async function pop_this_tab(tab) {
    const win_tabs = await browser.tabs.query({ windowId: tab.windowId });
    if (win_tabs.length == 1) {
        console.info("pop_this_tab: this is the only tab; ignoring");
    } else {
        return pop_tabs([tab]);
    }
}
async function pop_tabs_to_the_right(tab) {
    const win_tabs = await browser.tabs.query({ windowId: tab.windowId });
    const right_tabs = win_tabs.filter(t => (t.index >= tab.index));
    if (right_tabs.length == 0) {
        console.error("pop_tabs_to_the_right: no tabs to move??");
    } else if (right_tabs.length == win_tabs.length) {
        console.info("pop_tabs_to_the_right: no tabs to the left; ignoring");
    } else {
        return pop_tabs(right_tabs);
    }
}
async function pop_highlighted_tabs(windowId) {
    const win_tabs = await browser.tabs.query({ windowId: windowId });
    const hl_tabs = win_tabs.filter(t => t.highlighted);
    if (hl_tabs.length == 0) {
        console.info("pop_highlighted_tabs: no highlighted tabs; ignoring");
    } else if (hl_tabs.length == win_tabs.length) {
        console.info("pop_highlighted_tabs: all tabs highlighted; ignoring");
    } else {
        return pop_tabs(hl_tabs);
    }
}

/* Here's where we actually pop a list of tabs into a new window.
 * No checking or sorting happens here.
 * tabs[0] gets moved to a new window with `browser.windows.create()`,
 * then the rest of the tabs get moved there via `browser.tabs.move()`.
 * Returns the new window's windowId.
 */
async function pop_tabs(tabs) {
    console.debug(`pop_tabs: ${tabs.length} tab${tabs.length == 1 ? '' : 's'} to pop`);
    if (tabs.length == 0) { return; }
    const tab1 = tabs.shift();
    const new_win = await browser.windows.create({ tabId: tab1.id });
    if (tabs.length > 0) {
        await browser.tabs.move(tabs.map(t => t.id), { windowId: new_win.id, index: 1 });
    }
    return new_win.id;
}
