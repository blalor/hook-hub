"use strict";

var bunyan = require("bunyan");
var expect = require("chai").expect;

var Q       = require("q");
var restify = require("restify");

var PassThrough = require("../../lib/subscribers/pass-through");


describe("pass-through subscriber", function() {

    describe("#validate()", function () {
        it("should accept basic config object with callback string", function() {
            var goodBasicConfig = {
                "callback": "IM A STRING"
            };

            var validateFn = function() {
                PassThrough.validate(goodBasicConfig);
            };

            expect(validateFn).to.not.throw(Error);
        });

        it("should accept config object with optional method string", function() {
            var goodConfig = {
                "callback": "IM A STRING",
                "method": "IM ALSO A STRING"
            };

            var validateFn = function() {
                PassThrough.validate(goodConfig);
            };

            expect(validateFn).to.not.throw(Error);
        });

        it("should accept config object with optional use_extra_path boolean", function() {
            var goodConfig = {
                "callback": "IM A STRING",
                "use_extra_path": true
            };

            var validateFn = function() {
                PassThrough.validate(goodConfig);
            };

            expect(validateFn).to.not.throw(Error);
        });

        it("should reject invalid config type", function() {
            var badConfig = "wtfman!";

            var validateFn = function() {
                PassThrough.validate(badConfig);
            };

            expect(validateFn).to.throw(Error);
        });

        it("should reject config with missing callback", function() {
            var badConfig = {};

            var validateFn = function() {
                PassThrough.validate(badConfig);
            };

            expect(validateFn).to.throw(Error);
        });

        it("should reject config with non-string callback", function() {
            var badConfig = {
                "callbackurl": 123
            };

            var validateFn = function() {
                PassThrough.validate(badConfig);
            };

            expect(validateFn).to.throw(Error);        });

        it("should reject config with non-string config.method", function() {
            var badConfig = {
                "callbackurl": "IM A STRING",
                "method": true
            };

            var validateFn = function() {
                PassThrough.validate(badConfig);
            };

            expect(validateFn).to.throw(Error);
        });

        it("should reject config with non-boolean use_extra_path", function() {
            var badConfig = {
                "callbackurl": "IM A STRING",
                "use_extra_path": "wtfman!"
            };

            var validateFn = function() {
                PassThrough.validate(badConfig);
            };

            expect(validateFn).to.throw(Error);
        });
    });

    describe("#handle()", function(){
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
        
        it("should by default POST data to the callback URL", function(done) {
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
        
        it("should configurably GET data from the callback URL", function(done) {
            var deferred = Q.defer();

            restServer.get("/", function(req, res, next) {
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
                    callback: stubServerUrl,
                    method: "GET"
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
        
        it("should POST data to the extended callback URL", function(done) {
            var extra_path_bits = "extra/path/bits";
            var deferred = Q.defer();

            restServer.post("/" + extra_path_bits, function(req, res, next) {
                deferred.resolve(req.body);
                
                res.send(204);
                next();
            });

            var payload = {
                foo: "bar"
            };
            
            var payloadWithExtraPath = {
                foo: "bar",
                extra_path: extra_path_bits
            };
            
            PassThrough.handle(
                "some-sub-id",
                ["tag1", "tag2"],
                ["pub_tag1", "pub_tag2"],
                {
                    callback: stubServerUrl,
                    use_extra_path: true
                },
                payloadWithExtraPath
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
        
        it("should GET data to the extended callback URL", function(done) {
            var extra_path_bits = "extra/path/bits";
            var deferred = Q.defer();

            restServer.get("/" + extra_path_bits, function(req, res, next) {
                deferred.resolve(req.body);
                
                res.send(204);
                next();
            });

            var payload = {
                foo: "bar"
            };
            
            var payloadWithExtraPath = {
                foo: "bar",
                extra_path: extra_path_bits
            };
            
            PassThrough.handle(
                "some-sub-id",
                ["tag1", "tag2"],
                ["pub_tag1", "pub_tag2"],
                {
                    callback: stubServerUrl,
                    use_extra_path: true,
                    method: "GET"
                },
                payloadWithExtraPath
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
});
