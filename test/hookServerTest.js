"use strict";
// below is set to tell jshint to ignore the chaijs expect(something).to.be.null; lines
/*jshint expr: true*/

var bunyan = require("bunyan");
var portfinder = require("portfinder");

var expect  = require("chai").expect;
var Q       = require("q");
var request = require("request");

var HookServer = require("../lib/hook-server").HookServer;

describe("hook server", function() {
    var log = bunyan.createLogger({
        name: "hook-server",
        level: "error"
    });

    var server;
    var endpoint;
    var mockEndpointDao;
    var mockSubscriptionDao;
    
    beforeEach(function(done) {
        mockEndpointDao = {};
        mockSubscriptionDao = {};
        
        portfinder.getPort(function (err, port) {
            if (err) {
                done(err);
            } else {
                server = new HookServer(port, mockEndpointDao, mockSubscriptionDao, log);
                endpoint = "http://localhost:" + port;
                
                done();
            }
        });
    });
    
    afterEach(function() {
        mockSubscriptionDao = null;
        mockEndpointDao = null;
        endpoint = null;
        server = null;
    });
    
    it("accepts published POST data with extra path info", function(done) {
        mockEndpointDao.get = function() {
            // return a mock endpoint
            return new Q({
                type: "whatever",
                tags: []
            });
        };
        
        mockSubscriptionDao.getByTypeAndTags = function() {
            // return an empty list of subscriptions
            return new Q([]);
        };
        
        request.post({
            url: endpoint + "/publish/some-id/baz/bap",
            json: {
                foo: "bar"
            }
        }, function(err, resp) {
            expect(err).to.be.null;
            expect(resp.statusCode).to.equal(204);
            
            done();
        });
    });
    
    it("accepts published POST data without extra path info", function(done) {
        mockEndpointDao.get = function() {
            // return a mock endpoint
            return new Q({
                type: "whatever",
                tags: []
            });
        };
        
        mockSubscriptionDao.getByTypeAndTags = function() {
            // return an empty list of subscriptions
            return new Q([]);
        };

        request.post({
            url: endpoint + "/publish/some-id",
            json: {
                foo: "bar"
            }
        }, function(err, resp) {
            expect(err).to.be.null;
            expect(resp.statusCode).to.equal(204);
            
            done();
        });
    });
});
