var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');
var util = require('util');

var _ = require("lodash");

var log = require("./log.js");


var hooks = {};

var Hook = function (base_path, parent) {
  var self = this,
    paths;

  self.parent = parent;
  self.path = base_path;
  self.hook_path = path.join(self.path, "hook.js");
  hooks[self.path] = self;
  // Unused for now, but one day...
  self.children = {};

  log.log(util.format("Loading hooks in %s", self.path));
  /*jslint stupid: true */
  paths = fs.readdirSync(self.path);
  /*jslint stupid: false */

  self.load();
  _.each(paths, function (p) {
    var stats,
      p_path = path.join(self.path, p);
    /*jslint stupid: true */
    stats = fs.lstatSync(p_path);
    /*jslint stupid: false */
    if (stats.isDirectory()) {
      self.children[p_path] = new Hook(p_path, self);
    }
  });
  log.log(util.format("Loaded hooks in %s", self.path));
};

Hook.prototype.load = function () {
  var self = this,
    hook;

  log.log("Loading", self.hook_path);
  try {
    hook = require(self.hook_path);
    if (!_.isFunction(hook)) {
      throw new Error("Not a function: " + hook);
    }
  } catch (e) {
    return log.warn("No hooks found in", self.hook_path, ":", e.toString());
  }
  self.hook = hook;
  log.log("Loaded", self.hook_path);
};

Hook.prototype.handle = function (_path, user_cb) {
  var self = this,
    cb;

  cb = function (err, result) {
    if (err) {
      log.error(util.format("Error handling %s: %s", _path, err));
    }
    fs.unlink(_path, function (unlink_err, unlink_result) {
      if (unlink_err) {
        log.error(util.format("Error deleting %s: %s", _path, unlink_err));
      }
      user_cb(err || unlink_err, result);
    });
  };

  if (!self.hook) {
    return cb(util.format("No hook for %s", _path));
  }

  if (_path === self.hook_path) {
    self.load();
    return user_cb();
  }

  fs.readFile(_path, {flag: "r"}, function (err, data) {
    if (err) {
      return cb(err);
    }
    try {
      data = JSON.parse(data);
      return self.hook(_path, data, cb);
    } catch (e) {
      return cb(e);
    }
  });
};


var handle = function (_path, cb) {
  try {
    hooks[path.dirname(_path)].handle(_path, cb);
  } catch (e) {
    cb(e);
  }
};

module.exports = {
  Hook: Hook,
  handle: handle
};
