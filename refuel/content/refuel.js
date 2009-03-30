const STRF_EXTID = "st1refuel@noteitup.net";
const STRF_EXTPREF_BRANCH = "extensions.refuel.";
const STRF_DEVELOPMENT_MODE = true;

const STRF_CAMPAIGN_URL = "http://noteitup.net/en/";

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
const STRF_STYLESHEET_SERVICE = Components.classes["@mozilla.org/content/style-sheet-service;1"]
    .getService(Components.interfaces.nsIStyleSheetService);
const STRF_LOCALFILE = Components.classes["@mozilla.org/file/local;1"];
const STRF_DIRSERVICE = Components.classes["@mozilla.org/file/directory_service;1"]
    .getService(Components.interfaces.nsIProperties);

var sep = '/';
if ((STRF_DIRSERVICE).get("ProfD", Components.interfaces.nsIFile).path.search(/\\/) != -1)  {
	sep = "\\";
} else {
	sep = "/";
}
const STRF_FILE_SEPARATOR = sep;

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
    enabled: true,
    oldURL: null,
    appcontent: null,
    doc: null,
    has_banned: false,
    valid_user: false,
    webservice: null,
    localstorage: null,
    current_url_hash: null,
    current_url_images: null,
    all_images: null,
    tmp_all_images: null,
    
    /**
     * Initializes the components
     * Called from window.onLoad
     *
     * @params event e onLoad event
     * @return void
    **/
    init: function(e)
    {
        STRF_TIMELINE.log("init() called");
        
        //Load necessary files
        STRF_LOADER.loadSubScript("chrome://refuel/content/utils.js");
        STRF_LOADER.loadSubScript("chrome://refuel/content/imagefinder.js");
        STRF_LOADER.loadSubScript("chrome://refuel/content/webservice.js");
        STRF_LOADER.loadSubScript("chrome://refuel/content/localstorage.js");
        
        this.all_images = {};
        this.tmp_all_images = [];
        
        //Create webservice and localstorage objects (not usuable at this point)
        this.webservice = new StRFWebservice(STRF_EXT_PREFERENCES.getCharPref("apikey"));
        this.localstorage = new StRFLocalStorage(STRF_EXT_PREFERENCES.getCharPref("apikey"));
        
        //Check extension version. Runs firstInstall or upgrader if needed
        this.checkVersion();
        
        //Initialize webservice
        this.webservice.init();
        
        //Initialize localStorage
        this.localstorage.init();
        
        //Attach stylesheet for image replacements
        var uri = STRF_IO_SERVICE.newURI("chrome://refuel/skin/refuel.css", null, null);
                
        // var uri = STRF_LOCALFILE.createInstance(Components.interfaces.nsILocalFile);
        // uri.initWithPath(STRF_EXT_PATH + STRF_FILE_SEPARATOR + "chrome" + STRF_FILE_SEPARATOR + 'skin' + STRF_FILE_SEPARATOR + 'refuel.js');
        // ios.newURI("chrome://myext/content/myext.css", null, null);
        
        if (! STRF_STYLESHEET_SERVICE.sheetRegistered(uri, STRF_STYLESHEET_SERVICE.USER_SHEET)) {
            STRF_STYLESHEET_SERVICE.loadAndRegisterSheet(uri, STRF_STYLESHEET_SERVICE.USER_SHEET);
        }
        
        let target = this;
        
        /**
         * Add event listeners
        **/
        document.getElementById("contentAreaContextMenu").addEventListener("popupshowing", function(e) {
            target.showContextMenu(e);
        }, false);        
        gBrowser.addProgressListener(
            StRFBrowserListener,
            Components.interfaces.nsIWebProgress.NOTIFY_STATE_DOCUMENT
        );        
        gBrowser.addEventListener("load", function(e) { target.onPageLoad(e); }, true);
        
        this.strings = document.getElementById("refuel-strings");
        this.appcontent = document.getElementById("appcontent");
        
        this.initialized = true;
        
        STRF_TIMELINE.log("init() done");
    },

    /**
     * Uninitializes the components
     * Called from window.onUnload
     *
     * @params event e onUnload event
     * @return void
    **/    
    uninit: function(e)
    {
        let target = this;
        
        gBrowser.removeProgressListener(StRFBrowserListener);
        gBrowser.removeEventListener("load", function(e) { refuel.init(e); }, false);
    },

    /**
     * Checks version of the component and runs necessary
     * methods
     *
     * @see refuel.doFirstRun
     * @see refuel.doUpgrade
     *
     * @returns void
    **/
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
        
        this.localstorage.prepareDatabase();
    },
    doUpgrade: function()
    {
        STRF_LOG("doUpgrade");
        
        this.localstorage.prepareDatabase();
    },
    processNewURL: function(aProgress, aURI)
    {
        STRF_LOG("ProcessNewURL: "+aURI.spec);
        
        if (! this.enabled) {
            return;
        }
        
        if (aURI.spec == this.oldURL) {
            return;
        }

        this.oldURL = aURI.spec;

        this.has_banned = false;
    },
    onPageLoad: function(e)
    {
        STRF_LOG('onPageLoad');
        
        if (! this.enabled) {
            return;
        }
        
        let doc = null;
        
        if (e.type) {
            if (e.originalTarget instanceof HTMLDocument) {
                doc = e.originalTarget;
            }            
        } else {
            doc = e;
        }

        if (doc == null) {
            return;
        }
        
        if (doc.location == null || doc.location.href == 'about:blank') {
            return;
        }
        
        STRF_LOG('this.doc.location.href: '+doc.location.href);
        STRF_LOG('this.oldURL: '+this.oldURL);
        if (doc.location.href != this.oldURL) {
            STRF_LOG('urls dont match!');            
            return;
        }
        
        this.doc = doc;
        
        let href_parts = this.doc.location.href.split('?');
        let hashed_url = StRFUtils.md5_encode(href_parts[0]);
        
        if (this.current_url_hash == hashed_url) {
            return;
        }
        
        this.current_url_hash = hashed_url;
        
        STRF_LOG("Check url '" + href_parts[0] + "' ("+this.current_url_hash+") from local db, then from service");

        this.current_url_images = StRFImageFinder.findAll(this.current_url_hash, href_parts[0]);
        if (this.current_url_images.length > 0) {            
            this.localstorage.checkForMatches(this.current_url_images, [this, this._ls_check_cb]);            
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
            
            let banData = {
                hash: hash,
                src: results[i].attributes.getNamedItem("src").textContent,
                weight: 0,//results[i].attributes.getNamedItem("weight").textContent
                reporter_id: results[i].attributes.getNamedItem("reporter_id").textContent,
                reporter_name: ''//results[i].attributes.getNamedItem("reporter_name").textContent
            };
            
            self._findMatchingImages(hash, matched_images, results.length, banData);
        }
        
        STRF_LOG("matched_images.length: "+matched_images.length+"\n");
        
        this._updatePageImages(matched_images);
    },
    _ls_check_cb: function(data, status)
    {
        if (data.length == 0) {
            STRF_LOG("No images matched in localStorage!");
            this.webservice.checkForMatches(this.current_url_images, [this, this._ws_check_cb]);
            return;
        }
        
        var self = this;
        var parsed_images = [];
        
        for (var i=0; i<data.length; i++)
        {
            var hash = data[i].hash;
            STRF_LOG("Report response hash["+i+"]: "+hash);
            
            self._findMatchingImages(hash, parsed_images, data.length, data[i]);
        }
        
        this._updatePageImages(parsed_images);
        
        //this.webservice.checkForMatches(this.current_url_images, [this, this._ws_check_cb]);
    },
    _ws_report_cb: function(data, status)
    {
        var self = this;
        var parsed_images = [];
        
        var results = StRWEvaluateXPath(data, "//images/img");
        
        for (var i=0; i<results.length; i++)
        {
            var hash = results[i].attributes.getNamedItem("hash").textContent;
            
            let banData = {
                hash: hash,
                src: results[i].attributes.getNamedItem("src").textContent,
                weight: 0,//results[i].attributes.getNamedItem("weight").textContent
                reporter_id: results[i].attributes.getNamedItem("reporter_id").textContent,
                reporter_name: ''//results[i].attributes.getNamedItem("reporter_name").textContent
            };
            
            STRF_LOG("Report response hash["+i+"]: "+hash);
            STRF_LOG("Report response src["+i+"]: "+results[i].attributes.getNamedItem("src").textContent);
            
            self._findMatchingImages(hash, parsed_images, results.length, banData);
        }
        
        STRF_LOG('parsed_images.length: '+parsed_images.length);
        
        this._updatePageImages(parsed_images);
    },
    _findMatchingImages: function(hash, parsed_images, total_count, banData)
    {
        for (var x=0; x<this.current_url_images.length; x++)
        {
            STRF_LOG("Report current_url_images x: "+x);
            STRF_LOG("Report current_url_images hash["+x+"]: "+this.current_url_images[x].hash);
            STRF_LOG("Report current_url_images src["+x+"]: "+this.current_url_images[x].src);
            
            if (this.current_url_images[x].hash == hash) {
                this.current_url_images[x].bd = banData;
                parsed_images.push(this.current_url_images[x]);

                if (parsed_images.length == total_count) {
                    STRF_LOG("Report ALL FOUNDED!");
                    return true;
                }
            }                
        }
        
        return false;
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
            
            let banData = images[i].bd;
            
            if (w && h)
            {
                let timer = Components.classes["@mozilla.org/timer;1"]
                    .createInstance(Components.interfaces.nsITimer);
                
                timer.init({
                    observe: function() {
                        var frame = self.doc.createElement('div');
                        frame.setAttribute('id', 'refuel_banned_image_for_'+hash);
                        frame.setAttribute('class', 'refuel_banned_image');
                        frame.setAttribute('title', banData.reporter_name + ' on 12.01.2009 12:30');
                        frame.style.display = 'block';
                        frame.style.width = w + 'px';
                        frame.style.height = h + 'px';
                        
                        var banner = self.doc.createElement('div');
                        banner.setAttribute('class', 'refuel_banned_image_banner');
                        
                        var banner_name = self.doc.createElement('div');
                        banner_name.setAttribute('class', 'refuel_banned_image_banner_name');
                        banner_name.innerHTML = banData.reporter_name;
                        banner.appendChild(banner_name);
                        
                        var banner_date = self.doc.createElement('div');
                        banner_date.setAttribute('class', 'refuel_banned_image_banner_date');
                        banner_date.innerHTML = '12.01.2009 12:30';
                        banner.appendChild(banner_date);
                        
                        if (banData.weight > 0) {
                            var banner_weight = self.doc.createElement('div');
                            banner_weight.setAttribute('class', 'refuel_banned_image_banner_weight');
                            banner_weight.innerHTML = '('+banData.weight+')';
                            banner.appendChild(banner_weight);                            
                        }
                        
                        var banner_link = self.doc.createElement('a');
                        banner_link.setAttribute('class', 'refuel_banned_image_banner_link');
                        banner_link.setAttribute('href', STRF_CAMPAIGN_URL);
                        banner_link.innerHTML = 'Banner Profile';
                        banner.appendChild(banner_link);
                        
                        frame.appendChild(banner);
                        
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
        document.getElementById("ctx-refuel-main-ban").hidden = !gContextMenu.onImage;
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
    toggleStatus: function(e)
    {
        this.enabled = !this.enabled;
		STRF_EXT_PREFERENCES.setBoolPref('enabled', this.enabled);

		this._updateStatusImage();
    },
    banImage: function(e)
    {
        STRF_LOG("banImage:\n");
        
        var target = document.popupNode;
        
        //TODO: Check that target really is image
        
        var imageToBan = {
            src: null,
            hash: null,
            referer_hash: '',
            referer_url: ''
        };
        
        var hash = null;
        if (target['src'] !== 'undefined') {
            STRF_LOG('target.src: '+target.src);
            var hash = StRFUtils.md5_encode(target.src);
        }
        var refererhash = null;
        var refererurl = null;
        STRF_LOG('find hash: '+hash);
        
        for (var x=0; x<this.current_url_images.length; x++)
        {
            STRF_LOG('checking against: '+this.current_url_images[x].hash);
            
            if (this.current_url_images[x].hash == hash) {
                refererhash = this.current_url_images[x].refererhash;
                refererurl = this.current_url_images[x].refererurl;
            }
        }
        
        STRF_LOG('Using Referer hash: '+refererhash);
        STRF_LOG('Using Referer url: '+refererurl);
        
        if (target['src'] !== 'undefined') {
            imageToBan.src = target.src;
            imageToBan.hash = hash;
            if (refererhash != null) {
                imageToBan.referer_hash = refererhash;
            }
            if (refererurl != null) {
                imageToBan.referer_url = refererurl;
            }
        }
        
        for (let key in imageToBan) {
            STRF_LOG("key: "+key+"\n");
            STRF_LOG(imageToBan[key]+"\n");
        }
        
        var lsData = {
            src: imageToBan.src,
            hash: imageToBan.hash,
            reporter: {
                id: 0,
                name: 'Reporter Name Here',
            },
        };
        var lsStatus = this.localstorage.addBan(lsData);        
        STRF_LOG('Ban added to localstorage with status '+lsStatus);
        
        this.webservice.reportImage(imageToBan, [this, this._ws_report_cb]);
    },
    _updateStatusImage: function()
    {
        STRF_LOG('_updateStatusImage');
        STRF_LOG(document.getElementById('refuelStatusBarPanelImage'));
        
        document.getElementById('refuelStatusBarPanelImage').setAttribute(
			'src',
			'chrome://refuel/skin/RE_16x16_' + (this.enabled ? 'green' : 'gray') + '.png'
		);
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
var STRF_TIMELINE = {
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
        
        dump("STRF timeline: " + msg + padding.join("") + "\t (" + diff + ")\n");
    }
};