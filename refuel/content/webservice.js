const STRF_WEBSERVICE_URL = "http://refuel.nemein.net/tehdas/api/";
const STRF_WEBSERVICE_PORT = 80;

// const STRF_NATIVEJSON = Components.classes["@mozilla.org/dom/json;1"]
//     .createInstance(Components.interfaces.nsIJSON);
const STRF_XMLSERIALIZER = Components.classes["@mozilla.org/xmlextras/xmlserializer;1"]
    .createInstance(Components.interfaces.nsIDOMSerializer);
const STRF_XMLPARSER = Components.classes["@mozilla.org/xmlextras/domparser;1"]
    .createInstance(Components.interfaces.nsIDOMParser);

function StRWEvaluateXPath(aNode, aExpr)
{
    var xpe = new XPathEvaluator();
    var nsResolver = xpe.createNSResolver(aNode.ownerDocument == null ? aNode.documentElement : aNode.ownerDocument.documentElement);
    var result = xpe.evaluate(aExpr, aNode, nsResolver, 0, null);
    var found = [];
    var res;
    while (res = result.iterateNext())
        found.push(res);

    return found;
}


var StRFWebservice = function(apikey) {
    var _apikey = apikey;
    
    return {
        init: function()
        {
            STRF_LOG("Webservice init with apikey "+_apikey);
        },
        hasDataForPage: function(page_hash, callback)
        {
            STRF_LOG("Webservice::hasDataForPage "+page_hash);
            
            var self = this;
            var listener = {
                finished : function(data, status)
                {
                    var results = StRWEvaluateXPath(data, "//has_images");                    
                    var attr_results = StRWEvaluateXPath(results[0], "//@page");
                    if (results[0].textContent == 1)
                    {
                        STRF_LOG("has images for page: "+attr_results[0].textContent);
                    } else {
                        STRF_LOG("doesn't have images for page: "+attr_results[0].textContent);
                    }
                }
            };
            
            this._executeRequest(this._generateRequestUrl('hasPage', [page_hash]), listener);
        },
        getDataForPage: function(page_hash, callback)
        {
            STRF_LOG("Webservice::getDataForPage "+page_hash);
            
            var self = this;
            var listener = {
                finished : function(data, status)
                {
                    if (callback !== undefined) {
                        if (typeof callback == 'object') {                         
                            callback[0].apply(callback[1], [data, status]);
                        } else {
                            callback.apply(callback, [data, status]);
                        }
                    }
                }
            };
            
            this._executeRequest(this._generateRequestUrl('images', [page_hash, 'list']), listener);
        },
        checkForMatches: function (images, callback)
        {
            STRF_LOG("Webservice::checkForMatches");
            
            var self = this;
            var listener = {
                finished: function(data, status)
                {                    
                    if (callback !== undefined) {
                        if (typeof callback == 'object') {                         
                            callback[1].apply(callback[0], [data, status]);
                        } else {
                            callback.apply(callback, [data, status]);
                        }
                    }
                }
            };
            
            var hashes = [];
            if (typeof images[0] == 'object') {
                for (let [i, image] in Iterator(images)) {
                    hashes.push(image.hash);
                }
            } else {
                hashes = images;
            }
            
            this._executeRequest(this._generateRequestUrl('images', ['check']), listener, 'post', {
                images: hashes
            });
        },
        reportImage: function(image_data, callback)
        {
            STRF_LOG("Webservice::reportImage");
            
            var self = this;
            var listener = {
                finished: function(data, status)
                {      
                    var xml = STRF_XMLSERIALIZER.serializeToString(data);
                    dump('xml: '+xml+"\n");
                    dump(data.documentElement.nodeName == "parsererror" ? "error while parsing\n" : data.documentElement.nodeName+"\n");
                    
                    if (callback !== undefined) {
                        if (typeof callback == 'object') {                         
                            callback[1].apply(callback[0], [data, status]);
                        } else {
                            callback.apply(callback, [data, status]);
                        }
                    }
                }
            };
            
            this._executeRequest(this._generateRequestUrl('report'), listener, 'post', image_data);
        },
        _generateRequestUrl: function(action, attrs)
        {
            let url = STRF_WEBSERVICE_URL + _apikey + '/';
            url += action + '/';
            
            if (typeof attrs === undefined) {
                return url;
            }
            
            for (var k in attrs) {
                url += attrs[k] + '/';
            }
            
            return url;
        },
        _executeRequest: function(url, listener, method, data)
        {
            if (method === undefined) {
                method = 'get';
            }
            
            var req = new XMLHttpRequest();
            var postdata = null;
            
            if (data !== undefined)
            {
                if (method.toLowerCase() == 'post')
                {
                    postdata = '';
                       
                    for (var key in data)
                    {
                        var key_val_pair = key + '=' + data[key];
                        
                        if (typeof data[key] == 'object') {
                            var kp = key + '[]';
                            key_val_pair = '';
                            for (var k in data[key]) {
                                key_val_pair += kp + '=' + data[key][k] + '&';
                            }
                            
                            key_val_pair = key_val_pair.substring(0, key_val_pair.length - 1);
                        }
                        
                        postdata += key_val_pair + '&';
                    }
                    
                    postdata = postdata.substring(0, postdata.length - 1);
                }
                else
                {
                    url += (url.match(/\?/) == null ? '?' : '&');
                    
                    for (var key in data) {
                        url += key + '=' + urlencode(data[key]) + '&';
                    }
                }
            }
            
            if (url.substr(url.length - 1, 1) == '&') {
                url = url.substring(0, url.length - 1);
            }
            
            url += (url.match(/\?/) == null ? '?' : '&') + (new Date()).getTime();
            
            STRF_LOG(method.toUpperCase() + ' to url: '+url+"\n");
            STRF_LOG('postdata: '+postdata+"\n");
            
            req.open(method.toUpperCase(), url, true);
            
            req.onreadystatechange = function(aEvt) {  
                if (req.readyState == 4)
                {
                    if (req.status == 200) {
                        //req.responseXML | req.responseText
                        listener.finished(req.responseXML, req.status);                     
                    } else {
                        dump("Error loading page\n");
                        dump(req.status+"\n");
                        dump(req.responseXML+"\n");
                        dump(req.responseText+"\n");
                    }
                }  
            };
            
            req.setRequestHeader("X-Requested-With", "XMLHttpRequest");
            req.setRequestHeader("Content-Type", 'application/x-www-form-urlencoded');
            req.overrideMimeType('text/xml');
            
            try {
                req.send(postdata);
            } catch (e) {
                dump("Exception when sending request: \n");
                dump(e);
            }            
        }
    };
}