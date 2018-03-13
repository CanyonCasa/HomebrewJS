// mapURL.js (c) 2018 Enchanted Engineering
// Midddleware for mapping incoming requests to different request...

require('./Extensions2JS');
var qs = require('qs');
var url = require('url');

module.exports = mapURL = function mapURL(options) {
  // this function called by an express app to initialize middleware...
  // Expects a site object as this context
  var site = this;
  var scribe = site.scribe;
  var redirect = options.redirect||{};
  var rewrite = [];
  for (var r of (options.rewrite||[])) {
    rewrite.push({
      search: r.search.toRegExp(),
      replace: r.replace,
      skip: r.skip,
      fix: r.fix
      });
    };
  scribe.info("Middleware '%s' initialized", site.handler.tag);
  scribe.trace("Middleware '%s' redirect rules: %s", site.handler.tag, redirect.asJx());
  scribe.trace("Middleware '%s' rewrite rules:  %s", site.handler.tag, rewrite.asJx());

  if (!(Object.keys(redirect).length || Object.keys(rewrite).length)) {
    scribe.warn("Middleware '%s' bypassed for lack for rules definition...", site.handler.tag);
    return function mapBypass(rqst,rply,next){ next(); };
  };
  
  return function mapURLMiddleware(rqst, rply, next) {
    // handle redirect: reports new file back to client...
    let location = url.parse(rqst.url);
    if (redirect[location.pathname]) {
      location.pathname = redirect[location.pathname];
      location = url.format(location);
      scribe.debug("mapURL[redirect]: %s ==> %s", rqst.url, location);
      return rply.redirect(location);
      };
    //handle rewrites: transparently maps to other internal site location...
    for (let i in rewrite) {
      let rule = rewrite[i];
      if (rqst.originalUrl.match(rule.search)) {  // test if a match first, because 2 step change
        location = rqst.originalUrl.replace(rule.search,rule.replace);
        scribe.debug("mapURL[rewrite:%d] %s ==> %s", i, rqst.url, location);
        rqst.originalUrl = location;
        rqst.query = qs.parse(url.parse(rqst.originalUrl).query); // reparse in case changed
        if (rule.skip) break;
        };
      };
    next(); // proceed to next middleware
    };
  };

  
  
