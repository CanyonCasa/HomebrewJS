/*
proxy.js: reverse proxy server for multi-domain homebrew web server 
(c)2018 Enchanted Engineering, Tijeras NM.

proxy.js script defines a reverse proxy server for a small multi-domain NodeJS 
homebrew web hosting service with custom routing logic that maps hostname to backend server.

For secure proxies (i.e. https), under proxy configuration define key: 
  {secure: {key: <path_to_key_file>, cert: <path_to_cert_file>}}
  This module allows secrets to be updated (in the background) without stopping server (i.e. Let's Encrypt);
  for now, assumes all hosts on same certificate!

SYNTAX:
  var Proxy = require('./hbProxy');
  var proxy = new Proxy(<proxy-config>);
  proxy.start([<callback>]);
*/ 

// load module dependencies...
var http = require('http');
var https = require('https');
var httpProxy = require('http-proxy');
const tls = require('tls');
var fs = require('fs');                 // file system
var url = require('url');
var Scribe = require('./Scribe');

module.exports = Proxy = function Proxy(context) {
  this.context = context;
  this.tag = context.tag;
  this.cfg = context.cfg;
  this.scribe = new Scribe({tag:context.tag, parent: context.scribe}.mergekeys(context.cfg.scribe||{}));
  let ignore = (context.cfg.report||{}).ignore || ['192.168.0','127.0.0'];
  this.ignore = (typeof ignore=='string') ? [ignore] : ignore;
  // if secure server, configure it...
  if ('secure' in context.cfg) this.initSecure(context.cfg.secure);
  this.proxy = httpProxy.createServer(context.cfg.options||{});
  this.scribe.info("PROXY[%s] initialized...",context.tag);
  };

Proxy.prototype.initSecure = function initSecure(cfg) {
  this.secure = {};
  this.loadSecrets(cfg.files); // occurs synchronously since files specified 
  this.secure.options = {SNICallback: this.SNICallback()};
  this.context.internals.Events.on(cfg.renew||this.tag,(action)=>{if (action==='renew') this.loadSecrets()});
  return this.secure.options;
  };

// loads secure context files synchronously or asynchronously
Proxy.prototype.loadSecrets = function (files) {
  let secrets = {};
  if (files!==undefined) {  // sync load
    this.secure.files = files;
    try {
      for (var f in files) secrets[f] = fs.readFileSync(files[f], 'utf8');
      }
    catch (e) {
      this.scribe.error("Key/certificate file '%s:%s' not found for secure proxy[%s]!",f, files[f], this.tag); 
      this.scribe.fatal("Proxy '%s' creation failed!", this.tag);
      };
    this.secure.secrets = secrets;
    this.secure.changed = true;
    this.scribe.trace("Key/certificate files loaded..."); 
    }
  else if (this.secure.files!==undefined) {  // async load
    let list = Object.keys(this.secure.files);
    var self = this;
    function series(f) {
      if (f) {
        fs.readFile(self.secure.files[f],'utf8',(e,d)=> {
          if (e) return self.scribe.error("Key/certificate file[%s,%s] load error: %s",f,self.secure.files[f],e); 
          secrets[f] = d;
          self.scribe.trace("Loaded Key/certificate file %s",f); 
          series(list.shift());
          });
        }
      else {    // finalize async
        self.secure.secrets = secrets;
        self.secure.changed = true;
        self.scribe.info("Key/certificate files reloaded..."); 
        };
      };
    series(list.shift());
    }
  else {
    throw "Required proxy secrets files (key/cert) not defined!"
    };
  };

// default SNI callback for secure proxies
Proxy.prototype.SNICallback = function SNICallback() {
  var self = this;
  return function SNICB(host,cb) {
    if (self.secure.changed) {
      self.secure.changed = false;
      self.secure.context = tls.createSecureContext(self.secure.secrets);
      self.scribe.debug("Secure Context updated...");
      };
    cb(null,self.secure.context);
    };
  };

// default generic reverse proxy callback...
Proxy.prototype.router = function router() {
  var self = this;
  this.proxy.on('error', (err) => {
    self.scribe.error("Trapped internal proxy exception!:", err.toString());
    self.context.internals.Stat.inc(self.tag,'ERROR');
    try {
      rply.writeHead(500);
      rply.end("Oops!, Server Error!");
      self.scribe.dump("Returned proxy exception!: %s", err.toString());
      }
    catch (e) {
      self.scribe.warn("Exception handling Proxy Exception!: %s", e.toString());
      };
    });
//  this.proxy.on('upgrade',(req,socket,head)=> {
//    scribe.warn('upgrade: ',req.headers,req.url);
//    self.proxy.ws(req,socket,head);
//    });

  return function proxyRouter(rqst, rply) {
	// extract request host , method, url
    let [host, method, url] = [rqst.headers.host||'', rqst.method, rqst.url];
    // check if redirect...
    let redirect = (self.cfg.redirects||{})[host];
    if (redirect) {
      //rply.writeHead(301, {'Location':redirect, 'Expires': (new Date).toGMTString()});
      rply.writeHead(301, {'Location':redirect});
      rply.end();
      self.scribe.warn("PROXY REDIRECT %s -> %s", host, redirect);
      return;
      };
    let route = self.cfg.routes[host];
    let wildroute = self.cfg.routes['*.' + host.substr(host.indexOf('.')+1)];
    let ip = rqst.headers['x-forwarded-for']||rqst.connection.remoteAddress||'?';
    if (route||wildroute) {
      self.context.internals.Stat.inc(self.tag,'served');
      self.scribe.debug("PROXY[%s->%s]: %s %s (@%s)", ip, host, method, url, route||wildroute);
      self.proxy.web(rqst, rply, {target: route||wildroute});
      }
    else {
      if (!self.ignore.some(function(x){ return ip.match(x)})) {  
        // ignore diagnostics for local or specified addresses or nets
        let probes = self.context.internals.Stat.inc(self.tag,'probes');
        self.scribe.note("NO PROXY ROUTE[%d] %s->(%s): %s %s", probes, ip, host, method, url);
        };
      rply.writeHead(404, "Proxy Route Not Found!" ,{"Content-Type": "text/plain"});
      rply.write("404: Proxy Route Not Found!");
      rply.end();
      };
    };
  };

// launch proxy servers...
// dedicated http server needed to intercept and route to multiple targets.
Proxy.prototype.start = function start(callback) {
  if (this.secure!==undefined) {
    this.server = https.createServer(this.secure.options, callback||this.router());
    this.server.on('upgrade',(req,socket,head)=> {
console.log('secure: ',req.headers,req.url);
      this.proxy.ws(req,socket,head);
      });
    this.server.listen(this.cfg.port);
    this.scribe.info("SECURE PROXY service started for '%s' @ %s...", this.cfg.tag, this.cfg.port);
    }
  else {  
    this.server = http.createServer(callback||this.router());
    this.server.on('upgrade',(req,socket,head)=> {
console.log('insecure: ',req.headers);
      this.proxy.ws(req,socket,head);
      });
    this.server.listen(this.cfg.port);
    this.scribe.info("PROXY service started for '%s' @ %s...", this.cfg.tag, this.cfg.port);
    };
  this.context.internals.Stat.set("proxy",this.cfg.tag,{port: this.cfg.port, secure: (this.secure!==undefined)});
  };
