"use strict";

var fs     = require("fs");
var bunyan = require("bunyan");

var HookServer = require("./lib/hook-server").HookServer;

var log = bunyan.createLogger({
    name: "hub",
    level: "debug"
});

fs.exists("/dev/fd", function(exists) {
    if (! exists) {
        log.warn("no /dev/fd; not counting fds");
    } else {
        var intervalId = setInterval(function() {
            fs.readdir("/dev/fd", function(err, entries) {
                if (err) {
                    log.error(err, "unable to get fd count");
                } else {
                    log.info(entries.length + " open file descriptors");
                }
            });
        }, 10000);
        
        // don't let the process keep running for our sake
        if (intervalId.unref) {
            // not in node 0.8.12
            intervalId.unref();
        }
    }
});

new HookServer(7000, log);
