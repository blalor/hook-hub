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
    
    function EndpointDAO(db, log) {
        var self = this;
        
        assert.object(db, "db");
        assert.object(log, "log");
        
        var NAMESPACE = "hookhub:endpoint:";
        
        self.create = function(description, tags) {
            assert.string(description, "description");
            assert.arrayOfString(tags, "tags");
            
            var id = uuid.v4();

            return Q.ninvoke(db, "hmset", NAMESPACE + id, {
                description: description,
                tags:        tags.join(","),
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
                    result.tags = result.tags.split(",");
                    
                    log.trace("got result", result);
                    
                    if (! result) {
                        throw new NotFoundError("no such endpoint " + id);
                    }
                    
                    return result;
                });
        };
    }
    
    module.exports = {
        EndpointDAO: EndpointDAO,
        NotFoundError: NotFoundError
    };
})();
