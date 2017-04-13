/*
homebrew.js: multi-domain home brew web hosting server 
created: 20161107 by dvcampbell, (c)2016 Enchanted Engineering, Tijeras NM.

Sets up a small multi-domain (~10 each) NodeJS homebrew web hosting service 
providing site-specific custom apps for webs, blogs, sockets, etc. 
Script ...
  1. Sets up some configuration info
  2. Creates each site
  3. Creates a reverse proxy to redirect requests to respective sites

SYNTAX:
  node homebrew.js [<configuration_file.json>]
  NODE_ENV=production node homebrew.js [<configuration_file.json>]
  
  where <configuration_file.json> defaults to ../restricted/config.json
*/ 

var VERSION = '1.00';

// load external modules...
require('./Extensions2JS');  // my additions to JS language
const WrapSQ3 = require('./WrapSQ3');  // SQLite3 database wrapper


// read the server configuration from a [cmdline specified] JS or JSON file or use default...
var cfgFile = process.argv[2] || '../restricted/config';
var cfg = require(cfgFile);

// define environment (production vs development) based on configuration ...
process.env.NODE_ENV = process.env.NODE_ENV || (cfg.env || {}).NODE_ENV || 'development';

// start transcripting and assign object to global space for other apps...
global.scribe = scribe = new (require('./Scribe'))(cfg.scribe);
scribe.log("Homebrew server setup...");

// load other shared modules
cfg.shared = {};
for (var s of (cfg.share || {})) { 
  cfg.shared[s.tag] = require(s.require)(s.options);
  scribe.info("Shared module %s loaded.", s.tag);  
  };

//ensure clean exit on Ctrl-C...
require('./Cleanup'); // adds process event handlers
// define app specific cleanup...
process.cleanup.app = function() { scribe.streamToLog('',true); };  // flush (save) the log file!

// dump the configuration for verbose debugging...
scribe.dump("CONFIG: %s", JSON.stringify(cfg,null,2));

// setup shared databases...
cfg.db = {};
var dbDef = (cfg.restricted || {}).databases || {};
for (var d of dbDef) {
  var dbCfg = typeof dbDef[d]=='object' ? dbDef[d] : { file: dbDef[d] };
  cfg.db[d] = new WrapSQ3(dbCfg,function (err) { 
    if (err) throw err;
    scribe.info("Database %s connected...", d); 
    });
  };

// prep each site configuration...
var sites = {};
for (var s of cfg.sites) {
  if (!cfg.sites[s].active) continue;
  scribe.info("Loading site definition[%s]...",s);
  // merge any global headers with local site headers, local headers given precedence...
  cfg.headers = mergekeys({"x-powered-by": "Raspberry Pi Homebrew NodeJS Server "+VERSION},cfg.headers);
  cfg.sites[s].headers = mergekeys(cfg.headers, cfg.sites[s].headers);
  // define app for site... create, start, run optional test...
  cfg.sites[s].tag = cfg.sites[s].tag || s; // default tag to index value
  cfg.sites[s].db = cfg.db; // pass shared database connections
  cfg.sites[s].shared = cfg.shared; // pass shared modules
  if (cfg.sites[s].app) {
    sites[s] = new (require(cfg.sites[s].app.require))(cfg.sites[s]);
    sites[s].start();
    scribe.info("Site[%s]: defined and started app '%s'",s,cfg.sites[s].app.require); 
    if (sites[s].test) sites[s].test(); // optional  
    };
  };

// define and start reverse proxy servers...
var Proxy = require('./hbProxy');
scribe.log("Homebrew proxy setup...");
var proxies = {};
for (var p of cfg.proxies) {
  cfg.proxies[p].tag = cfg.proxies[p].tag || p; // default tag to index value.
  cfg.proxies[p].routes = cfg.proxies[p].routes || {};  // default routes
  // define site specific routes...
  for (var tag of cfg.proxies[p].sites) {
    if (tag in cfg.sites&& cfg.sites[tag].active) {
      var route = cfg.sites[tag].host+':'+cfg.sites[tag].port;
      for (var alias of cfg.sites[tag].aliases) {
        cfg.proxies[p].routes[alias] = route;
        scribe.debug("Proxy[%s] route added: %s --> %s",p,alias,route);
        };
      };
    };
  proxies[p] = new Proxy(cfg.proxies[p]);
  proxies[p].start();
  scribe.info("Proxy server '%s' started on port %s",p,cfg.proxies[p].port);
  };

scribe.info("Homebrew setup complete...");
