(function() {
    "use strict";

    var Q      = require("q");
    var uuid   = require("node-uuid");
    var assert = require("assert-plus");
    
    function NotFoundError(message) {
        this.name = "NotFoundError";
        this.message = (message || "");
    }
    
    NotFoundError.prototype = Error.prototype;
    
    function SubscriptionDAO(db, log) {
        var self = this;
        
        assert.object(db, "db");
        assert.object(log, "log");
        
        var SUB_NAMESPACE = "hookhub:subscription:";
        var TAG_NAMESPACE = "hookhub:sub_tag:";
        
        self.create = function(description, tags, callback) {
            assert.string(description, "description");
            assert.arrayOfString(tags, "tags");
            assert.string(callback, "callback");
            
            var id = uuid.v4();
            var subId = SUB_NAMESPACE + id;
            
            return Q.ninvoke(db, "hmset", subId, {
                description: description,
                tags:        tags.join(","),
                callback:    callback,
                created:     (new Date().getTime())
            })
            .then(function() {
                log.trace("created", id);
                
                var promises = [];
                                
                tags.forEach(function(tag) {
                    promises.push(
                        Q.ninvoke(db, "sadd", TAG_NAMESPACE + tag, id)
                            .then(function() {
                                log.trace("added %s to %s", id, TAG_NAMESPACE + tag);
                            })
                    );
                });
                
                return Q.all(promises);
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
                    
                    result.id = id;
                    result.tags = result.tags.split(",");
                    
                    if (typeof result.tags === "string") {
                        result.tags = [result.tags];
                    }
                    
                    return result;
                });
        };
        
        // retrieve subscriptions by tags
        self.getByTags = function(tags) {
            assert.arrayOfString(tags, "tags");
            
            var tagsWithNamespace = [];
            tags.forEach(function(tag) {
                tagsWithNamespace.push(TAG_NAMESPACE + tag);
            });
            
            var promise = Q.defer();
            
            return Q.npost(db, "sunion", tagsWithNamespace)
                .then(function(subIds) {
                    var promises = [];
                    
                    subIds.forEach(function(subId) {
                        promises.push(self.get(subId));
                    });
                    
                    return Q.all(promises);
                });
        };
        
        self.del = function(id) {
            assert.string(id, "id");
            
            return self
                .get(id)
                .then(function(sub) {
                    // remove id from 
                    sub.tags.forEach(function(tag) {
                        db.srem(TAG_NAMESPACE + tag, id);
                    });
                    
                    db.del(SUB_NAMESPACE + id);
                });
        };
    }
    
    module.exports = {
        SubscriptionDAO: SubscriptionDAO,
        NotFoundError: NotFoundError
    };
})();
