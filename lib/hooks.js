var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');
var util = require('util');

var _ = require("lodash");

var log = require("./log");


var hooks = {};

var Hook = function (base_path, parent) {
  var self = this,
    paths;

  self.parent = parent;
  self.path = base_path;
  hooks[self.path] = self;
  // Unused for now, but one day...
  self.children = {};

  // self.on_hooks_change(function () {
  //   try {
  //     self.watcher = fs.watchFile(self.floo_path, self.on_hooks_change.bind(self));
  //     log.log("Watching " + self.floo_path + " for changes");
  //   } catch (e) {
  //     log.warn(util.format("Can not watch %s for hooks because %s", self.floo_path, e));
  //   }
  // });
  log.log(util.format("Loading hooks in %s", self.path));
  /*jslint stupid: true */
  paths = fs.readdirSync(self.path);
  /*jslint stupid: false */

  self.load_hooks();
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
};

Hook.prototype.load_hooks = function () {
  var self = this,
    hook,
    hook_path = path.join(self.path, 'hook');

  log.log("Loading", hook_path);
  try {
    self.hook = require(hook_path);
  } catch (e) {
    log.warn('no hooks found in ', hook_path);
  }
};

Hook.prototype.handle = function (_path, cb) {
  var self = this;

  if (!self.hook) {
    return log.error('can not handle ', _path);
  }

  fs.readFile(_path, {flag: "wx+"}, function (err, data) {
    if (err) {
      return cb(err);
    }
    try {
      data = JSON.parse(data);
      self.hook(_path, data, cb);
    } catch (e) {
      cb(e);
    }
  });
};


var handle = function (_path, cb) {
  hooks[_path].handle(_path, cb);
};

module.exports = {
  Hook: Hook,
  handle: handle
};
