"use strict";

var path = require("path");
var Q    = require("q");

module.exports = function(grunt) {
    var targetDir = path.join(process.cwd(), "target");
    var packageRoot = path.join(targetDir, "package-root");

    // Load plugins
    require("time-grunt")(grunt);
    
    grunt.loadNpmTasks("grunt-contrib-clean");
    grunt.loadNpmTasks("grunt-contrib-jshint");
    grunt.loadNpmTasks("grunt-mocha-test");
    grunt.loadNpmTasks("grunt-prepare-install");
    grunt.loadNpmTasks("grunt-release");

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON("package.json"),
        clean: targetDir,
        jshint: {
            all: [
                "Gruntfile.js",
                "lib/**/*.js",
                "<%= mochaTest.test.src %>",
            ],
            options: {
                // .jshintrc used to allow compatibility with editors without
                // grunt
                jshintrc: ".jshintrc"
            }
        },
        mochaTest: {
            test: {
                src: [ "test/**/*.js" ]
            },
            xunit: { // for Jenkins
                src: [ "<%= mochaTest.test.src %>" ],
                options: {
                    reporter: "xunit",
                    quiet: true,
                    captureFile: path.join(targetDir, "xunit.xml")
                }
            }
        },
        prepare_install: {
            options: {
                tmpDir: targetDir,
                packageRoot: packageRoot,
                installPrefix: "hook-hub"
            }
        },
        release: {
            options: {
                tagName: "v<%= version %>",
                npm: false,
            }
        }
    });

    // define tasks
    grunt.registerTask("default", ["jshint", "test"]);
    grunt.registerTask("test", ["mochaTest:test"]);
    grunt.registerTask("ci", [
        "jshint",
        "test",
        "set-git-config",
        "prepare_install"
    ]);
    
    grunt.registerTask("set-git-config", function() {
        var done = this.async();
        
        Q.all([
            Q.ninvoke(grunt.util, "spawn", {cmd: "git", args: ["rev-parse", "--verify", "--short", "HEAD"]}),
            Q.ninvoke(grunt.util, "spawn", {cmd: "git", args: ["rev-parse", "--verify", "HEAD"]}),
            Q.ninvoke(grunt.util, "spawn", {cmd: "git", args: ["rev-parse", "--abbrev-ref", "HEAD"]}),
            Q.ninvoke(grunt.util, "spawn", {cmd: "git", args: ["show", "-s", "--format=%ct", "HEAD"]}),
            Q.ninvoke(grunt.util, "spawn", {cmd: "git", args: ["config", "remote.origin.url"]})
        ]).spread(function(hashShort, hash, ref, commitTime, remote) {
            grunt.config("git", {
                commit_id_abbrev: hashShort[0].stdout,
                commit_id:        hash[0].stdout,
                branch:           ref[0].stdout,
                commit_time:      new Date(parseInt(commitTime[0].stdout, 10) * 1000),
                remote_url:       remote[0].stdout
            });
        }).done(done, done);
    });
    
    // tar up the installed module; depends on prepare_install
    grunt.registerTask("tar-package", "create tarball", function() {
        this.requires("prepare_install");
        
        var done = this.async();
        
        grunt.util.spawn({
            cmd: "tar",
            args: [
                "-cz",
                "-f", path.join(targetDir, grunt.config.process("<%= pkg.name %>-<%= pkg.version %>.tar.gz")),
                "-C", packageRoot,
                "."
            ]
        }, function(err, result) {
            if (err) {
                throw err;
            }
            
            grunt.verbose.write(result);

            done();
        });
    });
};
