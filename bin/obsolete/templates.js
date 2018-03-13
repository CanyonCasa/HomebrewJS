// templates.js - Midddleware for rendering dynamic templates...
// Copyright (c)2016 Enchanted Engineering

// load dependencies...
var url = require('url');
var fs = require('fs');
var path = require('path');
var async = require('async');
var pug = require('pug');
const mkdn = new (require('showdown')).Converter();
var mustache = require('mustache');

const scrub = require('./Laundromat').scrub;
var mark;

exports = module.exports = Templates = function Templates(options) {
  // this function called by express app to initialize middleware...
  var site = this;          // local reference for context
  var scribe = site.scribe;
  var route = options.route;
  var src = options.templates;
  var src = path.isAbsolute(options.templates) ? options.templates : path.normalize(site.cfg.root + path.sep + options.templates);
  var filterFile = options.filter;
  var pugCfg = options.pug||{};
  var soap = {};
  var cache = {};
  var active =[];

  // compile template by filename ...
  // function doesn't return an error so that it doesn't interrupt async call!
  function compileTemplate(name,callback) {
    var [base,ext] = (name+'.').split('.',2); // split name into base & ext
    if (['pug','md','mkdn','json'].indexOf(ext)>-1) {
      scribe.trace("templates: Compiling template: " + name);
      var tmp={name:base,ext:ext,file:base+'.'+ext,path:src+'/'+name};
      fs.readFile(tmp.path, {encoding:'utf8'},function (err, data) {
        if (err) {
          tmp.err = err;
          tmp.msg = "templates: Reading template failed: " + name;
          }
        else {
          tmp.err = false;
          tmp.data = data;
          if (ext=='pug') {
            try {
              tmp.fx = pug.compile(data,pugCfg);
              tmp.msg = "templates: Pug template compiled: " + name;
              }
            catch (e) {
              tmp.err = e;
              tmp.msg = "templates: Pug template compile failed: " + name;
              };
            }
          else if (ext=='md'||ext=='mkdn') {
            try {
              tmp.md = mkdn.makeHtml(data);
              tmp.msg = "templates: Markdown template compiled: " + name;
              }
            catch (e) {
              tmp.err = e;
              tmp.msg = "templates: Markdown template compile failed: " + name;
              };
            }
          else if (ext=='json') { // actually not a template but filtering info
            try {
              tmp.soap = JSON.parse(data);
              tmp.msg = "templates: Template filter loaded: " + name;
              } 
            catch (e) {
              tmp.err = e;
              tmp.msg = "templates: JSON parsing failed: " + name;
              };
            };
          };
        scribe[tmp.err?'error':'info'](tmp.msg);
        if (name==filterFile) {
          soap = tmp.soap;
          } 
        else {
          cache[base] = Object.assign(cache[base]||{},ext=='json'?{soap:tmp.soap}:tmp);
          };
        callback(null,tmp); // no error, at it would interrupt mapLimit
        });
      }
    else {  // no compiler
      scribe.warn("templates: No compiler for: " + name);
      callback(null,tmp); // no error, at it would interrupt mapLimit
      };
    };

  //  watch templates folder for changes...
  if (options.watch) {
    scribe.info('templates: File watch established for %s', src);
    fs.watch(src, {persistent: true}, 
      function watch (event, filename) {
        if (event=='change' && filename) {
          // check for recursion of same action
          if (active.indexOf(filename)==-1) {
            // not presently flagged for recompiling
            active.push(filename); // add name to list being compiled
            // add a delay to allow multiple file system events to propagate
            setTimeout(
              function() {
                scribe.debug('templates: Recompiling updated template: %s', filename);
                compileTemplate(filename,
                  function (err, tmp) {
                    scribe.debug('templates: Recompiled template[%]: %s', tmp.base, filename);
                    active.splice(active.indexOf(filename),1);
                    }
                  );
                },
              options.wait || 1000
              );
            };
          };
        return;
        }
      );
    };

  // asynchronously read and precompile all files in folder...
  mark = new Date().getTime();
  fs.readdir(src, 
    function(err,files) {
      if (err) {
        // an error listing folder...
        scribe.error("templates: Error reading templates folder: %s", 
          JSON.stringify(err));
        }
      else {
        // compile each template serially, use async to limit 3 at a time...
        async.mapLimit(files, 3, compileTemplate, 
          function() { 
            // entered when compiling of all files is complete...
            mark = new Date().getTime() - mark;
            scribe.info("templates[%d/%d in %ss]: Template precompiling done!",
              Object.keys(cache).length, files.length, mark/1000);
            active = [];  // clear list to prepare for watch
            }
          );
        };
      }
    );
  scribe.info("Middleware 'templates' initialized...");
  
  // this function called by express app for each page request...
  return function templatesMiddleware(rqst, rply, next) {
    var m = rqst.url.match(route);    // test for url pattern...
    if (m==null) return next(); // no match proceeds to next middleware
    if (rqst.method=='GET') {
      var page = rqst.page || url.parse(rqst.url); // may be defined by upstream middleware
      var template = rqst.url=='/' ? 'index' : m[0];
      scribe.debug("templates GET URL: %s --> %s",rqst.url,template);
      // aggregated parameters, filtered and sent to all pages
      var params = scrub({body: rqst.body, query: rqst.query, page: page},cache[template].soap||soap[template]||{});
      try {
        mark = new Date().getTime();
        if (template in cache) {
          if (cache[template].fx) {
            cache[template].html = cache[template].fx(params);
            rply.send(cache[template].html);
            }
          else if (cache[template].md) {
            cache[template].html = mustache.render(cache[template].md,params);
            rply.send(cache[template].html);
            }
          else {
            scribe.debug("templates: Template %s not supported.", template);
            rply.send(400,'BAD REQUEST: Template not supported!');
            };
          }
        else {
          scribe.debug("templates: Template %s not found.", template);
          rply.send(404,'TEMPLATE NOT FOUND');
          };
        mark = new Date().getTime() - mark;
        scribe.debug("Template retrieved: %ss", mark/1000);
        }
      catch (e) {
        next(e);
        };
      }
    else {
      next(400, 'BAD REQUEST: Template method not supported');
      };
    };
  };
