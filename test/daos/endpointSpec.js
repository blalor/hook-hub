"use strict";

var bunyan = require("bunyan");
var expect = require("chai").expect;
var sinon  = require("sinon");
var assert = require("assert");

var EndpointDAO = require("../../lib/daos/endpoint").EndpointDAO;

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
            expect(val.description).to.equal("desc");
            expect(val.type).to.equal("type");
            expect(val.tags).to.equal("tag1\0tag2");
            
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
            expect(key).to.equal("hookhub:endpoint:someId");
            
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

                expect(result.description).to.equal("desc");
                expect(result.type).to.equal("type");
                expect(result.tags.length).to.equal(2);
                expect(result.tags[0]).to.equal("tag1");
                expect(result.tags[1]).to.equal("tag2");
            })
            .done(done, done);
    });
});
