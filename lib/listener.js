"use strict";

const path = require("path");
const util = require("util");

const _ = require("lodash");
const fs = require("fs-ext");
const log = require("floorine");

const hooks = require("./hooks");


var fsevents;

if (process.platform === "darwin") {
  try {
    fsevents = require("fsevents");
  } catch (e) {
    log.warn("native fsevents can not be required. This is not good");
  }
}

const IGNORED_FILENAMES = [
  "node_modules"
];

const Listener = function (_path) {
  var self = this;

  self.path = _path;
  self.watchers = {};
  self.running_hooks = {};

  log.log("Watching for changes in", _path);
  self.watch_path(self.path);

  self.run_hooks(self.path);
};

Listener.prototype.stop = function (cb) {
  var self = this,
    i = 0,
    poll_interval;

  self.handle_hook = function () { return; };

  poll_interval = setInterval(function () {
    if (_.size(self.running_hooks) === 0) {
      clearInterval(poll_interval);
      return cb();
    }
    i++;
    if (i > 10) {
      clearInterval(poll_interval);
      return cb("Timeout waiting for running hooks.");
    }
  }, 500);
};

Listener.prototype.is_ignored = function (_path) {
  return !!_.find(_path.split(path.sep), function (p) {
    return _.contains(IGNORED_FILENAMES, p);
  });
};

Listener.prototype.handle_hook = function (abs_path) {
  var self = this,
    filename = path.basename(abs_path);

  if (filename.length > 0) {
    if (filename[0] === ".") {
      log.debug("Ignoring hidden file", filename);
      return;
    }
  }

  if (path.extname(filename) !== ".json") {
    log.debug("Ignoring change for non-json file", abs_path);
    return;
  }

  if (self.is_ignored(abs_path)) {
    log.debug(abs_path, "is ignored.");
    return;
  }

  fs.stat(abs_path, function (stat_err, stats) {
    if (stat_err) {
      log.debug("Finished running hook for", abs_path);
      delete self.running_hooks[abs_path];
      return;
    }
    if (!stats.isFile()) {
      log.log(abs_path, "is not a file. Not running hook.");
      return;
    }
    if (self.running_hooks[abs_path]) {
      log.log("Already running hook for", abs_path);
      return;
    }
    log.log("Running hook for", abs_path);
    self.running_hooks[abs_path] = Date.now();
    hooks.handle(abs_path, function (err, result) {
      if (err) {
        log.error(util.format("Error in hook for %s: %s. Result %s", abs_path, err, result));
      }
      log.log(util.format("Ran hook for %s in %s seconds", abs_path, (Date.now() - self.running_hooks[abs_path]) / 1000));
      fs.unlink(abs_path, function (unlink_err) {
        if (unlink_err) {
          log.error(util.format("Error deleting %s: %s", abs_path, unlink_err));
        }
      });
    });
  });
};

Listener.prototype.watch_path = function (_path) {
  var self = this;

  if (self.watchers[_path]) {
    log.debug("Already watching", _path);
    return;
  }
  if (!fsevents) {
    self.node_watch_path(_path);
    return;
  }

  if (!_.isEmpty(self.watchers)) {
    log.debug("Already have a watcher, ignoring watch request for", _path);
    return;
  }
  if (self.is_ignored(_path)) {
    log.log("Not watching", _path, "because it's ignored.");
    return;
  }

  self.osx_watch_path(_path);
};

Listener.prototype.osx_watch_path = function (_path) {
  var self = this,
    watcher = fsevents(_path);

  watcher.on("created", function (abs_path) {
    self.handle_hook(abs_path);
  });

  watcher.on("deleted", function (abs_path) {
    self.handle_hook(abs_path);
  });

  watcher.on("moved-in", function (abs_path) {
    log.log("Moved in", abs_path);
    self.handle_hook(abs_path);
  });

  self.watchers[_path] = watcher;
  watcher.start();
};

Listener.prototype.listener = function (parent_path, event, rel_to_parent_path) {
  var self = this,
    abs_path = path.join(parent_path, rel_to_parent_path);
    // buf_path = path.relative(self.path, abs_path);

  if (event === "rename") {
    /* rename can fire under the following:
      thing was renamed
      new file was created
      file was moved
      file was deleted
    */
    self.handle_hook(abs_path);
  }
};

Listener.prototype.node_watch_path = function (_path) {
  const self = this;

  /*eslint-disable no-sync */
  const stats = fs.lstatSync(_path);
  /*eslint-enable no-sync */
  if (stats.isSymbolicLink()) {
    return log.error("Skipping adding %s because it is a symlink.", _path);
  }

  self.watchers[_path] = fs.watch(_path, self.listener.bind(self, _path));

  /*eslint-disable no-sync */
  const paths = fs.readdirSync(_path);
  /*eslint-enable no-sync */

  _.each(paths, function (p) {
    const p_path = path.join(_path, p);
    /*eslint-disable no-sync */
    const p_stats = fs.lstatSync(p_path);
    /*eslint-enable no-sync */
    if (p_stats.isDirectory()) {
      self.watch_path(p_path);
    }
    // TODO: if file, run all the hooks
  });
};

Listener.prototype.run_hooks = function (_path) {
  const self = this;

  /*eslint-disable no-sync */
  const paths = fs.readdirSync(_path);
  /*eslint-enable no-sync */

  _.each(paths, function (p) {
    var stats,
      p_path = path.join(_path, p);
    /*eslint-disable no-sync */
    stats = fs.lstatSync(p_path);
    /*eslint-enable no-sync */
    if (stats.isDirectory()) {
      return self.run_hooks(p_path);
    }
    if (stats.isFile()) {
      return self.handle_hook(p_path);
    }
  });
};

module.exports = Listener;
