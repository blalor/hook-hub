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
    var str = "";
    
    if (tags) {
        str = tags.join("\0");
    }
    
    return str;
}

function stringToTagsArr(str) {
    var tags = [];
    
    if (str.length) {
        tags = str.split("\0");
        
        if (typeof tags === "string") {
            tags = [tags];
        }
    }
    
    return tags;
}

function Subscription(id, type, tags, name, config, log) {
    var self = this;
    
    assert.optionalArrayOfString(tags, "tags");
    assert.string(name, "name");
    assert.optionalObject(config, "config");
    assert.object(log, "log");
    
    self.tags = tags;
    
    function getModule() {
        return require("../subscribers/" + name);
    }
    
    self.validate = function() {
        getModule().validate(config);
    };
    
    self.handle = function(publisherTags, data, publish) {
        assert.arrayOfString(publisherTags, "publisherTags");
        assert.optionalObject(data, "data");
        
        log.trace({
            module: name,
            sub: id,
            subTags: tags,
            pubTags: publisherTags
        }, "handling");
        
        getModule().validate(config);
        getModule().handle(id, tags, publisherTags, config, data, publish);
    };
    
    self.valueOf = function() {
        return {
            id: id,
            type: type,
            tags: tags,
            handler_name: name,
            handler_config: config
        };
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
        assert.optionalObject(handler.config, "handler.config");
        assert.optionalArrayOfString(tags, "tags");

        new Subscription(null, type, tags, handler.name, handler.config, log).validate();
        
        var id = uuid.v4();
        var subId = SUB_NAMESPACE + id;
        
        return Q.ninvoke(db, "hmset", subId, {
            type:           type,
            description:    description,
            tags:           tagsArrToString(tags),
            handler_name:   handler.name,
            handler_config: JSON.stringify(handler.config ? handler.config : {}),
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
                if (! result) {
                    throw new NotFoundError("no such subscription " + id);
                }
                
                return new Subscription(
                    id,
                    result.type,
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
                                } else {
                                    log.trace("dropping sub %s; sub.tags: %j, event_tags: %j", subId, sub.tags, event_tags);
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
                return Q.all([
                    // remove id from type set
                    Q.ninvoke(db, "srem", TYPE_NAMESPACE + sub.valueOf().type, id),
                    Q.ninvoke(db, "del", SUB_NAMESPACE + id)
                ]).then(function() {
                    // ensure no return value; would otherwise be [undefined, undefined]
                    return;
                });
            });
    };
    
    // return a list of all subscription IDs
    self.list = function() {
        return Q.ninvoke(db, "keys", SUB_NAMESPACE + "*")
            .then(function(ids) {
                ids.forEach(function(id, index) {
                    ids[index] = id.substring(SUB_NAMESPACE.length);
                });
                
                return ids;
            });
    };
}

module.exports = {
    SubscriptionDAO: SubscriptionDAO,
    NotFoundError: NotFoundError
};
