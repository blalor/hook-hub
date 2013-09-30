"use strict";

// create_transmogrify_subscription.js <url> <type> <tag1,tag2> <description> <path to script>

var fs      = require("fs");
var request = require("request");
var sink    = require("stream-sink");

var url         = process.argv[2];
var type        = process.argv[3];
var tags        = process.argv[4].split(",");
var description = process.argv[5];
var script_file = process.argv[6];

fs.createReadStream(script_file).pipe(sink()).on("data", function(script_source) {
    request({
        url: url + "/subscription",
        method: "post",
        json: {
            type: type,
            description: description,
            tags: tags,
            handler: {
                name: "transmogrify",
                config: {
                    script: script_source
                }
            }

        }
    }, function(err, resp, body) {
        if (err) {
            throw err;
        }
        
        console.log(body);
    });
});

