"use strict";

var os     = require("os");
var fs     = require("fs");
var bunyan = require("bunyan");

var HookServer = require("./lib/hook-server").HookServer;

var log = bunyan.createLogger({
    name: "hub",
    level: "debug"
});

// if we're on linux, periodically count the number of open files
if (os.platform() === "linux") {
    var intervalId = setInterval(function() {
        fs.readdir("/proc/" + process.pid + "/fd/", function(err, entries) {
            if (err) {
                log.error(err, "unable to get fd count");
            } else {
                log.info(entries.length + " open file descriptors");
            }
        });
    }, 10000);
    
    // don't let the process keep running for our sake
    // intervalId.unref(); // not in node 0.8.12
}

new HookServer(7000, log);
