(function() {
    "use strict";
    
    var assert  = require("assert-plus");
    var restify = require("restify");
    var redis   = require("redis");
    var Q       = require("q");
    var URL     = require("url");
    
    var endpoint     = require("./daos/endpoint");
    var subscription = require("./daos/subscription");
    
    function HookServer(listen_port, log) {
        var self = this;
        
        assert.number(listen_port, 'listen_port');
        assert.object(log, 'log');
        
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
                    
                    subscriptionDao
                        .getByTags(endpoint.tags)
                        .then(function(subscriptions) {
                            subscriptions.forEach(function(sub) {
                                sub.handle(endpoint.tags, data);
                            });
                        })
                        .done();
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
        
        // subscribe to one or more tags
        server.post("/subscription", tryCatchWrap(function(req, res, next) {
            /*
            body: {
                description: "description of subscription",
                tags: [ "tag1", "tag2" ],
                handler: {
                    name: "pass-through",
                    config: {
                        callback: "http://requestb.in/foo"
                    }
                }
            }
            */
            
            // no empty requests
            assert.object(req.body, "request body");
            
            // description of the subscription
            assert.string(req.body.description, "description");

            // the tags that are being subscribed to
            assert.arrayOfString(req.body.tags, "tags");
            
            // the subscription handler
            assert.object(req.body.handler, "handler");
            
            subscriptionDao
                .create(req.body.description, req.body.tags, req.body.handler)
                .done(function(id) {
                    res.send(id);
                    next();
                }, next);
        }));
        
        // retrieve subscription details
        server.get("/subscription/:id", tryCatchWrap(function(req, res, next) {
            subscriptionDao
                .get(req.params.id)
                .done(function(result) {
                    res.send(result);
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
            .then(function() {
                endpointDao = new endpoint.EndpointDAO(db, log.child({endpointDao: true}));
                subscriptionDao = new subscription.SubscriptionDAO(db, log.child({subscriptionDao: true}));
                
                server.listen(listen_port, function() {
                    log.info("%s listening at %s", server.name, server.url);
                });
            })
            .done();
    }
    
    module.exports = {
        HookServer: HookServer
    };
})();
