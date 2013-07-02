"use strict";

var bunyan = require("bunyan");
var expect = require("expect.js");
var sinon  = require("sinon");
var assert = require("assert");

var EndpointDAO = require("../lib/daos/endpoint").EndpointDAO;

describe("endpoint dao", function() {
    var dbMock;
    var dao;
    
    beforeEach(function() {
        dbMock = {};
        
        dao = new EndpointDAO(
            dbMock,
            bunyan.createLogger({name: "endpoint", level: "fatal"})
        );
    });
    
    it("should save to redis", function(done) {
        dbMock.hmset = sinon.spy(function(key, val, cb) {
            expect(key).to.match(/^hookhub:endpoint:/);
            expect(val.description).to.be("desc");
            expect(val.type).to.be("type");
            expect(val.tags).to.be("tag1\0tag2");
            
            cb();
        });
        
        dao
            .create("desc", "type", ["tag1", "tag2"])
            .then(function(id) {
                assert(dbMock.hmset.calledOnce);

                expect(id).to.be.a("string");
            })
            .done(done, done);
    });
    
    it("should retrieve a value from redis", function(done) {
        dbMock.hgetall = sinon.spy(function(key, cb) {
            expect(key).to.be("hookhub:endpoint:someId");
            
            cb(null, {
                description: "desc",
                type: "type",
                tags: "tag1\0tag2"
            });
        });
        
        dao
            .get("someId")
            .then(function(result) {
                assert(dbMock.hgetall.calledOnce);

                expect(result.description).to.be("desc");
                expect(result.type).to.be("type");
                expect(result.tags.length).to.be(2);
                expect(result.tags[0]).to.be("tag1");
                expect(result.tags[1]).to.be("tag2");
            })
            .done(done, done);
    });
});
