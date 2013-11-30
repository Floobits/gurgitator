#!/usr/bin/env node
var fs = require("fs");
var path = require("path");
var util = require("util");

var _ = require("lodash");
var async = require("async");
var log = require("floorine");
var mkdirp = require("mkdirp");
var optimist = require("optimist");

var hooks = require("./lib/hooks");
var Listener = require("./lib/listener");


var parse_args = function () {
  return optimist
    .usage('Usage: $0 [path_to_watch]')
    .describe('v', 'Enable debugging output.')
    .boolean('v')
    .default('v', false)
    .argv;
};

exports.run = function () {
  var base_hook,
    exit,
    listener,
    args = parse_args(),
    _path;

  if (args._.length === 0) {
    log.error("I need a path to watch.");
    process.exit(1);
  } else if (args._.length === 1) {
    _path = args._[0];
  } else {
    log.error("Invalid arguments. Only one path is allowed.");
    process.exit(1);
  }
  _path = path.resolve(_path);
  _path = path.normalize(_path);

  if (args.v) {
    log.set_log_level("debug");
  }

  if (args.help || args.h) {
    optimist.showHelp();
    process.exit(0);
  }

  exit = function (signal) {
    log.log(util.format("Got %s. Shutting down...", signal));

    listener.stop(function (err) {
      if (err) {
        log.error("Error stopping litener:", err);
        return process.exit(1);
      }
      log.log("Bye bye!");
      process.exit(0);
    });
  };

  process.on("SIGINT", function () { exit("SIGINT"); });
  process.on("SIGTERM", function () { exit("SIGTERM"); });

  log.log("Starting up...");
  base_hook = new hooks.Hook(_path);
  listener = new Listener(_path, base_hook);
};
