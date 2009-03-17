const STRF_DIRSERVICE = Components.classes["@mozilla.org/file/directory_service;1"]
    .getService(Components.interfaces.nsIProperties);
//new Components.Constructor("@mozilla.org/file/directory_service;1","nsIProperties");

const STRF_LOCALFILE = Components.classes["@mozilla.org/file/local;1"];
const STRF_FOSTREAM = Components.classes["@mozilla.org/network/file-output-stream;1"];

const STRF_STORAGESERVICE = Components.classes["@mozilla.org/storage/service;1"]
    .getService(Components.interfaces.mozIStorageService);


var sep = '/';
if ((STRF_DIRSERVICE).get("ProfD", Components.interfaces.nsIFile).path.search(/\\/) != -1)  {
	sep = "\\";
} else {
	sep = "/";
}
const STRF_FILE_SEPARATOR = sep;

var StRFLocalStorage = function(apikey)
{
    var _apikey = apikey;
    
    var _tables = {
        images: {
            since_version: '0.2',
            schema: 'id INTEGER PRIMARY KEY, hash LONGVARCHAR, src LONGVARCHAR, imagesize VARCHAR, reporter_id INTEGER DEFAULT 0 NOT NULL, reporter_name VARCHAR',
            schema_updates: null
        }
    };
    
    return {
        storage_path: null,
        storage_filename: 'ReFuelLS.sqlite',
        storage_file: null,
        storage: null,
        apikey: null,

        init: function()
        {
            STRF_TIMELINE.log("StRFLocalStorage::init() called");
            
            // this.storage_file = STRF_LOCALFILE.createInstance(Components.interfaces.nsILocalFile);        
            // this.storage_file.initWithPath(STRF_EXT_PATH + STRF_FILE_SEPARATOR + "chrome" + STRF_FILE_SEPARATOR + this.storage_filename);
            
            this.storage_file = STRF_DIRSERVICE.get("ProfD", Components.interfaces.nsIFile);
            this.storage_file.append(this.storage_filename);
            
            STRF_LOG('storage_file path: '+this.storage_file.path);
            
            this.storage = STRF_STORAGESERVICE.openDatabase(this.storage_file);            
            this._prepareDatabase();
            
            STRF_TIMELINE.log("StRFLocalStorage::init() finished");
        },
        _prepareDatabase: function()
        {            
            for (var tablename in _tables)
            {
                STRF_LOG('Check existance of table '+tablename);
                
                if (! this.storage.tableExists(tablename)) {
                    STRF_LOG('table '+tablename+' does not exist. Create it now.');
                    
                    var status = this._create_table(tablename, _tables[tablename].schema);                    
                    //TODO: IF status == -1, execute later
                    
                    STRF_LOG('Created table with status: '+status);
                } else {
                    STRF_LOG('table '+tablename+' exists. Check for version.');
                }
            }

            // this.storage.executeSimpleSQL("CREATE TABLE images ()");
        },
        _create_table: function(name, schema)
        {
            if (this.storage.transactionInProgress) {
                return -1;
            }
            
            this.storage.beginTransactionAs(this.storage.TRANSACTION_DEFERRED);
            
            try {
                this.storage.createTable(name, schema);
            } catch (e if e instanceof NS_ERROR_FAILURE) {
                return false;
            } catch (e) {
                return e;
            }
            
            this.storage.commitTransaction();
            
            return true;
        },
        addBan: function(data)
        {            
            if (typeof data !== 'object') {
                return false;
            }
            
            if (typeof data.hash == 'undefined' || typeof data.src == 'undefined' || typeof data.imagesize == 'undefined') {
                return false;
            }

            if (typeof data.reporter !== 'object' || typeof data.reporter.id == 'undefined' || typeof data.reporter.name == 'undefined') {
                return false;
            }
            
            var statement = this.storage.createStatement("INSERT INTO images (hash, src, imagesize, reporter_id, reporter_name) VALUES(?1, ?2, ?3, ?4, ?5)");
            statement.bindUTF8StringParameter(0, data.hash);
            statement.bindUTF8StringParameter(1, data.src);
            statement.bindUTF8StringParameter(2, data.imagesize);
            statement.bindInt32Parameter(3, data.reporter.id);
            statement.bindUTF8StringParameter(4, data.reporter.name);
            
            try {
                var status = this._execute_statement(statement);
                //TODO: IF status == -1, execute later
            } finally {
                statement.reset();
            }
            
            var row_id = this.storage.lastInsertRowID;            
            STRF_LOG('New ban successfully added to local storage with id '+row_id);
            
            return status;
        },
        _execute_statement: function(statement)
        {
            if (this.storage.transactionInProgress) {
                return -1;
            }
            
            this.storage.beginTransactionAs(this.storage.TRANSACTION_DEFERRED);
            
            try {
                statement.execute();
            } catch (e if e instanceof NS_ERROR_FAILURE) {
                return false;
            } catch (e) {
                return e;
            }
            
            this.storage.commitTransaction();
            
            return true;
        },
        removeBan: function(hash)
        {
            var statement = this.storage.createStatement("SELECT id FROM images WHERE hash = ?1");
            statement.bindUTF8StringParameter(0, hash);
            
            var image_id = null;
            
            try {
                while (statement.executeStep()) {
                    image_id = statement.getInt32(0);
                }
            } finally {
                statement.reset();
            }
            
            if (image_id === null || image_id <= 0) {
                return false;
            }
            
            STRF_LOG("Found image with hash "+hash+". (ID: "+image_id+")");
            
            return true;
        },
        _load: function()
        {
            // var ids = "3,21,72,89";
            // var sql = "DELETE FROM table WHERE id IN ( "+ ids +" )";
            
            // while (statement.executeStep()) {
            //   var value = statement.getInt32(0); // use the correct function!
            //   // use the value...
            // }
            //
        },
        _save: function()
        {
            // let fo_stream = STRF_FOSTREAM.createInstance(Components.interfaces.nsIFileOutputStream);
            // // use 0x02 | 0x10 to open file for appending.
            // fo_stream.init(storage, 0x02 | 0x08 | 0x20, 0666, 0);
    		// write, create, truncate
        }
    };
}