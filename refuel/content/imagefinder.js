const STRF_FP_HANDLER = Components.classes["@mozilla.org/network/protocol;1?name=file"]
                    .createInstance(Components.interfaces.nsIFileProtocolHandler);
const STRF_CACHE_SESSION = Components.classes["@mozilla.org/network/cache-service;1"]
                    .getService(Components.interfaces.nsICacheService).createSession("HTTP", 0, true);

var StRFImageFinder = {
    hash_prefix: null,
    documentList: null,
    allImages: null,
    imageDatas: null,
    
    findAll: function(hash_prefix)
    {
        var self = this;
        
        this.hash_prefix = hash_prefix;
        this.allImages = [];
        this.imageDatas = [];
        this.documentList = this._getDocuments(gBrowser.browsers[gBrowser.mTabBox.selectedIndex].contentWindow, new Array());
        
        for (i=0; i<this.documentList.length; i++)
        {
    		documentImageList = this.documentList[i].getElementsByTagName('img');

            for (j=0; j<documentImageList.length; j++) {
                this.allImages.push(documentImageList[j]);
            }
        }
        
    	for (let [i, dl] in Iterator(this.documentList))
    	{
    	    dlImages = dl.getElementsByTagName('img');
    	    for (j=0; j<dlImages.length; j++) {
                self.allImages.push(dlImages[j]);
            }
	    }
        
        if (this.allImages.length == 0) {
            return this.imageDatas;
        }
        
    	this.allImages = this._cleanUp(this.allImages);
    	
    	for (let [i, image] in Iterator(this.allImages))
    	{
    	    var src = image.src;
    	    var name = src.substring(src.lastIndexOf('/') + 1, src.length);
    	    
    	    var imageData = {
    	        image: image,
    	        src: src,
    	        name: name,
    	        ext: name.substring(name.lastIndexOf('.') + 1, name.length).toLowerCase(),
    	        file: null,
    	        filesize: null,
    	        hash: StRFUtils.md5_encode(self.hash_prefix + src)
    	    };
    	    
    	    try {
                imageData.file = STRF_CACHE_SESSION.openCacheEntry(imageData.src, Components.interfaces.nsICache.ACCESS_READ, false);
                if (imageData.file) {
                    imageData.filesize = imageData.file.dataSize;
                }
             } catch(cache_error) {
                 try {
                     imageData.file = STRF_FP_HANDLER.getFileFromURLSpec(imageData.src);

                     if (imageData.file && imageData.file.exists() && imageData.file.isFile()) {
                         imageData.filesize = imageData.file.fileSize;
                     }
                 } catch(file_error) {
                     if (imageData.ext == "gif" || imageData.ext == "jpg" || imageData.ext == "png") {
                         STRF_LOG("getDelayedFileSize for "+imageData.src);
                     }
                 }
             }
             
             STRF_LOG("found image "+imageData.name+" ext: "+imageData.ext+". fs: "+imageData.filesize+". ["+imageData.image.width+"x"+imageData.image.height+"] hash: "+imageData.hash+". ("+imageData.src+")");
             
             this.imageDatas.push(imageData);
	    }
        
        return this.imageDatas;
    },
    _getDocuments: function(frame, documentList)
    {
        let framesList = frame.frames;

        if (framesList.length == 0) {
    	    documentList.push(frame.document);
    	} else {
    	    for (i=0; i < framesList.length; i++) {
    		    documentList.push(framesList[i].document);
    	    }
    	}

        return documentList;
    },
    _cleanUp: function(list)
    {
        STRF_LOG("Cleanup");
        let cleanedList = [];
        list.sort(this._itemSorter);
        
        for (i=0; i<list.length; i++)
        {
            if (i+1 < list.length && list[i].src == list[i+1].src) {
                continue;
            }

            cleanedList.push(list[i]);
        }

        return cleanedList;
    },
    _itemSorter: function(a, b)
    {
        let aSrc = a.src;
        let bSrc = b.src;

        var sv = 1;
        if (aSrc == bSrc) sv = 0;
        else if (aSrc < bSrc) sv = 1;

        return sv;
    }
}