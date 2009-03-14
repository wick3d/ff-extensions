const STRF_DIRSERVICE = new Components.Constructor("@mozilla.org/file/directory_service;1","nsIProperties");

const STRF_LOCALFILE = Components.classes["@mozilla.org/file/local;1"];
const STRF_FOSTREAM = Components.classes["@mozilla.org/network/file-output-stream;1"]

var sep = '/';
if ((new STRF_DIRSERVICE()).get("ProfD", Components.interfaces.nsIFile).path.search(/\\/) != -1)  {
	sep = "\\";
} else {
	sep = "/";
}
const STRF_FILE_SEPARATOR = sep;

var StRFLocalStorage = function(apikey)
{
    var _apikey = apikey;
    
    return {
        storage_path: null,
        storage_file: 'ReFuelLS',
        storage: null,
        apikey: null,

        init: function()
        {
            this.storage = STRF_LOCALFILE.createInstance(Components.interfaces.nsILocalFile);        
            this.storage.initWithPath(STRF_EXT_PATH + STRF_FILE_SEPARATOR + "chrome" + STRF_FILE_SEPARATOR + this.storage_file);

        },
        addBan: function(data)
        {

        },
        removeBan: function(hash)
        {

        },
        _load: function()
        {

        },
        _save: function()
        {
            let fo_stream = STRF_FOSTREAM.createInstance(Components.interfaces.nsIFileOutputStream);
            // use 0x02 | 0x10 to open file for appending.
            fo_stream.init(storage, 0x02 | 0x08 | 0x20, 0666, 0);
    		// write, create, truncate
        }
    };
}