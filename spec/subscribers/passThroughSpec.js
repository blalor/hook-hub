"use strict";

var bunyan = require("bunyan");
var expect = require("expect.js");
var sinon  = require("sinon");
var assert = require("assert");

var Q       = require("q");
var restify = require("restify");

var PassThrough = require("../../lib/subscribers/pass-through");

describe("pass-through subscriber", function() {
    var log = bunyan.createLogger({name: "mocha", level: "error"});

    var restServer;
    var stubServerUrl;
    
    beforeEach(function(done) {
        var deferred = Q.defer();

        restServer = restify.createServer({
            log: log.child({restify: true, level: "fatal"})
        });
        
        restServer.use(restify.jsonBodyParser()); // req.body

        restServer.listen(0, deferred.resolve);
        
        deferred.promise
            .then(function() {
                stubServerUrl = restServer.url;
            })
            .done(function() {
                done();
            }, done);
    });
    
    afterEach(function() {
        try {
            restServer.close();
        } catch (e) {
            log.info(e, "unable to close rest server");
        }
    });
    
    it("should POST data to the callback URL", function(done) {
        var deferred = Q.defer();

        restServer.post("/", function(req, res, next) {
            deferred.resolve(req.body);
            
            res.send(204);
            next();
        });
        
        var payload = {
            foo: "bar"
        };
        
        PassThrough.handle(
            "some-sub-id",
            ["tag1", "tag2"],
            ["pub_tag1", "pub_tag2"],
            {
                callback: stubServerUrl
            },
            payload
        );
        
        // do assertion in promise so that mocha is able to see any failures.
        // otherwise, if done in the body of the request handler, restify will
        // log it.
        deferred.promise
            .then(function(body) {
                expect(body).to.eql(payload);
            })
            .done(function() {
                done();
            }, done);
    });
});
