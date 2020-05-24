// module for a basic configurable website...

// app and middleware dependencies
const path = require('path');
const express = require('express');
const compression = require('compression');     // for compressing responses
const cookies = require('cookie-parser');       // for cookies
const bodyParser = require('body-parser');      // for JSON and urlencoded bodies
const https = require('https');

require('./Extensions2JS');
const crypto = require('./CryptoPlus');
const Scribe = require('./Scribe');             // transcripting
const WrapSQ3 = require('./WrapSQ3');           // SQLite3 database wrapper

const errMsgs = {
  400: "Bad Request",
  401: "NOT authorized!",
  403: "Forbidden",
  404: "File NOT found!",
  500: "Internal Server Error"
  };

// constructor for flexible site application based on user configuration...
module.exports = Site = function Site(context) {
  // homebrew server level items under context keys: db, env, headers, internals, scribe, services 
  // site specific configuration under context.site and context.tag;
  // added middleware context keys include: xApp, as well as changes to db and site, and a site specific scribe
  this.tag = context.tag;
  this.scribe = new Scribe({tag: context.tag, parent: context.scribe}.mergekeys(context.site.scribe||{}));
  // load server and site databases...
  // context.db has any global database handles, if any defined!
  // site context.site.databases holds local database definitions, which override global of same tag
  for (var d of context.site.databases||{}) {
    var db =(typeof context.site.databases[d]=='object') ? context.site.databases[d] : {file:context.site.databases[d]};
    var dbScribe = this.scribe;
    context.db[d] = new WrapSQ3(db,function (err,msg) {
      if (err) { dbScribe.error(msg); throw err; } else { dbScribe.log(msg); };
      });
    };
  // create Express app instance and add settings and locals...
  this.xApp = express();
  for (var key of (context.site.x||{}).settings||{}) this.xApp.set(key,context.site.x.settings[key]);
  for (let k in (context.site.x||{}).locals||{}) this.xApp.locals[k] = context.site.x.locals[k];
  // save the context/configuration (without introducing another level of hierarchy)
  for (let key of context) if (key!=='scribe') this[key] = context[key]; // but don't override site scribe
  };

// Site level wrapper for app[method] calls...
Site.prototype.addHandler = function (handler) {
  var handlerContext = { // 'this' context for handlers
    cfg: this.site, 
    db: this.db,
    env: this.env,
    handler: handler,
    internals: this.internals,
    scribe: this.scribe, // site specific instance
    services: this.services, 
    tag: this.tag, 
    xApp: this.xApp
    };
  if (typeof handler === 'function') {
    // essentially load built-in functions.
    this.xApp.use(handler);
    this.scribe.log("Added handler function '%s'",handler.name);
    }
  else if (typeof handler === 'object') {
    // load middleware...
    let method = handler.method || 'use';  // set method, default to 'use'
    handler.options = handler.options || {};
    if (handler.require) {
      // dynamically load code for handler
      var code = require(handler.require);
      // initialize code in correct context, which returns the xApp callback
      // include a path route argument if defined
      if (handler.route) {
        this.xApp[method](handler.route,code.call(handlerContext,handler.options));
        this.scribe.log("Added handler '%s' using method '%s' and route '%s'",handler.tag,method,handler.route);
        }        
      else {
        this.xApp[method](code.call(handlerContext,handler.options));  
        this.scribe.log("Added handler '%s' using method '%s'",handler.tag,method);
        };
      }
    else {
      if (handler.tag=='static') {
        var root = (handler.root!==undefined) ? handler.root : 'static';
        root = path.isAbsolute(root) ? root : path.normalize(this.site.root + path.sep + root);
        if (handler.route) {
          this.xApp.use(handler.route,express.static(root,handler.options));
          }
        else {
          this.xApp.use(express.static(root,handler.options));
          };
        this.scribe.log("Added handler 'express.%s' serving '%s'",handler.tag,root);
        };
      };
    }
  else {
      this.scribe.warn("Unknown handler '%s'",this.tag,handler);
    };
  };
  
Site.prototype.test = function test(t) {
  if (t && process.env.NODE_ENV=='development') this.scribe.debug("Test Call: %s", this.site.tag);
  };

Site.prototype.start = function start() {
  var self = this;
  var opts = ((this.site||{}).app||{}).options||{};
  // optional base support for compressing responses, cookies, parsing body json and x-www-form-urlencoded data
  if (opts.compression) this.xApp.use(compression()); 
  if (opts.cookies) this.xApp.use(cookies());
  if (opts.json) this.xApp.use(bodyParser.json()); 
  if (opts.url) this.xApp.use(bodyParser.urlencoded(opts.url));
  // basic site initialization middleware...
  this.scribe.trace("Initializing handler chain...");
  this.xApp.use(function init(rqst,rply,next){
    self.scribe.trace("RQST: %s", rqst.url);  // log request...
    // apply any (global and site specific) static headers passed to site...
    rqst.hb = {};
    for (var h in self.headers) rply.set(h,self.headers[h]);
    next(); // proceed to next middleware
    });
  if (opts.auth) {  // handle hbAuth internally so route is set correctly and at start of response chain
    let hA = {tag: 'auth', require: './hbAuth', route: ['/user/:rqrd1/:rqrd2/:opt1?',''], options: opts.auth};
    this.addHandler(hA);
    };
  // site-specific configured handlers
  this.site.handlers.forEach((handler)=>{this.addHandler(handler);});
  // handler to throw default error if this point reached since no handler replied
  // skipped if a real error occurs prior
  this.xApp.use(function(rqst,rply,next){  // catchall 
    if (opts.redirect) {
      let location = "https://"+rqst.hostname+rqst.originalUrl; 
      self.scribe.debug("Secure redirect: %s ==> %s", rqst.url, location);
      rply.redirect(location);      
      }
    else {
      self.scribe.trace("Throw default 404 error");
      next(404);
      };
    });
  // add error handler...
  if (self.site.errorHandler) { // custom site error handler...
    self.addhandler(errorHandler);
    }
  else {  // default error handler...
    self.scribe.debug("Using default error handler...");
    this.xApp.use(
      function defaultErrorHandler(err,rqst,rply,next) {
        if (err instanceof Object) {
          if (err.code) { // homebrew error {code: #, msg:'prompt'}...
            err.msg = err.msg || err.toString();
            self.scribe.warn('HOMEBREW INTERNAL ERROR[%s]: %s',err.code,err.msg);
            self.internals.Stat.inc(self.tag,err.code);
            rply.status(500).send('HOMEBREW INTERNAL ERROR['+err.code+']: '+err.msg);
            } 
          else {  // JavaScript/Node error...
            self.scribe.error('ERROR: %s %s (see transcript)',err.toString()||'?', err.stack.split('\n')[1].trim());
            self.internals.Stat.inc(self.tag,500);
            self.scribe.dump(err.stack);
            rply.status(500).send('INTERNAL SERVER ERROR: 500');
            };
          }
        else {  // normal http service errors
          var code = Number(err) in errMsgs ? Number(err) : 500;
          self.scribe.warn('OOPS[%s: %s] ==> (%s->%s) %s %s', code, errMsgs[code], rqst.ip, rqst.hostname, 
            rqst.method,rqst.originalUrl);
          self.internals.Stat.inc(self.tag,code);
          rply.status(code).send('OOPS[' + code + ']: ' + errMsgs[code]);
          };
        rply.end();
        }
      );
    };
  
  // start a server...
  if ('secure' in this.site) {
    let ssl = {};
    for (let k in this.site.secure) {
      try {
        ssl[k] = fs.readFileSync(this.site.secure[k], 'utf8');
        }
      catch (e) {
        this.scribe.error("Key/certificate file '%s' not found for secure proxy[%s]!",k, this.tag); 
        this.scribe.fatal("Proxy '%s' creation failed!", this.site.tag);
        };
      };
    https.createServer(ssl, this.xApp).listen(this.site.port);  // https site
    this.scribe.debug("HTTPS[%s:%s] server started for app '%s'", this.site.host, this.site.port, this.tag); 
    }
  else {
    this.xApp.listen(this.site.port);                           // http site
    this.scribe.debug("HTTP[%s:%s] server started for app '%s'", this.site.host, this.site.port, this.tag); 
    };
  };
