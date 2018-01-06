// module for a basic configurable website...

// dependencies
var express = require('express');
var bodyParser = require('body-parser');
var multer = require('multer'); // v1.0.5
var upload = multer(); // for parsing multipart/form-data
const crypto = require('crypto');
const Scribe = require('./Scribe');
const WrapSQ3 = require('./WrapSQ3');  // SQLite3 database wrapper

const errMsgs = {
  400: "Bad Request",
  401: "NOT authorized!",
  403: "Forbidden",
  404: "File NOT found!",
  500: "Internal Server Error"
  };

var secret = function (key,hash,digest) {
  hash = hash || 'sha256';
  key = key || Math.random().toString(36).substr(4,16).toUpperCase();
  digest = digest || 'hex';
  return crypto.createHash(hash).update(key).digest(digest);
  };

// constructor for flexible site application based on user configuration...
module.exports = Site = function Site(cfg) {
  this.tag = cfg.tag;
  // establish transcript parameters, or inherit global if not provided.
  cfg.scribe = cfg.scribe || {tag:cfg.tag.toUpperCase()};
  // use global scribe if same tag or create App spcific scribe.
  this.scribe = cfg.scribe.tag===global.scribe.tag ? global.scribe : new Scribe(cfg.scribe);
  // create a site specific secret
  cfg.restricted = cfg.restricted || {};
  cfg.restricted.secret = secret(cfg.restricted.key);
  // load global and site databases...
  cfg.db = cfg.db || {};
  var dbDef = cfg.restricted.databases || {};
  for (var d of dbDef) {
    var dbCfg = typeof dbDef[d]=='object' ? dbDef[d] : { file: dbDef[d] };
    cfg.db[d] = new WrapSQ3(dbCfg,function (err) { 
      if (err) throw err; 
      scribe.info("Database %s connected...", d); 
      });
    };
  // save the configuration and create the express app...
  cfg.app.options = cfg.app.options || {};
  this.cfg = cfg;
  this.xApp = express();
  for (var key of cfg.app.options) this.xApp.set(key,cfg.app.options[key]);
  if (process.env.NODE_ENV=='development') this.scribe.debug("Secret[%s]: %s", cfg.tag,cfg.restricted.secret);
  };

Site.prototype.use = function addHandler(handler) {
  var site = {cfg: this.cfg, db: this.cfg.db, handler: handler, shared: this.cfg.shared, scribe: this.scribe, tag: this.tag, xApp: this.xApp};
  if (typeof handler === 'function') {
    this.xApp.use(handler);
    this.scribe.log("Site[%s]: Added handler function '%s'",this.tag,handler.name);
    }
  else if (typeof handler === 'object') {
    if (handler.require) {
      // dynamically load code for handler
      var code = require(handler.require);
      // initialize code in correct context, which returns the xApp callback
      this.xApp.use(code.call(site,handler.options));  
      this.scribe.log("Site[%s]: Added handler '%s'",this.tag,handler.tag);
      };
    }
  else {
      this.scribe.warn("Site[%s]: Unknown handler '%s'",this.tag,handler);
    };
  };
  
Site.prototype.listen = function listen() {
  this.xApp.listen(this.cfg.port);
  };

Site.prototype.test = function test() {
  if (process.env.NODE_ENV=='development') this.scribe.debug("Test Call: %s", this.cfg.tag);
  };

Site.prototype.start = function start() {
  var cfg = this.cfg;
  var self = this;
    // base support...
    // for parsing body json and x-www-form-urlencoded data
    this.xApp.use(bodyParser.json()); 
    this.xApp.use(bodyParser.urlencoded({ extended: true }));
    // basic site initialization middleware...
    this.xApp.use(function init(rqst,rply,next){
      //self.scribe.trace("init handler chain...");
      // apply any global and site specific static headers...
      for (var h in cfg.headers) rply.set(h,cfg.headers[h]);
      next(); // proceed to next middleware
      });
    // site-specific configured handlers
    cfg.handlers.forEach(function(handler) { self.use(handler); });
    // throw default error if this point reached since no handler replied
    this.xApp.use(function(rqst,rply,next){
      var code = cfg.error ? cfg.error.code||500 : 404;
      self.scribe.trace("Throw default error: ",code);
      next(code);
      });
    // add error handler...
    if (cfg.error && cfg.error.handler) {
      self.scribe.debug("Loading config specified error handler...");
      self.use(cfg.error.handler);
      }
    else {  // default error handler...
      self.scribe.debug("Using default error handler...");
      var selfScribe = this.scribe;
      this.xApp.use(
        function defaultErrorHandler(err,rqst,rply,next) {
          if (err instanceof Object) {
            if (err.code) {
              // homebrew error {code: #, msg:'prompt'}...
              selfScribe.warn('HOMEBREW INTERNAL ERROR[%s]: %s',err.code,err.msg);
              rply.status(err.code).send('HOMEBREW INTERNAL ERROR: ' + err.asJx());
              } 
            else {
              // JavaScript/Node error...
              selfScribe.error('ERROR: %s %s (see transcript)',err.toString()||'?', err.stack.split('\n')[1].trim());
              selfScribe.dump(err.stack);
              rply.status(500).send('INTERNAL SERVER ERROR: 500');
              };
            }
          else {
            var code = Number(err) in errMsgs ? Number(err) : 500;
            var msg = errMsgs[code];
            selfScribe.warn('*ERROR[%s]: %s',code,msg);
            rply.status(code).send('ERROR[' + code + ']: ' + msg);
            };
          }
        );
      };
  this.listen();
  };
