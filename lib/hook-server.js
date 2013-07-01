"use strict";

var assert  = require("assert-plus");
var restify = require("restify");
var redis   = require("redis");
var Q       = require("q");

var endpoint     = require("./daos/endpoint");
var subscription = require("./daos/subscription");

function HookServer(listen_port, log) {
    assert.number(listen_port, "listen_port");
    assert.object(log, "log");
    
    // kludge to wrap a route handler in a try/catch so that unhandled
    // exceptions get logged.  Otherwise we never even see the 500, but the
    // client does.
    function tryCatchWrap(cb) {
        return function(req, res, next) {
            try {
                cb(req, res, next);
            } catch (e) {
                log.error(e);
                res.send(500);
                next();
            }
        };
    }
    
    var endpointDao;
    var subscriptionDao;
    
    var server = restify.createServer({
        name: "hook-hub",
        log: log.child({level: "info"})
    });

    server.use(restify.requestLogger());
    server.use(restify.bodyParser({ mapParams: false }));
    server.use(restify.queryParser({ mapParams: false }));

    server.on("after", restify.auditLogger({
        log: log.child({audit: true})
    }));
    
    // endpoint creation
    server.post("/endpoint", tryCatchWrap(function(req, res, next) {
        try {
            assert.object(req.body, "body");
            assert.string(req.body.type, "type");
            assert.string(req.body.description, "description");
            assert.arrayOfString(req.body.tags, "tags");
        } catch (e) {
            return next(new restify.InvalidContentError(e.message));
        }
        
        endpointDao
            .create(req.body.description, req.body.type, req.body.tags)
            .done(function(id) {
                res.send(id);
                next();
            }, next);
    }));
    
    // retrieve all endpoint IDs
    server.get("/endpoints", tryCatchWrap(function(req, res, next) {
        endpointDao
            .list()
            .done(function(result) {
                res.send(result);
                next();
            }, next);
    }));
    
    // retrieve endpoint details
    server.get("/endpoint/:id", tryCatchWrap(function(req, res, next) {
        endpointDao
            .get(req.params.id)
            .then(function(result) {
                res.send(result);
            }, function(e) {
                if (e instanceof subscription.NotFoundError) {
                    res.send(404, e.message);
                } else {
                    throw e;
                }
            })
            .done(next, next);
    }));
    
    function publish(type, tags, data) {
        log.debug("publishing type %s, tags %j", type, tags);
        
        subscriptionDao
            .getByTypeAndTags(type, tags)
            .then(function(subscriptions) {
                if (subscriptions.length) {
                    subscriptions.forEach(function(sub) {
                        sub.handle(tags, data, publish);
                    });
                } else {
                    log.warn("no subscriptions found for type %s, tags %j", type, tags);
                }
            })
            .done(null, function(e) {
                log.error(e, "unhandled exception while publishing type %s, tags %j", type, tags);
            });
    }
    
    // kick an endpoint
    function handlePublish(req, res, next) {
        var data;
        
        if (req.method.toUpperCase() === "GET") {
            data = req.query;
        } else {
            data = req.body;
        }
        
        endpointDao
            .get(req.params.id)
            .then(function(endpoint) {
                // we don't want to wait for the pings to complete, nor do
                // we want the success/failure to affect the return code of
                // this call
                res.send(204);
                
                publish(endpoint.type, endpoint.tags, data);
            }, function(e) {
                if (e instanceof subscription.NotFoundError) {
                    res.send(404, e.message);
                } else {
                    throw e;
                }
            })
            .done(next, next);
    }
    
    server.get("/publish/:id", tryCatchWrap(handlePublish));
    server.post("/publish/:id", tryCatchWrap(handlePublish));
    
    // create a new subscription
    server.post("/subscription", tryCatchWrap(function(req, res, next) {
        try {
            assert.object(req.body, "request body");
            assert.string(req.body.description, "description");
            assert.string(req.body.type, "type");
            assert.object(req.body.handler, "handler");
            assert.optionalArrayOfString(req.body.tags, "tags");
        } catch (e) {
            return next(new restify.InvalidContentError(e.message));
        }
        
        subscriptionDao
            .create(req.body.type, req.body.description, req.body.handler, req.body.tags)
            .done(function(id) {
                res.send(id);
                next();
            }, next);
    }));
    
    // retrieve all subscription IDs
    server.get("/subscriptions", tryCatchWrap(function(req, res, next) {
        subscriptionDao
            .list()
            .done(function(result) {
                res.send(result);
                next();
            }, next);
    }));
    
    // retrieve subscription details
    server.get("/subscription/:id", tryCatchWrap(function(req, res, next) {
        subscriptionDao
            .get(req.params.id)
            .done(function(result) {
                res.send(result.valueOf());
                next();
            }, next);
    }));
    
    // delete a subscription
    server.del("/subscription/:id", tryCatchWrap(function(req, res, next) {
        subscriptionDao
            .del(req.params.id)
            .then(function() {
                res.send(204);
            }, function(e) {
                if (e instanceof subscription.NotFoundError) {
                    res.send(404, e.message);
                } else {
                    throw e;
                }
            })
            .done(next, next);
    }));
    
    // don't start listening until the database is ready for connections
    var dbConnPromise = Q.defer();
    
    var db = redis.createClient();
    db.on("ready", dbConnPromise.resolve);
    db.on("error", dbConnPromise.reject);
    
    dbConnPromise.promise
        .done(function() {
            endpointDao = new endpoint.EndpointDAO(db, log.child({endpointDao: true}));
            subscriptionDao = new subscription.SubscriptionDAO(db, log.child({subscriptionDao: true}));
            
            server.listen(listen_port, function() {
                log.info("%s listening at %s", server.name, server.url);
            });
        });
}

module.exports = {
    HookServer: HookServer
};
