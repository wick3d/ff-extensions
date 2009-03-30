# Service description

## Posting new ban

### Extension
sends HTTP POST with following array: {src: SRC, hash: HASH, referer_hash: REFERER_HASH, referer_url: REFERER_URL}

### Service
Responds with following XML structure:
<refuel>
    <images>
        <img src="SRC" hash="HASH" weight="WEIGHT" reporter_id="REPORTER_ID" reporter_name="REPORTER_NAME" />
    </images>
</refuel>

## Checking for banned images

### Extension
send HTTP POST with array of hashes (ie. {images: [12345, 23456, 34567]})

### Service
Responds with following XML structure:
<refuel>
    <images>
        <img src="SRC" hash="HASH" weight="WEIGHT" reporter_id="REPORTER_ID" reporter_name="REPORTER_NAME" />
    </images>
</refuel>

If no matches found then the structure is the same except that there is no "img" -tag inside images