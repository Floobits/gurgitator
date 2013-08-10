#!/usr/bin/env node
var fs = require("fs");
var path = require("path");
var util = require("util");

var mkdirp = require('mkdirp');
var async = require("async");
var optimist = require("optimist");
var _ = require("lodash");

var hooks = require("./lib/hooks");
var Listener = require("./lib/listener");
var log = require("./lib/log");


var parse_args = function () {
  return optimist
    .usage('Usage: $0 [path_to_watch]')
    .describe('verbose', 'Enable debugging output.')
    .argv;
};

exports.run = function () {
  var cwd = process.cwd(),
    base_hook,
    listener,
    parsed_url,
    series = [function (cb) { cb(); }],
    raw_hooks = {},
    args = parse_args(),
    _path,
    on_room_info_cb = function () {};

  if (args._.length === 0) {
    _path = cwd;
  } else if (args._.length === 1) {
    _path = args._[0];
  } else {
    throw new Error("Invalid arguments. Only one path is allowed.");
  }
  _path = path.resolve(_path);
  _path = path.normalize(_path);

  if (args.verbose) {
    log.set_log_level("debug");
  }

  if (args.help || args.h) {
    optimist.showHelp();
    process.exit(0);
  }

  base_hook = new hooks.Hook(_path);
  listener = new Listener(_path, base_hook);
};
