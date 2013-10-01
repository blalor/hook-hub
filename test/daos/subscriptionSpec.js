"use strict";

var bunyan = require("bunyan");
var expect = require("expect.js");
var sinon  = require("sinon");
var assert = require("assert");

var SubscriptionDAO = require("../../lib/daos/subscription").SubscriptionDAO;

describe("subscription dao", function() {
    var dbMock;
    var dao;
    var log = bunyan.createLogger({name: "subscriptionSpec", level: "fatal"});
    
    beforeEach(function() {
        dbMock = {};
        
        dao = new SubscriptionDAO(
            dbMock,
            log.child({child: true})
        );
    });
    
    it("should save to redis", function(done) {
        var handler = {
            name: "pass-through",
            config: {
                callback: "http://localhost/whatever"
            }
        };
        
        var subId;
        
        dbMock.hmset = sinon.spy(function(key, val, cb) {
            expect(key).to.match(/^hookhub:subscription:/);
            subId = key.split(":")[2];
            
            expect(val.type).to.be("type");
            expect(val.description).to.be("desc");
            expect(val.handler_name).to.be(handler.name);
            expect(JSON.parse(val.handler_config)).to.eql(handler.config);
            expect(val.tags).to.be("tag1\0tag2");
            
            cb();
        });

        dbMock.sadd = sinon.spy(function(key, val, cb) {
            expect(key).to.be("hookhub:sub_type:type");
            expect(val).to.be(subId);
            
            cb();
        });
        
        dao
            .create("type", "desc", handler, ["tag1", "tag2"])
            .then(function(id) {
                expect(id).to.be(subId);
                
                assert(dbMock.hmset.calledOnce);
                assert(dbMock.sadd.calledOnce);
            })
            .done(done, done);
    });
    
    it("should retrieve a value from redis", function(done) {
        var handler_config = {
            callback: "http://some/url"
        };
        
        dbMock.hgetall = sinon.spy(function(key, cb) {
            expect(key).to.be("hookhub:subscription:someId");
            
            cb(null, {
                tags: "tag1\0tag2",
                handler_name: "pass-through",
                handler_config: JSON.stringify(handler_config)
            });
        });
        
        dao
            .get("someId")
            .then(function(result) {
                var val = result.valueOf();

                expect(val.tags.length).to.be(2);
                expect(val.tags[0]).to.be("tag1");
                expect(val.tags[1]).to.be("tag2");

                expect(val.handler_name).to.be("pass-through");
                expect(val.handler_config).to.eql(handler_config);
                
                assert(dbMock.hgetall.calledOnce);
            })
            .done(done, done);
    });
    
    it("retrieves subscriptions matching a type", function(done) {
        var type = "someType";
        var subId = "someSubId";
        
        dbMock.smembers = sinon.spy(function(key, cb) {
            expect(key).to.be("hookhub:sub_type:" + type);
            
            cb(null, [subId]);
        });
        
        dbMock.hgetall = sinon.spy(function(key, cb) {
            cb(null, {
                type: type,
                description: "description",
                tags: "",
                handler_name: "pass-through",
                handler_config: JSON.stringify({callback: "http://localhost/"})
            });
        });
        
        dao
            .getByTypeAndTags(type, [])
            .then(function(subs) {
                expect(subs.length).to.be(1);
                expect(subs[0].valueOf().id).to.be(subId);
                
                assert(dbMock.smembers.calledOnce);
                assert(dbMock.hgetall.calledOnce);
            })
            .done(done, done);
    });
    
    it("retrieves a subscription with matching tags", function(done) {
        var type = "someType";
        var subId = "someSubId";
        
        dbMock.smembers = sinon.spy(function(key, cb) {
            expect(key).to.be("hookhub:sub_type:" + type);
            
            cb(null, [subId]);
        });
        
        dbMock.hgetall = sinon.spy(function(key, cb) {
            cb(null, {
                type: type,
                description: "description",
                tags: "tag1",
                handler_name: "pass-through",
                handler_config: JSON.stringify({callback: "http://localhost/"})
            });
        });
        
        dao
            .getByTypeAndTags(type, ["tag1"])
            .then(function(subs) {
                expect(subs.length).to.be(1);
                expect(subs[0].valueOf().id).to.be(subId);
                
                assert(dbMock.smembers.calledOnce);
                assert(dbMock.hgetall.calledOnce);
            })
            .done(done, done);
    });
    
    it("excludes subscriptions whose tags don't match", function(done) {
        var type = "someType";
        var subId = "someSubId";
        
        dbMock.smembers = sinon.spy(function(key, cb) {
            expect(key).to.be("hookhub:sub_type:" + type);
            
            cb(null, [subId]);
        });
        
        dbMock.hgetall = sinon.spy(function(key, cb) {
            cb(null, {
                type: type,
                description: "description",
                tags: "tag1\0tag2",
                handler_name: "pass-through",
                handler_config: JSON.stringify({callback: "http://localhost/"})
            });
        });
        
        dao
            .getByTypeAndTags(type, ["tag1"])
            .then(function(subs) {
                expect(subs.length).to.be(0);
                
                assert(dbMock.smembers.calledOnce);
                assert(dbMock.hgetall.calledOnce);
            })
            .done(done, done);
    });
    
    it("deletes a subscription by id", function(done) {
        var subId = "someSubId";
        var type = "someType";
        
        dbMock.hgetall = sinon.spy(function(key, cb) {
            cb(null, {
                type: type,
                description: "description",
                tags: "",
                handler_name: "pass-through",
                handler_config: JSON.stringify({callback: "http://localhost/"})
            });
        });
        
        dbMock.srem = sinon.spy(function(key, val, cb) {
            expect(key).to.be("hookhub:sub_type:" + type);
            expect(val).to.be(subId);
            
            cb();
        });
        
        dbMock.del = sinon.spy(function(key, cb) {
            expect(key).to.be("hookhub:subscription:" + subId);
            
            cb();
        });
        
        dao
            .del(subId)
            .then(function() {
                assert(dbMock.hgetall.calledOnce);
                assert(dbMock.srem.calledOnce);
                assert(dbMock.del.calledOnce);
            })
            .done(done, done);
    });
});
