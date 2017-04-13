// utility.js (c) 2017 Enchanted Engineering
// Midddleware for a variety or utility tasks such as 
//   logging requests and echoing request information...

exports = module.exports = function utility(options) {
  // this function called by an express app to initialize middleware...
  // Expects a site object context
  var site = this;
  var scribe = site.scribe;
  var pattern = new RegExp(options.pattern || '\/(echo|ip|info|msg)(?:\/([\\w\\s%]+))*');
  scribe.info("Middleware '%s' initialized with pattern '%s'", site.handler.tag,pattern);
  // temporary, should be able to remove at some point when handled by hpBaseApp.js
  function parseCookies (request) {
    var list = {},
    rc = request.headers.cookie;
    rc && rc.split(';').forEach(function( cookie ) {
      var parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
      }
    );
    return list;
    };

  // this function called by express app for each page request...
  return function utilityMiddleware(rqst, rply, next) {
    var ip = rqst.headers['x-forwarded-for'] || rqst.connection.remoteAddress;
    ip = (rqst.socket.remotePort) ?  ip +':'+ rqst.socket.remotePort : ip;
    // the first items represent items performed independent of the request...
    // site request logging...
    if (options.logging) scribe.log("Request: %s (%s) -> %s", ip, rqst.method, rqst.url);
    // apply metrics headers...
    if (options.localDate) rply.set("local", new Date().style("httpLocal"));
    if (options.ip) rply.set("ip",ip);
    
    // these items reply with diagnostic info for the specific url pattern...
    var m = rqst.url.match(pattern);    // test for url pattern...
    if (m!==null) {
      var info = {};
      if (m[1]=='info' && process.env.NODE_ENV==='development' && options.diagnostics) { 
        info.cookies = rqst.cookies || parseCookies(rqst);
        info.headers = rqst.headers;
        info.hostname = rqst.hostname;
        info.http = rqst.httpVersion;
        info.ip = ip;
        info.method = rqst.method;
        info.original = rqst.originalUrl
        info.port = rqst.port;
        info.protocol = rqst.protocol;
        info.params = rqst.params;
        info.query = rqst.query;
        info.socket = {
          readable: rqst.socket.readable,
          writeable: rqst.socket.writeable,
          secure: rqst.socket.encrypted,
          local: {
            ip: rqst.socket.localAddress,
            port: rqst.socket.localPort
            },
          remote: {
            ip: rqst.socket.remoteAddress,
            port: rqst.socket.remotePort
            }
          };
        info.url = rqst.url;
        info.body = rqst.body||'';
        if (info.headers.usid) scribe.log("USID: %s",info.headers.usid);
        }
      else if (m[1]=='echo') {
        info.url = rqst.originalUrl;
        }
      else if (m[1]=='ip') {
        info.ip = ip;
        }
      else if (m[1]=='msg') {
        var msg = {text: decodeURI(m[2]) + ": " + Math.floor(Math.random()*1000000).toString()};
        var mail = {text: msg.text};
        site.shared.notify.sendText(msg);
        site.shared.notify.sendMail(mail);
        info.msg = msg;
        info.mail = mail;
        }
      rply.json(info);
      }
    else {
      next(); // no match in development mode, proceed to next middleware
      };
    };
  };
