const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Home.jsm");
Cu.import("resource://gre/modules/HomeProvider.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyGetter(this, "Pocket", function() {
  let win = Services.wm.getMostRecentWindow("navigator:browser");
  if (win.Pocket) {
    return win.Pocket;
  }
  Services.scriptloader.loadSubScript("chrome://pocketpanel/content/pocket.js", win);
  return win.Pocket;
});

XPCOMUtils.defineLazyGetter(this, "Strings", function() {
  return Services.strings.createBundle("chrome://pocketpanel/locale/pocket.properties");
});

XPCOMUtils.defineLazyGetter(this, "Reader", function() {
  return Services.wm.getMostRecentWindow("navigator:browser").Reader;
});

const ADDON_ID = "pocket.panel@margaretleibovic.com";

// Unique IDs for panel and dataset.
const PANEL_ID = "pocket.panel@margaretleibovic.com";
const DATASET_ID = "pocket.dataset@margaretleibovic.com";

function optionsCallback() {
  return {
    title: Strings.GetStringFromName("panel.title"),
    views: [{
      type: Home.panels.View.LIST,
      dataset: DATASET_ID,
      onrefresh: refreshDataset
    }]
  };
}

function openPocketPanel() {
  Services.wm.getMostRecentWindow("navigator:browser").BrowserApp.addTab("about:home?panel=" + PANEL_ID);
}

function refreshDataset() {
  if (Pocket.isAuthenticated) {
    Pocket.getList(saveList);
  } else {
    Pocket.getHits(saveItems);
  }
}

function saveList(list) {
  let items = [];

  for (let id in list) {
    let item = list[id];
    items.push({
      title: item.resolved_title,
      description: item.excerpt,
      // Open URLs in reader mode
      url: "about:reader?url=" + encodeURIComponent(item.resolved_url)
    });
  }

  saveItems(items);
}

function saveItems(items) {
  Task.spawn(function() {
    let storage = HomeProvider.getStorage(DATASET_ID);
    yield storage.deleteAll();
    yield storage.save(items);
  }).then(null, e => Cu.reportError("Error saving Pocket items to HomeProvider: " + e));
}

function deleteItems() {
  Task.spawn(function() {
    let storage = HomeProvider.getStorage(DATASET_ID);
    yield storage.deleteAll();
  }).then(null, e => Cu.reportError("Error deleting Pocket items from HomeProvider: " + e));
}

function optionsDisplayed(doc, topic, id) {
  if (id != ADDON_ID) {
    return;
  }

  let button = doc.getElementById("auth-button");
  updateButton(button);

  button.addEventListener("click", function(e) {
    if (Pocket.isAuthenticated) {
      // Log out
      Pocket.clearAccessToken();
      refreshDataset();
      updateButton(button);
    } else {
      // Log in
      Pocket.authenticate(function() {
        refreshDataset();
        updateButton(button);
      });
    }
  });
}

function updateButton(button) {
  if (Pocket.isAuthenticated) {
    button.setAttribute("label", Strings.GetStringFromName("logOut"));
  } else {
    button.setAttribute("label", Strings.GetStringFromName("logIn"));
  }
}

/**
 * bootstrap.js API
 */
function startup(aData, aReason) {
  // Always register panel on startup.
  Home.panels.register(PANEL_ID, optionsCallback);

  switch(aReason) {
    case ADDON_ENABLE:
    case ADDON_INSTALL:
      Home.panels.install(PANEL_ID);
      refreshDataset();
      break;

    case ADDON_UPGRADE:
    case ADDON_DOWNGRADE:
      Home.panels.update(PANEL_ID);
      break;
  }

  if (aReason == ADDON_INSTALL) {
    openPocketPanel();
  }

  // Update data once every hour.
  HomeProvider.addPeriodicSync(DATASET_ID, 3600, refreshDataset);

  Services.obs.addObserver(optionsDisplayed, AddonManager.OPTIONS_NOTIFICATION_DISPLAYED, false);
}

function shutdown(aData, aReason) {
  if (aReason == ADDON_UNINSTALL || aReason == ADDON_DISABLE) {
    Home.panels.uninstall(PANEL_ID);
    deleteItems();

    // Authentication UI currently broken because of bug 997328
    //Home.panels.setAuthenticated(PANEL_ID, false);
    Pocket.clearAccessToken();
  }

  Home.panels.unregister(PANEL_ID);

  Services.obs.removeObserver(optionsDisplayed, AddonManager.OPTIONS_NOTIFICATION_DISPLAYED);
}

function install(aData, aReason) {}

function uninstall(aData, aReason) {}
