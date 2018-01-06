// utility.js (c) 2017 Enchanted Engineering
// Midddleware for a variety or utility tasks such as logging requests and setting headers...

exports = module.exports = function utility(options) {
  // this function called by an express app to initialize middleware...
  // Expects a site object context
  var site = this;
  var scribe = site.scribe;
  scribe.info("Middleware '%s' initialized", site.handler.tag);

  // this function called by express app for each page request...
  return function utilityMiddleware(rqst, rply, next) {
    //scribe.trace("utility...");
    var ip = rqst.headers['x-forwarded-for'] || rqst.connection.remoteAddress;
    ip = (rqst.socket.remotePort) ?  ip +':'+ rqst.socket.remotePort : ip;
    // the first items represent items performed independent of the request...
    // site request logging...
    if (options.logging) scribe.log("Request: %s (%s) -> %s", ip, rqst.method, rqst.url);
    // apply utility headers...
    if (options.localDate) rply.set("local", new Date().style("httpLocal"));
    if (options.ip) rply.set("ip",ip.part(/\d+\.\d+\.\d+\.\d+/,ip)); //ipv4 part or ipv6
    //scribe.trace("utility exit...");
    next();
    };
  };
