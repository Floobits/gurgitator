"use strict";

const path = require("path");
const util = require("util");

const _ = require("lodash");
const async = require("async");
const fs = require("fs-ext");
const log = require("floorine");


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
  /*eslint-disable no-sync */
  paths = fs.readdirSync(self.path);
  /*eslint-enable no-sync */

  self.load();
  _.each(paths, function (p) {
    var stats,
      p_path = path.join(self.path, p);
    /*eslint-disable no-sync */
    stats = fs.lstatSync(p_path);
    /*eslint-enable no-sync */
    if (stats.isDirectory()) {
      self.children[p_path] = new Hook(p_path, self);
    }
  });
  log.log(util.format("Processed hooks in %s", self.path));
};

Hook.prototype.stop = function () {
  var self = this;

  _.each(self.children, function (child, _path) {
    log.log("Stopping %s", _path);
    child.stop();
  });
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

Hook.prototype.handle = function (_path, handle_cb) {
  var self = this;

  if (!self.hook) {
    return handle_cb(util.format("No hook for %s", _path));
  }

  if (_path === self.hook_path) {
    self.load();
    return handle_cb();
  }

  let auto = {
    fd: function (cb) {
      fs.open(_path, "r", cb);
    },
    lock: ["fd", function (cb, res) {
      fs.flock(res.fd, "ex", cb);
    }],
    fstat: ["lock", function (cb, res) {
      fs.fstat(res.fd, cb);
    }],
    read: ["fstat", function (cb, res) {
      let total_bytes_read = 0;
      let size = res.fstat.size;

      let handle_read = function (err, bytes_read, buf) {
        if (err) {
          log.error("Error reading %s: %s", _path, err);
          return cb(err);
        }
        total_bytes_read += bytes_read;
        if (total_bytes_read < size) {
          log.debug(util.format("%s bytes left to read", size - total_bytes_read));
          return fs.read(res.fd, buf, total_bytes_read, size - total_bytes_read, total_bytes_read, handle_read);
        }
        return cb(err, buf);
      };
      handle_read(null, 0, new Buffer(size));
    }],
  };

  async.auto(auto, function (err, result) {
    fs.close(result.fd, function (close_err) {
      if (err || close_err) {
        return handle_cb(err || close_err);
      }
      try {
        let buf = result.read.toString();
        log.debug(_path, "data:", buf);
        let data = JSON.parse(buf);
        return self.hook(_path, data, handle_cb);
      } catch (e) {
        return handle_cb(e);
      }
    });
  });
};


const handle = function (_path, cb) {
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
