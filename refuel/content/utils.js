
var StRFUtils = {
    md5_encode: function(string)
    {
        try {
        	_md5 = Cc['@mozilla.org/security/hash;1'].createInstance(Ci.nsICryptoHash);
        } catch (e) {
        	Components.utils.reportError(e);
        	return '';
        }
        
        let arr = [];
        for (var i = 0; i < string.length; ++i) {
            arr.push(string.charCodeAt(i)); 
        }

        _md5.init(Ci.nsICryptoHash.MD5);
        _md5.update(arr, arr.length);
        var hash = _md5.finish(false);

        // Unpack the binary data bin2hex style
        var ascii = [];
        for (var i = 0; i < hash.length; ++i)
        {
            var c = hash.charCodeAt(i);
            var ones = c % 16;
            var tens = c >> 4;
            
            ascii.push(String.fromCharCode(tens + (tens > 9 ? 87 : 48)) + String.fromCharCode(ones + (ones > 9 ? 87 : 48)));
        }

        return ascii.join('');
    }
};