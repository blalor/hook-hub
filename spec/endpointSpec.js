"use strict";

var bunyan = require("bunyan");

var EndpointDAO = require("../lib/daos/endpoint").EndpointDAO;

describe("endpoint dao", function() {
    var dbMock;
    var dao;
    
    beforeEach(function() {
        dbMock = createSpyObj("redis", [
            "hmset",
            "hgetall",
            "keys"
        ]);
        
        dao = new EndpointDAO(
            dbMock,
            bunyan.createLogger({name: "endpoint", level: "warn"})
        );
    });
    
    it("should save to redis", function(done) {
        dbMock.hmset.andCallFake(function(key, val, cb) {
            expect(key).toMatch(/^hookhub:endpoint:/);
            expect(val.description).toEqual("desc");
            expect(val.type).toEqual("type");
            expect(val.tags).toEqual("tag1\0tag2");
            
            cb();
        });
        
        dao
            .create("desc", "type", ["tag1", "tag2"])
            .then(function(id) {
                expect(id).toBeDefined();
                
                done();
            });
    });
    
    it("should retrieve a value from redis", function(done) {
        dbMock.hgetall.andCallFake(function(key, cb) {
            expect(key).toBe("hookhub:endpoint:someId");
            
            cb(null, {
                description: "desc",
                type: "type",
                tags: "tag1\0tag2"
            });
        });
        
        dao
            .get("someId")
            .then(function(result) {
                expect(result.description).toBe("desc");
                expect(result.type).toBe("type");
                expect(result.tags.length).toBe(2);
                expect(result.tags[0]).toBe("tag1");
                expect(result.tags[1]).toBe("tag2");
                
                done();
            });
    });
});
