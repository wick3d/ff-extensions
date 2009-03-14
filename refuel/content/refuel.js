const STRF_EXTID = "st1refuel@noteitup.net";
const STRF_EXTPREF_BRANCH = "extensions.refuel.";
const STRF_DEVELOPMENT_MODE = true;

const STRF_EXT_PREFERENCES = Components.classes["@mozilla.org/preferences-service;1"]
                        .getService(Components.interfaces.nsIPrefService)
                        .getBranch(STRF_EXTPREF_BRANCH);
const STRF_EXT_PATH = Components.classes["@mozilla.org/extensions/manager;1"]
    .getService(Components.interfaces.nsIExtensionManager)
	.getInstallLocation(STRF_EXTID)
	.getItemLocation(STRF_EXTID).path;
const STRF_IO_SERVICE = Components.classes["@mozilla.org/network/io-service;1"]
                    .getService(Components.interfaces.nsIIOService);

const STRF_LOADER = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
    .getService(Components.interfaces.mozIJSSubScriptLoader);

var StRFBrowserListener = {
    QueryInterface: function(aIID)
    {
        if (   aIID.equals(Components.interfaces.nsIWebProgressListener)
            || aIID.equals(Components.interfaces.nsISupportsWeakReference)
            || aIID.equals(Components.interfaces.nsISupports))
        {
            return this;
            throw Components.results.NS_NOINTERFACE;            
        }
    },

    onStateChange: function(aWebProgress, aRequest, aFlag, aStatus)
    {
        // If you use myListener for more than one tab/window, use
        // aWebProgress.DOMWindow to obtain the tab/window which triggers the state change
        if (aFlag & STATE_START)
        {
            STRF_LOG("LoadEvent started");
        }
        
        if (aFlag & STATE_STOP)
        {
            STRF_LOG("LoadEvent ended");
        }
        
        return 0;
    },

    onLocationChange: function(aProgress, aRequest, aURI)
    {
        STRF_LOG("onLocationChange");
        refuel.processNewURL(aProgress, aURI);
        
        return 0;
    },

    onStateChange: function() {},
    onProgressChange: function() {},
    onStatusChange: function() {},
    onSecurityChange: function() {},
    onLinkIconAvailable: function() {}
};

var refuel = {
    oldURL: null,
    appcontent: null,
    doc: null,
    has_banned: false,
    valid_user: false,
    webservice: null,
    localstorage: null,
    current_url_hash: null,
    current_url_images: null,    

    init: function(e)
    {
        timeLine.log("init() called");
        
        STRF_LOADER.loadSubScript("chrome://refuel/content/utils.js");
        STRF_LOADER.loadSubScript("chrome://refuel/content/imagefinder.js");
        STRF_LOADER.loadSubScript("chrome://refuel/content/webservice.js");
        STRF_LOADER.loadSubScript("chrome://refuel/content/localstorage.js");
        
        this.checkVersion();        
        
        this.initialized = true;
        this.strings = document.getElementById("refuel-strings");
        this.appcontent = document.getElementById("appcontent");
        
        let target = this;

        /**
         * Init listeners
        **/
        document.getElementById("contentAreaContextMenu").addEventListener("popupshowing", function(e) {
            target.showContextMenu(e);
        }, false);
        
        gBrowser.addProgressListener(
            StRFBrowserListener,
            Components.interfaces.nsIWebProgress.NOTIFY_STATE_DOCUMENT
        );
        
        gBrowser.addEventListener("load", function(e) { target.onPageLoad(e); }, true);
        
        // var appcontent = document.getElementById("appcontent");   // browser
        // if (appcontent)
        //     appcontent.addEventListener("DOMContentLoaded", target.onPageLoad, true);        
        
        this.webservice = new StRFWebservice(STRF_EXT_PREFERENCES.getCharPref("apikey"));
        this.webservice.init();
        
        this.localstorage = new StRFLocalStorage(STRF_EXT_PREFERENCES.getCharPref("apikey"));
        this.localstorage.init();
        
        timeLine.log("init() done");
    },
    uninit: function(e)
    {
        gBrowser.removeProgressListener(StRFBrowserListener);
    },
    checkVersion: function()
    {
        let ver = -1;
        let firstRun = true;
        let gExtensionManager = Components.classes["@mozilla.org/extensions/manager;1"]
                                .getService(Components.interfaces.nsIExtensionManager);
        let currentVersion = gExtensionManager.getItemForID(STRF_EXTID).version;

        try {
            ver = STRF_EXT_PREFERENCES.getCharPref("version");
            firstRun = STRF_EXT_PREFERENCES.getBoolPref("firstrun");
        } catch(e) {
        } finally {
            if (firstRun)
            {
                STRF_EXT_PREFERENCES.setBoolPref("firstrun", false);
                STRF_EXT_PREFERENCES.setCharPref("version", currentVersion);

                this.doFirstRun();

                window.setTimeout(function() {
                    gBrowser.selectedTab = gBrowser.addTab("http://noteitup.net/");
                }, 1500);
            }

            if (ver != currentVersion && !firstRun)
            {
                STRF_EXT_PREFERENCES.setCharPref("version", currentVersion);
                this.doUpgrade();
            }
        }
    },
    doFirstRun: function()
    {
        STRF_LOG("doFirstRun");
    },
    doUpgrade: function()
    {
        STRF_LOG("doUpgrade");
    },
    processNewURL: function(aProgress, aURI)
    {
        STRF_LOG("ProcessNewURL: "+aURI.spec);
        
        if (aURI.spec == this.oldURL) {
            return;
        }

        this.oldURL = aURI.spec;

        this.has_banned = false;
    },
    onPageLoad: function(e)
    {
        if (e.originalTarget instanceof HTMLDocument)
        {
            this.doc = e.originalTarget;
        }

        if (this.doc == null) {
            return;
        }
        
        if (this.doc.location == null || this.doc.location.href == 'about:blank') {
            return;
        }
        
        let href_parts = this.doc.location.href.split('?');
        let hashed_url = StRFUtils.md5_encode(href_parts[0]);
        
        if (this.current_url_hash == hashed_url) {
            return;
        }
        
        this.current_url_hash = hashed_url;
        
        STRF_LOG("Check url '" + href_parts[0] + "' ("+this.current_url_hash+") from local db, then from service");

        this.current_url_images = StRFImageFinder.findAll(this.current_url_hash);
        //this.webservice.hasDataForPage(this.current_url_hash);
        
        if (this.current_url_images.length > 0) {
            //this.webservice.getDataForPage(this.current_url_hash, images_callback);
            this.webservice.checkForMatches(this.current_url_images, [this, this._ws_check_cb]);
            //this.localstorage.checkForMatches(this.current_url_images, this._ls_check_cb);
        }        
    },
    _ws_check_cb: function(data, status)
    {
        var self = this;
        var matched_images = [];
        dump('current_url_images.length: '+this.current_url_images.length+"\n");
        
        var has_images = StRWEvaluateXPath(data, "//has_images")[0].textContent;
        
        if (! has_images) {
            STRF_LOG("No images matched!");
            return;
        }
        
        var results = StRWEvaluateXPath(data, "//images/img");
        for (var i=0; i<results.length; i++)
        {
            var hash = results[i].attributes.getNamedItem("hash").textContent;
            
            for (var x=0; x<self.current_url_images.length; x++) {
                if (self.current_url_images[x].hash == hash) {
                    matched_images.push(self.current_url_images[x]);
                }
            }
        }
        
        STRF_LOG("matched_images.length: "+matched_images.length+"\n");
        
        this._updatePageImages(matched_images);
    },
    _ls_check_cb: function(data, status)
    {
        if (data.images.length == 0) {
            STRF_LOG("No images matched!");
            return;
        }
        
        this._updatePageImages(data.images);
    },
    _updatePageImages: function(images)
    {
        var self = this;
        
        for (var i=0; i<images.length; i++) {
            let hash = images[i].hash;
            let img = images[i].image;
            let style = this.doc.defaultView.getComputedStyle(img, null);
            let w = parseInt(style.width.replace('px', ''));
            let h = parseInt(style.height.replace('px', ''));
            
            if (w && h)
            {
                let timer = Components.classes["@mozilla.org/timer;1"]
                    .createInstance(Components.interfaces.nsITimer);
                
                timer.init({
                    observe: function() {
                        var frame = self.doc.createElement("div");
                        frame.setAttribute("id", 'refuel_banned_image_for_'+hash);
                        frame.setAttribute("class", 'refuel_banned_image');
                        frame.style.display = 'block';
                        frame.style.width = w + 'px';
                        frame.style.height = h + 'px';
                        frame.style.backgroundColor = '#ffffff';
                        frame.style.color = '#000000';
                        frame.innerHTML = "ReFuel Banned image!";
                        if (img.parentNode) {
                            img.parentNode.replaceChild(frame, img);
                        }
                }}, 0, timer.TYPE_ONE_SHOT);
            }
        }
        
        this.current_url_hash = null;
    },
    showContextMenu: function(event)
    {
        //document.getElementById("midgardffa-ctx-ffa-main").hidden = !this.is_midgard;
        document.getElementById("ctx-refuel-main").hidden = !gContextMenu.onImage;
        STRF_LOG("on image: "+gContextMenu.onImage);
        //gBrowser.removeEventListener("popupshowing");
    },
    onMenuItemCommand: function(e) {
      // var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
      //                               .getService(Components.interfaces.nsIPromptService);
      // promptService.alert(window, this.strings.getString("helloMessageTitle"),
      //                             this.strings.getString("helloMessage"));
    },
    onToolbarButtonCommand: function(e)
    {
        //imagebanner.onMenuItemCommand(e);
    },
    banImage: function(e)
    {
        dump("banImage:\n");
        for (let key in e) {
            dump("key: "+key+"\n");
            dump(e[key]+"\n");
        }
    }
};
window.addEventListener("load", function(e) { refuel.init(e); }, false);
window.addEventListener("unload", function(e) { refuel.uninit(e); }, false);

function STRF_LOG(text)
{
    if (! STRF_DEVELOPMENT_MODE) {
        return;
    }
    
    Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService)
    .logStringMessage(text);
}

/**
 * Time logging module, used to measure startup time.
 * @class
 */
var timeLine = {
    _lastTimeStamp: null,

    /**
    * Logs an event to console together with the time it took to get there.
    */
    log: function(/**String*/ msg)
    {
        if (! STRF_DEVELOPMENT_MODE) {
            return;
        }
        
        let now = (new Date()).getTime();
        let diff = this._lastTimeStamp ? (now - this._lastTimeStamp) : "first event";
        this._lastTimeStamp = now;

        let padding = [];
        for (var i = msg.toString().length; i < 40; i++) padding.push(" ");
        
        dump("IB timeline: " + msg + padding.join("") + "\t (" + diff + ")\n");
    }
};