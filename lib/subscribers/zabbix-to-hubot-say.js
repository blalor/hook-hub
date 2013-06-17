(function() {
    "use strict";

    var assert  = require("assert-plus");
    var bunyan  = require("bunyan");
    
    var log = bunyan.createLogger({
        name: "zabbix-to-hubot-say",
        level: "debug"
    });
    
    function validateConfig(config) {
        // assert.object(config, "config");
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
        
        // {
        //     "trigger": {
        //         "name": "{TRIGGER.NAME}",
        //         "status": "{TRIGGER.STATUS}",
        //         "severity": "{TRIGGER.SEVERITY}"
        //     },
        //     "items": [
        //         {
        //             "id": "{ITEM.ID1}",
        //             "name": "{ITEM.NAME1}",
        //             "host": "{HOST.NAME1}",
        //             "key": "{ITEM.KEY1}",
        //             "value": "{ITEM.VALUE1}"
        //         }
        //     ]
        // }
        
        assert.arrayOfObject(data.items, "data.items");
        assert.object(data.trigger, "data.trigger");
        assert.string(data.trigger.name, "data.trigger.name");
        
        publish("hubot-say", publisher_tags, {message: data.trigger.name});
    }
    
    module.exports = {
        handle: handlePublish,
        validate: validateConfig
    };
})();
