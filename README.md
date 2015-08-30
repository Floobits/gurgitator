# gurgitator

[![Floobits Status](https://floobits.com/Floobits/gurgitator.svg)](https://floobits.com/Floobits/gurgitator/redirect)

[![Build Status](https://travis-ci.org/Floobits/gurgitator.svg?branch=master)](https://travis-ci.org/Floobits/gurgitator)

[![#floobits on Freenode](https://img.shields.io/Freenode/%23floobits.png)](https://webchat.freenode.net/?channels=floobits)

[![npm](https://img.shields.io/npm/v/gurgitator.svg)](https://www.npmjs.com/package/gurgitator)

Watch for new files in a directory. Eat them and run jobs contained in them.

### Development status: Pretty stable. We've been using it in production for a couple of years.


## Installation

    npm install -g gurgitator


## Usage

    gurgitator /path/to/jobs


### Jobs directory

The jobs directory should contain sub-directories for each type of job you want to process. In each sub-directory, you need a hook.js. The on-disk layout should look like this:

    jobs
    ├─do_something
    │ └─hook.js
    ├─node_modules
    └─other_job
       └─hook.js


### Hook.js

`hook.js` should export a function that accepts three parameters:

1. The path of the file being handled.
2. An object containing the parsed JSON of the file being handled.
3. A callback for when your handler is finished.

Like so:

    module.exports = function (path, data, cb) {
      console.log(path, "contains", data);
      cb(); // Don't forget to call the callback!
    };


To exercise this code, `echo '{ "blah": "blah" } > /path/to/jobs/do_something/any_file_name.json'`. The only restriction on file names is that they must have the `.json` extension. Gurgitator ignores all other extensions.
