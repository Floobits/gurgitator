var path = require('path');
var util = require('util');

var _ = require("lodash");
var fs = require("fs-ext");

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

Hook.prototype.handle = function (_path, cb) {
  var self = this,
    fd;

  if (!self.hook) {
    return cb(util.format("No hook for %s", _path));
  }

  if (_path === self.hook_path) {
    self.load();
    return cb();
  }

  fs.open(_path, "r", function (err, fd) {
    fs.flock(fd, "ex", function (err) {
      if (err) {
        return cb(err);
      }
      fs.fstat(fd, function (err, stat) {
        if (err) {
          return cb(err);
        }
        var buf = new Buffer(stat.size),
          total_bytes_read = 0,
          data,
          handle_read;

        handle_read = function (err, bytes_read, buf) {
          total_bytes_read += bytes_read;
          if (total_bytes_read < stat.size) {
            log.debug(util.format("%s bytes left to read", stat.size - total_bytes_read));
            return fs.read(fd, buf, bytes_read, stat.size - bytes_read, bytes_read, handle_read);
          }
          fs.close(fd, function (err) {
            if (err) {
              return cb(err);
            }
            try {
              data = JSON.parse(buf.toString());
              return self.hook(_path, data, cb);
            } catch (e) {
              return cb(e);
            }
          });
        };

        fs.read(fd, buf, 0, stat.size, 0, handle_read);
      });
    });
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
