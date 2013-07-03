"use strict";

var assert     = require("assert-plus");
var bunyan     = require("bunyan");
var SandCastle = require("sandcastle").SandCastle;

var log = bunyan.createLogger({
    name: "transmogrify",
    level: "debug"
});

var sandcastle = new SandCastle();

function validateConfig(config) {
    assert.object(config, "config");
    assert.string(config.script, "config.script");
}

/**
 * Handle a publish event.
 *
 * @param sub_id          the subscription id
 * @param subscriber_tags array of tags this subscription filters on
 * @param publisher_tags  array of tags from the publisher
 * @param config          configuration object
 * @param data            the data to transmogrify
 * @param publish         the publish handler
 */
function handlePublish(sub_id, subscriber_tags, publisher_tags, config, data, publish) {
    var script = sandcastle.createScript([
        "var publishedEvents = [];",
        
        "function publish(type, tags, data) {",
        "    publishedEvents.push([type, tags, data]);",
        "}",
        
        "var providedFn = ", config.script, ";",
        
        "exports.main = function() {",
        "    providedFn(subscriber_tags, publisher_tags, data);",
        "    exit(publishedEvents);",
        "}"
    ].join("\n"));

    script.on("timeout", function() {
        log.error("timeout running subscription " + sub_id);
    });

    script.on("exit", function(err, results) {
        if (err) {
            log.error(err, "executing", config.script);
        } else {
            for (var i = 0; i < results.length; i++) {
                publish.apply(null, results[i]);
            }
        }
    });
    
    script.run({
        subscriber_tags: subscriber_tags,
        publisher_tags: publisher_tags,
        data: data
    });
}

module.exports = {
    handle: handlePublish,
    validate: validateConfig
};
