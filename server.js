"use strict";

var bunyan = require("bunyan");
var HookServer = require("./lib/hook-server").HookServer;

var log = bunyan.createLogger({
    name: "hub",
    level: "debug"
});

new HookServer(7000, log);
