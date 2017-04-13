// mapURL.js (c) 2016 Enchanted Engineering
// Midddleware for mapping incoming requests to different request...

var querystring = require('querystring');
var url = require('url');

exports = module.exports = function mapURL(options) {
  // this function called by an express app to initialize middleware...
  // Expects a site object context
  var site = this;
  var scribe = site.scribe;
  var redirects = options.redirect||{};
  var rewrites = [];
  for (var r of (options.rewrite||[])) {
    rewrites.push({
      search: r.search.toRegExp(),
      replace: r.replace,
      skip: r.skip,
      fix: r.fix
      });
    };
  scribe.info("Middleware '%s' initialized", site.handler.tag);
  scribe.trace("Site[%s,%s] redirects: %s", site.tag, site.handler.tag, JSON.stringify(redirects));
  scribe.trace("Site[%s,%s] rewrites:  %s", site.tag, site.handler.tag, JSON.stringify(rewrites));

  if (!(redirects || rewrites)) return function mapBypass(rqst,rply,next){ next(); };
  
  return function mapURL(rqst, rply, next) {
    // handle redirects...
    var location = url.parse(rqst.url);
    if (redirects.hasOwnProperty(location.pathname)) {
      location.pathname = redirects[location.pathname];
      location = url.format(location);
      scribe.debug("mapURL redirect: %s to %s", rqst.url, location);
      rqst.url = location;
      rqst.query = querystring.parse(url.parse(rqst.url).query)
      };
    //handle rewrites...
    for (var rw of rewrites) {
      if (rqst.url.match(rw.search)) {  // test if a match first, because 2 step change
        // if rewrite fix true, then fix querystring to add new parameters 
        location = (rw.fix) ? rqst.url.replace('?','&') : rqst.url;
        location = location.replace(rw.search,rw.replace);
        scribe.debug("mapURL rewrite: %s to %s", rqst.url, location);
        rqst.url = location;
        rqst.query = querystring.parse(url.parse(rqst.url).query);
        if (rw.skip) { break; };
        };
      };
    next(); // proceed to next middleware
    };
  };

  
  
