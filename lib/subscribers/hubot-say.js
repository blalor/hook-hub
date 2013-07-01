"use strict";

var assert  = require("assert-plus");
var URL     = require("url");
var restify = require("restify");
var bunyan  = require("bunyan");

var log = bunyan.createLogger({
    name: "hubot-say",
    level: "debug"
});

function validateConfig(config) {
    assert.object(config, "config");
    assert.string(config.hubot_url, "config.hubot_url");
    assert.optionalString(config.room, "config.room");
    assert.optionalString(config.type, "config.type");
}

/**
 * Handle a publish event.
 *
 * @param subscription the subscription object doing the handling?
 * @param triggering_tags the tags that triggered this publish event
 * @param message the published message
 */
function handlePublish(sub_id, subscriber_tags, publisher_tags, config, data) {
    validateConfig(config);
    
    assert.string(data.message, "data.message");
    assert.optionalString(data.room, "data.room");
    assert.optionalString(data.type, "data.type");
    
    if ((! data.room) && config.room) {
        data.room = config.room;
    }
    
    if ((! data.type) && config.type) {
        data.type = config.type;
    }
    
    var parsedUrl = URL.parse(config.hubot_url);

    restify.createJsonClient({
        url: parsedUrl.protocol + "//" + parsedUrl.host
    })
    .post(parsedUrl.path, data, function(err) {
        if (err) {
            log.error(err, "unable to invoke callback %s for subscription %s", config.hubot_url, sub_id);
        } else {
            log.debug("posted to %s for %s", config.hubot_url, sub_id);
        }
    });
}

module.exports = {
    handle: handlePublish,
    validate: validateConfig
};
