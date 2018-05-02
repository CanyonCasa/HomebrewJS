/// utility.js (c) 2018 Enchanted Engineering
// Midddleware for a variety of utility tasks such as 
//   logging requests, providing server notifications, and echoing requested information...

require('./Extensions2JS');

exports = module.exports = function utility(options) {
  // this function called by an express app to initialize middleware...
  // Expects a site object context
  var site = this;
  var scribe = site.scribe;
  scribe.info("Middleware '%s' initialized", site.handler.tag);
  
  // this function called by express app for each page request...
    return function utilityMiddleware(rqst, rply, next) {
    var ip = {raw: rqst.headers['x-forwarded-for'] || rqst.connection.remoteAddress || "?"};
    ip.v4 = (ip.raw||'').replace(/:.*:/,'');
    ip.v6 = (ip.v4!=ip.raw) ? ip.raw : "0:0:0:0:0:0:0:0";
    ip.port = (rqst.socket.remotePort) ? rqst.socket.remotePort : null;
    if ((options.headers||{}).ip || false) rply.set("ip",JSON.stringify(ip));
    var d = new Date();
    var iot = { epoch: d.style('e'), ofs: d.style('o'), zone: d.style('z') };
    if ((options.headers||{}).iot || false) rply.set("iot",JSON.stringify(iot));
    
    // route parses to 'action' and optional 'msg'
    if (process.env.NODE_ENV==='development' && options.diagnostics) { 
      var info = {action: rqst.params.action, msg: rqst.params.msg};
      switch (rqst.params.action) {
        case 'echo':
          info.mergekeys({url: rqst.originalUrl,msg: rqst.params.msg});
          break;
        case 'iot':
          info.mergekeys(iot);
          break;
        case 'ip':
          info.ip = ip;
          break;
        case 'msg':
          var txt = (rqst.params.msg) ? rqst.params.msg : + "code: " + Math.floor(Math.random()*1000000).toString();
          info.txt = txt;
          if ((site.services|{}).notify && site.services.notify.sendText) sendText({text: msg, time: true});
          if ((site.services|{}).notify && site.services.notify.sendMail) sendMail({text: msg, subject: 'Notify Test'});
          break;
        case 'info':
          info.mergekeys({
            cookies: rqst.cookies,
            headers: rqst.headers,
            hostname: rqst.hostname,
            http: rqst.httpVersion,
            ip: ip.raw,
            iot: iot,
            method: rqst.method,
            original: rqst.originalUrl,
            url: rqst.url,
            port: rqst.port,
            protocol: rqst.protocol,
            params: rqst.params,
            body: rqst.body||{},
            query: rqst.query,
            session: rqst.hbSession,
            cache: (rqst.hbUserCache) ? rqst.hbUserCache.list() : {},
            socket: {
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
              }
            });
          info.mergekeys(site.internals.Stat.get());
          ///if (Object.keys(rqst.hbSession||{}).length) scribe.debug("SESSION: %s",rqst.hbSession.asJx());
          break;
        };
      rply.send(info.asJx(2));
      } 
    else {
      next(); // no match in production mode, proceed to next middleware
      };
    };
  };
