(function() {
    "use strict";

    var assert  = require("assert-plus");
    var URL     = require("url");
    var restify = require("restify");
    var bunyan  = require("bunyan");
    
    var log = bunyan.createLogger({
        name: "pass-through",
        level: "debug"
    });
    
    function validateConfig(config) {
        assert.object(config, "config");
        assert.string(config.callback, "config.callback");
    }
    
    /**
     * Handle a publish event.
     *
     * @param subscription the subscription object doing the handling?
     * @param triggering_tags the tags that triggered this publish event
     * @param message the published message
     */
    function handlePublish(sub_id, subscriber_tags, publisher_tags, config, data, publish) {
        validateConfig(config);
        
        var parsedUrl = URL.parse(config.callback);

        restify.createJsonClient({
            url: parsedUrl.protocol + "//" + parsedUrl.host,
            headers: {
                "X-HookHub-Subscription-Id": sub_id,
                "X-HookHub-Tags": publisher_tags.join(",")
            }
        })
        .post(parsedUrl.path, data, function(err, req, res, obj) {
            if (err) {
                log.error(err, "unable to invoke callback %s for subscription %s", config.callback, sub_id);
            } else {
                log.debug("posted to %s for %s", config.callback, sub_id);
            }
        });
    }
    
    module.exports = {
        handle: handlePublish,
        validate: validateConfig
    };
})();
