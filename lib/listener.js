var fs = require('fs');
var path = require('path');
var os = require('os');
var util = require('util');

var async = require('async');
var mkdirp = require("mkdirp");
var _ = require("lodash");

var log = require("./log");


var fsevents;
if (process.platform === "darwin") {
  try {
    fsevents = require('fsevents');
  } catch (e) {
    log.warn('native fsevents can not be required.  This is not good');
  }
}


var Listener = function (_path, conn, hooks) {
  var self = this;

  self.path = _path;
  self.conn = conn;
  self.bufs = {};
  self.paths_to_ids = {};
  self.watchers = {};
  self.expected_changes = {};
  self.hooks = hooks;
};

Listener.prototype.buf_by_path = function (rel_path) {
  var self = this,
    buf_id = self.paths_to_ids[rel_path];

  return self.bufs[buf_id];
};

Listener.prototype.listener = function (parent_path, event, rel_to_parent_path) {
  var self = this, current, md5, created,
    abs_path = path.join(parent_path, rel_to_parent_path),
    buf_path = path.relative(self.path, abs_path),
    buf = self.buf_by_path(buf_path);

  log.log(event, buf_path);

  if (event === 'rename') {
    /* rename can fire under the following:
      thing was renamed
      new file was created
      file was moved
      file was deleted
    */
    created = self.on_create(abs_path, buf);
    if (!created) {
      return self.on_delete(abs_path, buf);
    }
  }

  if (buf.buf === undefined) {
    return log.log('ignoring change');
  }

  self.on_change(abs_path, buf);
};

Listener.prototype.watch_path = function (_path, ig) {
  var self = this;

  if (self.watchers[_path]) {
    log.debug("Already watching", _path);
    return;
  }

  if (!fsevents) {
    return self.node_watch_path(_path, ig);
  }
  if (!_.isEmpty(self.watchers)) {
    return log.debug('Already have a watcher, ignoring watch request for', _path);
  }
  self.osx_watch_path(_path, ig);

};

Listener.prototype.on_create = function (abs_path, buf) {
  var self = this,
    current;

  log.log('created', abs_path);

  try {
    /*jslint stupid: true */
    current = fs.readFileSync(abs_path);
    /*jslint stupid: false */
  } catch (e) { }

  if (!current) {
    return;
  }

  // TODO: do something about this new file
  return true;
};

Listener.prototype.on_change = function (abs_path, buf) {
  var self,
    current;

  /*jslint stupid: true */
  current = fs.readFileSync(abs_path);
  /*jslint stupid: false */

};

Listener.prototype.on_delete = function (abs_path, buf) {
  var self = this;
};

Listener.prototype.on_rename = function (abs_path, buf) {
  var self = this;
};

Listener.prototype.osx_watch_path = function (_path, ig) {
  var self = this,
    get_buf,
    paths,
    stats,
    watcher = fsevents(_path);

  get_buf = function (abs_path) {
    var buf_path = path.relative(self.path, abs_path),
      buf = self.buf_by_path(buf_path);

    return [abs_path, buf];
  };

  watcher.on('created', function (abs_path) {
    self.on_create.apply(self, get_buf(abs_path));
  });

  watcher.on('deleted', function (abs_path) {
    self.on_delete.apply(self, get_buf(abs_path));
  });

  watcher.on('modified', function (abs_path) {
    self.on_change.apply(self, get_buf(abs_path));
  });

  watcher.on('moved-out', function (abs_path) {
    self.on_rename.apply(self, get_buf(abs_path));
  });

  watcher.on('moved-in', function (abs_path) {
    self.on_rename.apply(self, get_buf(abs_path));
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

Listener.prototype.create_buf = function (_path, ig) {
  var self = this,
    stats,
    buf,
    encoding,
    existing,
    ig_path,
    rel_path,
    paths;

  try {
    /*jslint stupid: true */
    stats = fs.lstatSync(_path);
    /*jslint stupid: false */
  } catch (e) {
    log.error(util.format('Error statting %s: %s', _path, e.toString()));
    return;
  }
  if (stats.isSymbolicLink()) {
    return log.error('Skipping adding %s because it is a symlink.', _path);
  }

  if (stats.isFile()) {
    rel_path = path.relative(self.path, _path);
    existing = self.buf_by_path(rel_path);
    if (existing) {
      return;
    }

    try {
      /*jslint stupid: true */
      buf = fs.readFileSync(_path);
      /*jslint stupid: false */
    } catch (e2) {
      log.error(util.format('Error readFileSync %s: %s', _path, e2.toString()));
      return;
    }
    return self.conn.send_create_buf({
      'buf': buf.toString(encoding),
      'encoding': encoding,
      'path': rel_path
    });
  }

  if (!stats.isDirectory()) {
    return;
  }

  try {
    /*jslint stupid: true */
    paths = fs.readdirSync(_path);
    /*jslint stupid: false */
  } catch (e3) {
    log.error(util.format('Error readdiring %s: %s', _path, e3.toString()));
    return;
  }

  _.each(paths, function (p) {
    var p_path = path.join(_path, p),
      stats;

    try {
      /*jslint stupid: true */
      stats = fs.lstatSync(p_path);
      /*jslint stupid: false */
    } catch (e) {
      log.error(util.format('Error lstatSync %s: %s', p_path, e.toString()));
      return;
    }
    self.create_buf(p_path);
  });
  return;
};



Listener.prototype.write = function (buf) {
  var self = this,
    fd,
    realpath = path.join(self.path, buf.path);

  if (buf.path === ".floo") {
    self.hooks.expect_md5(buf.md5);
  }

  log.log("Writing", buf.path);

  mkdirp(path.dirname(realpath), function (err) {
    if (err) {
      log.warn(err);
    }
    fs.writeFile(realpath, buf.buf, {encoding: buf.encoding}, function (err) {
      if (err) {
        return log.error(err);
      }
    });
  });
};

module.exports = Listener;
