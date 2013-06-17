(function() {
    "use strict";

    var Q      = require("q");
    var uuid   = require("node-uuid");
    var assert = require("assert-plus");
    var _      = require("lodash");
    
    function NotFoundError(message) {
        this.name = "NotFoundError";
        this.message = (message || "");
    }
    
    NotFoundError.prototype = Error.prototype;
    
    function tagsArrToString(tags) {
        return tags.join("\0");
    }
    
    function stringToTagsArr(str) {
        var tags = str.split("\0");
        
        if (typeof tags === "string") {
            tags = [tags];
        }
        
        return tags;
    }
    
    function Subscription(id, tags, name, config, log) {
        var self = this;
        
        assert.arrayOfString(tags, "tags");
        assert.string(name, "name");
        assert.object(config, "config");
        assert.object(log, "log");
        
        self.tags = tags;
        
        function getModule() {
            return require("../subscribers/" + name);
        }
        
        self.validate = function() {
            getModule().validate(config);
        };
        
        self.handle = function(publisherTags, data) {
            assert.arrayOfString(publisherTags, "publisherTags");
            assert.optionalObject(data, "data");
            
            log.trace({
                module: name,
                sub: id,
                subTags: tags,
                pubTags: publisherTags
            }, "handling");
            
            getModule().handle(id, tags, publisherTags, config, data);
        };
    }
    
    function SubscriptionDAO(db, log) {
        var self = this;
        
        assert.object(db, "db");
        assert.object(log, "log");
        
        var SUB_NAMESPACE = "hookhub:subscription:";
        var TYPE_NAMESPACE = "hookhub:sub_type:";
        
        self.create = function(type, description, handler, tags) {
            assert.string(type, "type");
            assert.string(description, "description");
            assert.object(handler, "handler");
            assert.string(handler.name, "handler.name");
            assert.object(handler.config, "handler.config");
            assert.optionalArrayOfString(tags, "tags");

            new Subscription(null, tags, handler.name, handler.config, log).validate();
            
            var id = uuid.v4();
            var subId = SUB_NAMESPACE + id;
            
            return Q.ninvoke(db, "hmset", subId, {
                type:           type,
                description:    description,
                tags:           tagsArrToString(tags),
                handler_name:   handler.name,
                handler_config: JSON.stringify(handler.config),
                created:        (new Date().getTime())
            })
            .then(function() {
                return Q.ninvoke(db, "sadd", TYPE_NAMESPACE + type, id);
            })
            .then(function() {
                return id;
            });
        };
        
        self.get = function(id) {
            assert.string(id, "id");
            
            return Q.ninvoke(db, "hgetall", SUB_NAMESPACE + id)
                .then(function(result) {
                    log.trace("got result", result);
                    
                    if (! result) {
                        throw new NotFoundError("no such subscription " + id);
                    }
                    
                    return new Subscription(
                        id,
                        stringToTagsArr(result.tags),
                        result.handler_name,
                        JSON.parse(result.handler_config),
                        log
                    );
                });
        };
        
        // retrieve subscriptions by type, including only those tags are all
        // contained in event_tags
        self.getByTypeAndTags = function(type, event_tags) {
            assert.string(type, "type");
            assert.arrayOfString(event_tags, "event_tags");
            
            var promise = Q.defer();
            
            return Q.ninvoke(db, "smembers", TYPE_NAMESPACE + type)
                .then(function(subIds) {
                    var promises = [];
                    
                    subIds.forEach(function(subId) {
                        promises.push(
                            self.get(subId)
                                .then(function(sub) {
                                    // only return subscription if its tags are
                                    // a superset of event_tags
                                    var include = sub.tags.every(function(tag) {
                                        return _.contains(event_tags, tag);
                                    });
                                    
                                    if (include) {
                                        return sub;
                                    }
                                })
                        );
                    });
                    
                    return Q.all(promises)
                        .then(function(results) {
                            // remove undefined items from array
                            return _.compact(results);
                        });
                });
        };
        
        self.del = function(id) {
            assert.string(id, "id");
            
            return self
                .get(id)
                .then(function(sub) {
                    // remove id from type set
                    db.srem(TYPE_NAMESPACE + sub.type, id);
                    db.del(SUB_NAMESPACE + id);
                });
        };
    }
    
    module.exports = {
        SubscriptionDAO: SubscriptionDAO,
        NotFoundError: NotFoundError
    };
})();
