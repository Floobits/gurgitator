#!/usr/bin/env node
var fs = require("fs");
var path = require("path");
var util = require("util");

var mkdirp = require("mkdirp");
var async = require("async");
var optimist = require("optimist");
var _ = require("lodash");

var hooks = require("./lib/hooks");
var Listener = require("./lib/listener");
var log = require("./lib/log");


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

  log.log("Starting up...");
  base_hook = new hooks.Hook(_path);
  listener = new Listener(_path, base_hook);
};
