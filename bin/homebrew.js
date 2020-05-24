/*
homebrew.js: multi-domain homebrew web hosting server 
created: 20161107 by dvcampbell, (c)2018 Enchanted Engineering, Tijeras NM.

Sets up a small multi-domain (<10 each) NodeJS homebrew web hosting service 
providing site-specific custom apps for webs, blogs, sockets, etc. 
Script ...
  1. Sets up some configuration info
  2. Defines shared services available to all sites
  3. Creates/launches each site
  4. Creates a reverse proxy to redirect requests to respective sites

SYNTAX:
  node homebrew.js [<configuration_file.json>]
  NODE_ENV=production node homebrew.js [<configuration_file.json>]
  
  where <configuration_file.json> defaults to ../restricted/config.json
*/ 

// load external modules...
const fs = require('fs');
require('./Extensions2JS');  // my additions to JS language
var WrapSQ3 = require('./WrapSQ3');  // SQLite3 database wrapper
var Scribe = require('./Scribe');

// read the server configuration from a [cmdline specified] JS or JSON file or use default...
var cfg = require(process.argv[2] || '../restricted/config');
cfg.VERSION = fs.statSync(__filename).mtime.toLocaleString();

// define environment (production vs development) based on configuration, default development ...
var env = {}.mergekeys(cfg.env||{});
env.NODE_ENV = process.env.NODE_ENV = process.env.NODE_ENV || env.NODE_ENV || 'development';

// start transcripting; object passed to other site apps in context...
var scribe = new Scribe(cfg.scribe);
scribe.info("Homebrew[%s] server setup in %s mode...", cfg.VERSION, process.env.NODE_ENV);

//ensure clean exit on Ctrl-C...; pass cleanup callback
require('./Cleanup')(()=>{scribe.flush('... Closing transcript')}); // adds process event handlers

// dump the configuration for verbose debugging...
scribe.dump("CONFIG: %s", JSON.stringify(cfg,null,2));

// setup (shared) databases...
// site apps can use these or open connections to dedicated databases
var db = {};
for (var d of cfg.databases||{}) {
  // definition can specify a defined JSON object or just a filename
  var dbDef = typeof cfg.databases[d]=='object' ? cfg.databases[d] : { file: cfg.databases[d] };
  db[d] = new WrapSQ3(dbDef,function (err,msg) { 
    if (err) { scribe.error(msg); throw err; } else { scribe.log(msg); };
    });
  };

// establish internal server and event handler
var internals = require('./hbInternals')({scribe: scribe, cfg:cfg.command});
internals.Stat.set('brew','VERSION',cfg.VERSION);
internals.Stat.set('brew','up',new Date().toLocaleString());

// shared services; passed db handles, scribe, and command emitter...
var services = {};
for (var s of (cfg.shared||{})) {
  if (cfg.shared[s].require) {
    scribe.debug("Loading shared service [%s]...",s);
    let context = {internals: internals, db: db, tag: cfg.shared[s].tag||s, scribe: scribe, cfg:cfg.shared[s].options||{}};
    services[s] = new (require(cfg.shared[s].require))(context);
    for (var c of cfg.shared[s].init) services[s][c](cfg.shared[s].init[c]);
    };
  };

// prep each site configuration...
var sites = {};
for (var s of cfg.sites) {
  let scfg = cfg.sites[s];  // shorthand reference
  if (!scfg.active) continue;
  scfg.tag = scfg.tag || s; // force a default tag
  if (scfg.app && scfg.app.require) {
    scribe.debug("Creating site[%s] context...",scfg.tag);
    // configuration with top level refs for app and default "x-powered-by" header 
    var context = {db: db, env: env, headers:{"x-powered-by": "Raspberry Pi Homebrew NodeJS Server "+cfg.VERSION}, 
      internals: internals, scribe: scribe, services: services, site: scfg, tag: scfg.tag}; 
    // + specified global headers (cfg.headers) and site headers (scfg.headers), given precedence...
    context.headers.mergekeys(cfg.headers).mergekeys(scfg.headers);
    // define app for each site (host)... create, start, and run optional test...
    sites[s] = new (require(scfg.app.require))(context);
    for (var c of scfg.app.init||{}) { // run any initialization methods
      sites[s][c](scfg.app.init[c]);
      };
    scribe.info("Site[%s]: initialized '%s' hosting %s:%s",scfg.tag,scfg.app.require,scfg.host,scfg.port); 
    }
  else {
    scribe.info("Site[%s] hosting %s:%s",scfg.tag,scfg.host,scfg.port); 
    };
  internals.Stat.set("site",s,{host: scfg.host, port: scfg.port, name: scfg.name});
  };

// define and start reverse proxy servers...
var Proxy = require('./hbProxy');
scribe.log("Homebrew proxy setup...");
var proxies = {};
for (var p of cfg.proxies) {
  let pcfg = cfg.proxies[p];  // shorthand reference
  if (!pcfg.active) continue;
  pcfg.tag = pcfg.tag || p;   // default tag to index value.
  pcfg.routes = pcfg.routes || {};  // default routes
  // define site specific routes...
  for (var tag of pcfg.sites) {
    if (tag in cfg.sites && cfg.sites[tag].active) {
      var route = cfg.sites[tag].host + ((cfg.sites[tag].port) ? ':'+cfg.sites[tag].port : '');
      // add site alias routes
      for (var alias of cfg.sites[tag].aliases) {
        pcfg.routes[alias] = route;
        scribe.debug("Proxy[%s] route added: %s --> %s",p,alias,route);
        };
      };
    };
  var context = {cfg: pcfg, db: db, env: env, internals: internals, scribe: scribe, 
    services: services, tag: pcfg.tag};
  proxies[p] = new Proxy(context);
  proxies[p].start();
  };

services.notify.sendText({text:"Homebrew Server started on host "+cfg.host},function(){scribe.info("Homebrew setup complete...")});
