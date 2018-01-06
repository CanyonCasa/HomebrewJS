/*
proxy.js: reverese proxy server for multi-domain home brew web server 
created: 20161111 by dvcampbell, (c)2016 Enchanted Engineering, Tijeras NM.

This script defines a reverse proxy server for a small multi-domain NodeJS 
homebrew web hosting service. 

SYNTAX:
  var Proxy = require('./proxy');
  var proxy = new Proxy(<proxy-config>);
  proxy.start([<callback>]);
*/ 


var VERSION = '1.0';

// load module dependencies...
var http = require('http');
var Scribe = require('./Scribe');
var httpProxy = require('http-proxy');
var fs = require('fs');                 // file system

module.exports = Proxy = function Proxy(cfg) {
  cfg.scribe = cfg.scribe || {};
  cfg.scribe.tag = cfg.scribe.tag || cfg.tag;
  this.scribe = new Scribe(cfg.scribe);  // start transcripting ...
  this.probes = 0;
  this.cfg = cfg;
  this.scribe.trace("PROXY[v%s] tagged '%s' on port %s...",VERSION,cfg.tag,cfg.port);
  this.scribe.dump("PROXY CFG: %s",JSON.stringify(cfg.proxy,null,2));
  this.scribe.log("Proxy %s routes initialized...", cfg.tag);
  if (this.cfg.options.ssl) {
    // secure server so load credentials...
    // cfg.options.https points to public key and certificate files
    // that must be replaced with contents before call to proxy
    try {
      this.cfg.options.ssl.key = fs.readFileSync(this.cfg.options.ssl.key, 'utf8');
      this.cfg.options.ssl.cert = fs.readFileSync(this.cfg.options.ssl.cert, 'utf8');
      this.scribe.info("Proxy '%s' public key and certificate initialized...", cfg.tag);
      }
    catch (e) {
      this.scribe.error("No key or certificate found for secure proxy '%s'!",cfg.tag); 
      this.scribe.error("Proxy %s creation failed!", cfg.tag);
      //process.gracefulExit(1);
      };
    };
  this.proxy = httpProxy.createServer(this.cfg.options);
  this.scribe.log("Proxy '%s' created...", cfg.tag);
  };

// default generic reverse proxy callback...
Proxy.prototype.router = function router() {
  var self = this;
  self.proxy.on('error', function(err, rqst, rply) {
    self.scribe.error("Trapped internal proxy exception![%s]: %s:%s", err.code, err.address, err.port);
    try {
      rply.writeHead(500);
      rply.end("Oops!, Server Error!");
      }
    catch (e) {
      self.scribe.warn("Exception handling Proxy Exception![%s]: %s:%s", e.code, e.address, e.port);
      };
    });

  return function (rqst, rply) {
    var route = self.cfg.routes[rqst.headers.host] || '';
    var ip = rqst.headers['x-forwarded-for']||rqst.connection.remoteAddress||'?';
    if (route) { 
      self.scribe.debug("PROXY[%s->%s]: %s %s", ip, rqst.headers.host, rqst.method, rqst.url);
      self.proxy.web(rqst, rply, {target: route});
      }
    else {
      rply.writeHead(404, {"Content-Type": "text/plain"});
      rply.write("404 Proxy Route Not Found\n");
      if (ip.match('192.168.0')) {  // local diagnostics
        self.scribe.debug("NO PROXY ROUTE %s->%s: %s", ip, rqst.headers.host, rqst.url);
        for (var r of self.cfg.routes) {
          self.scribe.trace("  ROUTE[%s]: %s", r, self.cfg.routes[r]);
          rply.write("  ROUTE["+r+"]: "+self.cfg.routes[r]+"\n");
          };
        }
      else {
        self.probes += 1;
        self.scribe.warn("NO PROXY ROUTE[%d] %s->%s: %s", self.probes, ip, rqst.headers.host, rqst.url);
        };
      rply.end();
      };
    };
  };

// launch proxy servers...
// dedicated http server needed to intercept and route to multiple targets.
Proxy.prototype.start = function start(callback) {
  this.server = http.createServer(callback || this.router()).listen(this.cfg.port);
  this.scribe.info("Proxy '%s' service started in %s mode listening on %d...", this.cfg.tag, process.env.NODE_ENV, this.cfg.port);
  };
