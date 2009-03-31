const STRF_STORAGESERVICE = Components.classes["@mozilla.org/storage/service;1"]
    .getService(Components.interfaces.mozIStorageService);

var StRFLocalStorage = function(apikey)
{
    var _inited = false;    
    var _apikey = apikey;
    
    var _tables = {
        images: {
            since_version: '0.2',
            schema: 'id INTEGER PRIMARY KEY, hash LONGVARCHAR, src LONGVARCHAR, weight INTEGER DEFAULT 0 NOT NULL, reporter_name VARCHAR, refererurl LONGVARCHAR, syn INTEGER DEFAULT 0 NOT NULL'//,
            // schema_updates: {
            //     '0.3': 'DROP COLUMN reporter_id'
            // }
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
            if (this.storage !== null) {
                STRF_LOG("StRFLocalStorage already inited!");
                return;
            }
            
            STRF_TIMELINE.log("StRFLocalStorage::init() called");
            
            this.storage_file = STRF_DIRSERVICE.get("ProfD", Components.interfaces.nsIFile);
            this.storage_file.append(this.storage_filename);
            
            STRF_LOG('storage_file path: '+this.storage_file.path);
            
            this.storage = STRF_STORAGESERVICE.openDatabase(this.storage_file);
            
            _inited = true;
            
            STRF_TIMELINE.log("StRFLocalStorage::init() finished");
        },
        prepareDatabase: function()
        {
            if (! _inited) {
                this.init();
            }
            
            for (var tablename in _tables)
            {
                STRF_LOG('Check existance of table '+tablename);
                
                if (! this.storage.tableExists(tablename)) {
                    STRF_LOG('table '+tablename+' does not exist. Create it now.');
                    
                    var status = this._createTable(tablename, _tables[tablename].schema);                    
                    //TODO: IF status == -1, execute later
                    
                    STRF_LOG('Created table with status: '+status);
                } else {
                    STRF_LOG('table '+tablename+' exists. Check for version.');
                }
            }
        },
        _createTable: function(name, schema)
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
            
            if (typeof data.hash == 'undefined' || typeof data.src == 'undefined') {
                return false;
            }

            if (typeof data.reporter !== 'object' || typeof data.reporter.name == 'undefined') {
                return false;
            }
            
            weight = 0;
            if (typeof data.weight !== 'undefined') {
                weight = data.weight;
            }
            
            var statement = this.storage.createStatement("INSERT INTO images (hash, src, weight, reporter_name, refererurl, syn) VALUES (?1, ?2, ?3, ?4, ?5, 0)");
            statement.bindUTF8StringParameter(0, data.hash);
            statement.bindUTF8StringParameter(1, data.src);
            statement.bindInt32Parameter(2, weight);
            statement.bindUTF8StringParameter(3, data.reporter.name);
            statement.bindUTF8StringParameter(4, data.refererurl);
            
            var status = this._executeStatement(statement);
            //TODO: IF status == -1, execute later
            
            var row_id = this.storage.lastInsertRowID;            
            STRF_LOG('New ban successfully added to local storage with id '+row_id);
            
            return [status, row_id];
        },
        updateBannedImage: function(id, data)
        {
            var statement = this.storage.createStatement("UPDATE images SET syn = ?2, weight = ?3, reporter_name = ?4 WHERE id = ?1");
            statement.bindInt32Parameter(0, id);
            statement.bindInt32Parameter(1, (status ? 1 : 0));
            statement.bindInt32Parameter(2, (data.weight ? data.weight : 0));
            statement.bindUTF8StringParameter(3, (data.reporter_name ? data.reporter_name : ''));
            
            var status = this._executeStatement(statement);
            //TODO: If status == -1, execute later
            
            return status;
        },
        _executeStatement: function(statement)
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
            } finally {
                statement.reset();
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
            
            var status = this.storage.executeSimpleSQL("DROP FROM images WHERE id = "+image_id);
            
            STRF_LOG("Removed ban "+image_id+" with status "+status);
            
            return status;
        },
        checkForMatches: function(images, callback)
        {
            STRF_LOG("StRFLocalStorage::checkForMatches");
            
            //TODO: Check for matches
            
            var self = this;
            var data = [];
            
            var hash_arr = new Array();
            for (let [i, imgData] in Iterator(images)) {
                hash_arr.push(imgData.hash);
            }
            
            var hash_str = hash_arr.join("','");
            
            var sql = "SELECT id,hash,weight,reporter_name FROM images WHERE hash IN ('"+hash_str+"')";
            
            STRF_LOG('checkForMatches sql: '+sql);
            
            var statement = this.storage.createStatement(sql);
            
            try {
                while (statement.executeStep()) {
                    data.push({
                        id: statement.getInt32(0),
                        hash: statement.getUTF8String(1),
                        weight: statement.getInt32(2),
                        reporter_name: statement.getUTF8String(3)
                    });
                }
            } finally {
                statement.reset();
            }
            
            if (callback !== undefined) {
                if (typeof callback == 'object') {                         
                    callback[1].apply(callback[0], [data, status]);
                } else {
                    callback.apply(callback, [data, status]);
                }
            }
        },
        getUnsynced: function()
        {
            STRF_LOG("StRFLocalStorage::getUnsynced");
            
            var self = this;
            var data = [];

            var statement = this.storage.createStatement("SELECT id,hash,weight,reporter_name,src,refererurl FROM images WHERE syn = 0");
            
            try {
                while (statement.executeStep()) {
                    data.push({
                        id: statement.getInt32(0),
                        hash: statement.getUTF8String(1),
                        weight: statement.getInt32(2),
                        reporter_name: statement.getUTF8String(3),
                        src: statement.getUTF8String(4),
                        refererurl: statement.getUTF8String(5),
                    });
                }
            } finally {
                statement.reset();
            }
            
            return data;
        }
    };
}