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
    
    var endpointDao;
    var subscriptionDao;
    
    var server = restify.createServer({
        name: "hook-hub",
        log: log.child({level: "info"})
    });
    
    // ensure unhandled exceptions get logged.  Otherwise we never even see the
    // 500, but the client does.
    server.on("uncaughtException", function(req, resp, route, err) {
        var obj = {
            // this emulates passing err as the first argument to log(), but
            // still allows augmenting with the method, url and body
            err: {
                message: err.message,
                stack: err.stack,
                name: err.name
            },
            method: req.method,
            url: req.url
        };
        
        // only log body when we can reasonably expect there to be a parsed body
        if ((obj.method === "POST") || (obj.method === "PUT")) {
            obj.body = req.body;
        }

        req.log.error(obj, "handling route");
        resp.send(500);
    });

    server.use(restify.requestLogger());
    server.use(restify.bodyParser({ mapParams: false }));
    server.use(restify.queryParser({ mapParams: false }));

    // send request id header, and log start of request
    server.use(function(req, res, next) {
        var obj = {
            method: req.method,
            url: req.url,
            headers: req.headers,
            httpVersion: req.httpVersion
        };
        
        // only log body when we can reasonably expect there to be a parsed body
        if ((obj.method === "POST") || (obj.method === "PUT")) {
            obj.body = req.body;
        }
        
        req.log.debug(obj, "starting request");
        
        res.header("X-Request-Id", req.id());
        return next();
    });

    server.on("after", restify.auditLogger({
        log: log.child({audit: true})
    }));
    
    // endpoint creation
    server.post("/endpoint", function(req, res, next) {
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
    });
    
    // retrieve all endpoint IDs
    server.get("/endpoints", function(req, res, next) {
        endpointDao
            .list()
            .done(function(result) {
                res.send(result);
                next();
            }, next);
    });
    
    // retrieve endpoint details
    server.get("/endpoint/:id", function(req, res, next) {
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
    });
    
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

        if (!req.params.hasOwnProperty("id")) {
            req.params.id = req.params[0];
            data.extra_path = req.params[1];
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
    
    server.get("/publish/:id", handlePublish);
    server.post("/publish/:id", handlePublish);
    server.get(/^\/publish\/([a-z0-9\-]+)\/(.*)/, handlePublish);
    server.post(/^\/publish\/([a-z0-9\-]+)\/(.*)/, handlePublish);
    
    // create a new subscription
    server.post("/subscription", function(req, res, next) {
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
    });
    
    // retrieve all subscription IDs
    server.get("/subscriptions", function(req, res, next) {
        subscriptionDao
            .list()
            .done(function(result) {
                res.send(result);
                next();
            }, next);
    });
    
    // retrieve subscription details
    server.get("/subscription/:id", function(req, res, next) {
        subscriptionDao
            .get(req.params.id)
            .done(function(result) {
                res.send(result.valueOf());
                next();
            }, next);
    });
    
    // delete a subscription
    server.del("/subscription/:id", function(req, res, next) {
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
    });
    
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
