"use strict";

var bunyan     = require("bunyan");
var redis      = require("redis");
var Q          = require("q");

var HookServer   = require("./lib/hook-server").HookServer;
var endpoint     = require("./lib/daos/endpoint");
var subscription = require("./lib/daos/subscription");

var log = bunyan.createLogger({
    name: "hub",
    level: "debug"
});


// don't start listening until the database is ready for connections
var dbConnPromise = Q.defer();

var db = redis.createClient(
    process.env.DB_PORT_6379_TCP_PORT || 6379,
    process.env.DB_PORT_6379_TCP_ADDR || "127.0.0.1"
);

db.on("ready", dbConnPromise.resolve);
db.on("error", dbConnPromise.reject);

dbConnPromise.promise
    .done(function() {
        var endpointDao = new endpoint.EndpointDAO(db, log.child({endpointDao: true}));
        var subscriptionDao = new subscription.SubscriptionDAO(db, log.child({subscriptionDao: true}));
        
        new HookServer(7000, endpointDao, subscriptionDao, log);
    });

