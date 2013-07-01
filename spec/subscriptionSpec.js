"use strict";

var bunyan = require("bunyan");

var SubscriptionDAO = require("../lib/daos/subscription").SubscriptionDAO;

describe("subscription dao", function() {
    var dbMock;
    var dao;
    var log = bunyan.createLogger({name: "subscriptionSpec", level: "trace"});
    
    beforeEach(function() {
        dbMock = createSpyObj("redis", [
            "hmset",
            "hgetall",
            "sadd",
            "srem",
            "smembers",
            "keys",
            "del"
        ]);
        
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
        
        dbMock.hmset.andCallFake(function(key, val, cb) {
            expect(key).toMatch(/^hookhub:subscription:/);
            subId = key.split(":")[2];
            
            expect(val.type).toEqual("type");
            expect(val.description).toEqual("desc");
            expect(val.handler_name).toEqual(handler.name);
            expect(JSON.parse(val.handler_config)).toEqual(handler.config);
            expect(val.tags).toEqual("tag1\0tag2");
            
            cb();
        });

        dbMock.sadd.andCallFake(function(key, val, cb) {
            expect(key).toEqual("hookhub:sub_type:type");
            expect(val).toEqual(subId);
            
            cb();
        });
        
        dao
            .create("type", "desc", handler, ["tag1", "tag2"])
            .done(function(id) {
                expect(id).toEqual(subId);
                
                done();
            });
    });
    
    it("should retrieve a value from redis", function(done) {
        var handler_config = {
            callback: "http://some/url"
        };
        
        dbMock.hgetall.andCallFake(function(key, cb) {
            expect(key).toEqual("hookhub:subscription:someId");
            
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

                expect(val.tags.length).toBe(2);
                expect(val.tags[0]).toEqual("tag1");
                expect(val.tags[1]).toEqual("tag2");

                expect(val.handler_name).toEqual("pass-through");
                expect(val.handler_config).toEqual(handler_config);
                
                done();
            });
    });
    
    it("retrieves subscriptions matching a type", function(done) {
        var type = "someType";
        var subId = "someSubId";
        
        dbMock.smembers.andCallFake(function(key, cb) {
            expect(key).toEqual("hookhub:sub_type:" + type);
            
            cb(null, [subId]);
        });
        
        dbMock.hgetall.andCallFake(function(key, cb) {
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
            .done(function(subs) {
                expect(subs.length).toBe(1);
                expect(subs[0].valueOf().id).toEqual(subId);
                
                done();
            });
    });
    
    it("retrieves a subscription with matching tags", function(done) {
        var type = "someType";
        var subId = "someSubId";
        
        dbMock.smembers.andCallFake(function(key, cb) {
            expect(key).toEqual("hookhub:sub_type:" + type);
            
            cb(null, [subId]);
        });
        
        dbMock.hgetall.andCallFake(function(key, cb) {
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
            .done(function(subs) {
                expect(subs.length).toBe(1);
                expect(subs[0].valueOf().id).toEqual(subId);
                
                done();
            });
    });
    
    it("excludes subscriptions whose tags don't match", function(done) {
        var type = "someType";
        var subId = "someSubId";
        
        dbMock.smembers.andCallFake(function(key, cb) {
            expect(key).toEqual("hookhub:sub_type:" + type);
            
            cb(null, [subId]);
        });
        
        dbMock.hgetall.andCallFake(function(key, cb) {
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
            .done(function(subs) {
                expect(subs.length).toBe(0);
                
                done();
            });
    });
    
    it("deletes a subscription by id", function(done) {
        var subId = "someSubId";
        var type = "someType";
        
        dbMock.hgetall.andCallFake(function(key, cb) {
            cb(null, {
                type: type,
                description: "description",
                tags: "",
                handler_name: "pass-through",
                handler_config: JSON.stringify({callback: "http://localhost/"})
            });
        });
        
        dbMock.srem.andCallFake(function(key, val, cb) {
            expect(key).toEqual("hookhub:sub_type:" + type);
            expect(val).toEqual(subId);
            
            cb();
        });
        
        dbMock.del.andCallFake(function(key, cb) {
            expect(key).toEqual("hookhub:subscription:" + subId);
            
            cb();
        });
        
        dao
            .del(subId)
            .done(done);
    });
});
