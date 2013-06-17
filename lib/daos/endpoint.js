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

    function tagsArrToString(tags) {
        return tags.join("\0");
    }
    
    // tags should be an empty array if none provided
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

    function EndpointDAO(db, log) {
        var self = this;
        
        assert.object(db, "db");
        assert.object(log, "log");
        
        var NAMESPACE = "hookhub:endpoint:";
        
        self.create = function(description, type, tags) {
            assert.string(description, "description");
            assert.string(type, "type");
            assert.optionalArrayOfString(tags, "tags");
            
            var id = uuid.v4();

            return Q.ninvoke(db, "hmset", NAMESPACE + id, {
                description: description,
                type:        type,
                tags:        tagsArrToString(tags),
                created:     (new Date().getTime())
            })
            .then(function() {
                log.trace("created", id);
                
                return id;
            });
        };
        
        self.get = function(id) {
            assert.string(id, "id");

            return Q.ninvoke(db, "hgetall", NAMESPACE + id)
                .then(function(result) {
                    if (! result) {
                        throw new NotFoundError("no such endpoint " + id);
                    }
                    
                    result.tags = stringToTagsArr(result.tags);
                    
                    return result;
                });
        };
    }
    
    module.exports = {
        EndpointDAO: EndpointDAO,
        NotFoundError: NotFoundError
    };
})();
