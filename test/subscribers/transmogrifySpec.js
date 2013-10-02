"use strict";

var assert = require("assert-plus");
var bunyan = require("bunyan");
var Q      = require("q");
var sinon  = require("sinon");
var expect = require("chai").expect;

var SubscriptionDAO = require("../../lib/daos/subscription").SubscriptionDAO;

describe("transmogrify subscriber", function() {
    var dbMock;
    var dao;
    var log = bunyan.createLogger({name: "transmogrifySpec", level: "fatal"});
    
    beforeEach(function() {
        dbMock = {};
        
        dao = new SubscriptionDAO(
            dbMock,
            log.child({child: true})
        );
    });
    
    // This ensures the module gets loaded and verify() is called.
    it("creates a mogrification subscription", function(done) {
        dbMock.hmset = sinon.spy(function(key, val, cb) {
            expect(val.type).to.equal("mogrifier");
            
            cb();
        });
        
        dbMock.sadd = sinon.spy(function(key, val, cb) {
            cb();
        });
        
        dao
            .create("mogrifier", "desc", {
                name: "transmogrify",
                config: {
                    script: "function() {}"
                }
            }, [])
            .then(function(id) {
                assert.ok(id);
                
                assert.ok(dbMock.hmset.calledOnce);
                assert.ok(dbMock.sadd.calledOnce);
            })
            .done(done, done);
    });
    
    it("executes a mogrification subscription", function(done) {
        dbMock.hgetall = sinon.spy(function(key, cb) {
            cb(null, {
                tags: "",
                handler_name: "transmogrify",
                handler_config: JSON.stringify({
                    script: [
                        "function(subscriber_tags, publisher_tags, data) {",
                        "    publish('aType', ['aTag'], {baz: data.theAnswer});",
                        "    publish('anotherType', ['anotherTag'], {bap: data.theAnswer + 1});",
                        "}"
                    ].join("\n")
                })
            });
        });
        
        var handlerPromise = Q.defer();
        var publishSpy = sinon.spy(handlerPromise.resolve);
        
        dao
            .get("whatever")
            .then(function(sub) {
                assert.ok(dbMock.hgetall.calledOnce);
                
                sub.handle(
                    [], // tags
                    { theAnswer: 42 }, // data
                    publishSpy // publish
                );
                
                return handlerPromise.promise;
            })
            .then(function() {
                assert.ok(publishSpy.calledTwice);
                assert.ok(publishSpy.calledWithExactly("aType", ["aTag"], {baz: 42}));
                assert.ok(publishSpy.calledWithExactly("anotherType", ["anotherTag"], {bap: 43}));
            })
            .done(done, done);
    });

    // I really want a negative test, something that verifies the error is
    // handled if the script has an error, but there are no observable side
    // effects.
});
