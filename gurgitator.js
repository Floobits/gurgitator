#!/usr/bin/env node
"use strict";

const path = require("path");
const util = require("util");

const log = require("floorine");
const optimist = require("optimist");

const hooks = require("./lib/hooks");
const Listener = require("./lib/listener");


exports.run = function () {
  let base_hook;
  let listener;
  let _path;

  let args = optimist
    .usage("Usage: $0 [path_to_watch]")
    .describe("v", "Enable debugging output.")
    .boolean("v")
    .default("v", false)
    .argv;

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

  let exit = function (signal) {
    log.log(util.format("Got %s. Shutting down...", signal));

    try {
      base_hook.stop();
    } catch (e) {
      log.error(e);
    }

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
  listener = new Listener(_path);
  log.log("Hooks in %s", base_hook.path);
};
