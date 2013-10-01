"use strict";

var assert  = require("assert-plus");
var URL     = require("url");
var bunyan  = require("bunyan");
var request = require("request");

var log = bunyan.createLogger({
    name: "pass-through",
    level: "debug"
});

function validateConfig(config) {
    assert.object(config, "config");
    assert.string(config.callback, "config.callback");
    assert.optionalString(config.method, "config.method");      // defaults to POST
    assert.optionalBool(config.use_extra_path, "config.use_extra_path");
}

/**
 * Handle a publish event.
 *
 * @param subscription the subscription object doing the handling?
 * @param triggering_tags the tags that triggered this publish event
 * @param message the published message
 */
function handlePublish(sub_id, subscriber_tags, publisher_tags, config, data) {
    var callbackUrl = config.callback;
    if (config.use_extra_path && data.extra_path) {
        if (callbackUrl.charAt(callbackUrl.length - 1) != "/") {
            callbackUrl += "/";
        }
        callbackUrl += data.extra_path;
        delete data.extra_path;
    }
    if (!config.method) {
        config.method = "POST";
    }

    var parsedUrl = URL.parse(callbackUrl);
    
    var options = {
        url: parsedUrl,
        method: config.method,
        headers: {
            "X-HookHub-Subscription-Id": sub_id
        },
        json: data
    };
    
    if (publisher_tags.length) {
        options.headers["X-HookHub-Tags"] = publisher_tags.join(",");
    }

    request(options, function(err){
        if (err) {
            log.error(err, "unable to invoke callback %s for subscription %s", config.callback, sub_id);
        } else {
            log.debug("posted to %s for %s", callbackUrl, sub_id);
        }
    });
}

module.exports = {
    handle: handlePublish,
    validate: validateConfig
};
