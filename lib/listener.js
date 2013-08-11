var fs = require('fs');
var path = require('path');
var os = require('os');
var util = require('util');

var async = require('async');
var mkdirp = require("mkdirp");
var _ = require("lodash");

var hooks = require("./hooks");
var log = require("./log");


var fsevents;
if (process.platform === "darwin") {
  try {
    fsevents = require('fsevents');
  } catch (e) {
    log.warn('native fsevents can not be required. This is not good');
  }
}

var Listener = function (_path) {
  var self = this;

  self.path = _path;
  self.watchers = {};
  self.running_hooks = {};

  log.log("Watching for changes in", _path);
  self.watch_path(self.path);
};

Listener.prototype.listener = function (parent_path, event, rel_to_parent_path) {
  var self = this, current, md5, created,
    abs_path = path.join(parent_path, rel_to_parent_path),
    buf_path = path.relative(self.path, abs_path);

  if (event === 'rename') {
    /* rename can fire under the following:
      thing was renamed
      new file was created
      file was moved
      file was deleted
    */
    self.handle_hook(abs_path);
  }
};

Listener.prototype.watch_path = function (_path) {
  var self = this;

  if (self.watchers[_path]) {
    log.debug("Already watching", _path);
    return;
  }

  if (!fsevents) {
    return self.node_watch_path(_path);
  }
  if (!_.isEmpty(self.watchers)) {
    return log.debug('Already have a watcher, ignoring watch request for', _path);
  }
  self.osx_watch_path(_path);
};

Listener.prototype.handle_hook = function (abs_path) {
  var self = this;

  fs.stat(abs_path, function (err, stats) {
    if (err) {
      log.log("Finished running hook for", abs_path);
      delete self.running_hooks[abs_path];
      return;
    }
    if (self.running_hooks[abs_path]) {
      return log.log('Already running hook for ', abs_path);
    }
    log.log("Running hook for", abs_path);
    self.running_hooks[abs_path] = Date.now();
    hooks.handle(abs_path, function (err, result) {
      if (err) {
        log.error(util.format("Error in hook for %s: %s", abs_path, err));
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

Listener.prototype.osx_watch_path = function (_path) {
  var self = this,
    watcher = fsevents(_path);

  watcher.on('created', function (abs_path) {
    self.handle_hook(abs_path);
  });

  watcher.on('deleted', function (abs_path) {
    self.handle_hook(abs_path);
  });

  watcher.on('moved-in', function (abs_path) {
    log.log("Moved in", abs_path);
    self.handle_hook(abs_path);
  });

  self.watchers[_path] = watcher;
};

Listener.prototype.node_watch_path = function (_path) {
  var self = this,
    paths,
    stats;

  /*jslint stupid: true */
  stats = fs.lstatSync(_path);
  /*jslint stupid: false */
  if (stats.isSymbolicLink()) {
    return log.error('Skipping adding %s because it is a symlink.', _path);
  }

  self.watchers[_path] = fs.watch(_path, self.listener.bind(self, _path));

  /*jslint stupid: true */
  paths = fs.readdirSync(_path);
  /*jslint stupid: false */

  _.each(paths, function (p) {
    var p_path = path.join(_path, p),
      stats;

    /*jslint stupid: true */
    stats = fs.lstatSync(p_path);
    /*jslint stupid: false */
    if (stats.isDirectory()) {
      self.watch_path(p_path);
    }
    // TODO: if file, run all the hooks
  });
};

module.exports = Listener;
