// static.js - Midddleware for rendering static web pages...
// Copyright (c)2016 Enchanted Engineering

// returns static web content from specified folders (default *) of a source directory


// load dependencies...
var url = require('url');
var path = require('path');
var fs = require('fs');

// this function called by express app to initialize middleware...
exports = module.exports = Static = function Static(options) {
  var site = this;          // local reference for context
  var scribe = site.scribe;
  var source = path.isAbsolute(options.source) ? options.source : path.normalize(site.cfg.root + path.sep + options.source);
  var homepage = options.homepage || 'index.htm';
  var folders = options.folders || [];
  var listOK = options.listOK || false;
  /// var cached = options.cached || false;
  scribe.info("Middleware 'static' initialized for source: %s (%s)",source,folders.length?folders.toString():'*');
  
  // this function called by express app for each page request...
  return function staticMiddleware(rqst, rply, next) {
    //scribe.trace('static...');
    if (rqst.method=='GET') {
      var filename;
      // assume page may be predefined/modified by earlier middleware
      rqst.page = rqst.page || url.parse(rqst.url);
      rqst.page.folder = rqst.page.folder || rqst.page.path.slice(1,rqst.page.path.lastIndexOf('/'));
      // restrict to selected folders if defined
      if (folders.length&&folders.indexOf(rqst.page.folder)==-1) return next(); 
      if (rqst.page.href==='/') {
        // default homepage
        filename = source + path.sep + homepage;
        }
      else if (rqst.page.href.substr(-1)==='/') {
        // list files in a directory or homepage within subdirectory?
        if (listOK) {
          next(); /// list directory contents ... TBD
          }
        else {
          // look for homepage with subdirectory...
          filename = source + path.sep + rqst.page.pathname + path.sep + homepage;
          };
        }
      else {
        // build the absolute path to file...
        filename = source + path.sep + rqst.page.pathname;
        };
      filename = path.normalize(filename);  // cleanup filename
      scribe.debug("STATIC[%s]: %s",site.handler.tag,filename);
      fs.readFile(filename,
        function (err, data) {
          if (err) {
            // OK if it does not exist, try next middleware and return
            if (err.code=='ENOENT') return next();
            // for other errors, report and forward...
            scribe.error("STATIC[%s]: %s",filename,err.Error);
            next(err);
            }
          else {
            rply.type(path.extname(filename));
            rply.send(data);
            };
          }
        );
      }
    else {
      next();
      };
    //scribe.trace('static exit...');
    };
  };
