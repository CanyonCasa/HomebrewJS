/// hbAuth.js (c) 2018 Enchanted Engineering -- MIT License
/*
Midddleware for supporting user.js authentication and handling user authorizations ...
  - Maintains a sessions cache for fast access
  - Recovers any session ID provided for request
  - Implements user database management interface
  - Implements hb.isAuth callbacks for downstream middleware
  - Only replies for bad or expired session ID, otherwise passes to next().

METHOD:       USE
ROUTE:        undefined

VARS and METHODS...
  hb.Sessions:      Sesssions cache object for downstream middleware actions
  hb.hsid:          Homebrew sessions cache ID associated with current session and valid user login,
                    recovered from requests from: hsid header, post data hsid key, or query hsid key 
  
  hb.isAuth(auth):  downstream middlewave callback function (attached to request object) to: 
                    * authenticate user login: 
                      hb.hsid referened auth:{username: ..., hash: ...} vs user:{username: ..., user.credentials.local: ...}
                    * check a confirmation code challenge
                      sent code vs user's user.credentials.challenge.code, as well as user.credentials.challenge.expires check
                    * validate api key:
                    * check authorization for a service, such as DB access 
                      {}:                         no service specified, check if user in cache
                      {service:''}:               allow unless user specifically DENY
                      {service:requested_access}: true if requested_access in user auth[service] key

                      NOTE: action called from middleware endpoints using request callback 

*/

const crypto = require('./CryptoPlus');
const bcrypt = require('bcryptjs');
/// this should go away...
const msgs = {
  'no user': { code: 401, msg:'User required' },
  'cache full': { code: 500, msg:'Max users exceeded, please try again later' }
  };


module.exports = hbAuth = function hbAuth(options){
  // this function called by express app to initialize middleware...
  var site = this;          // local reference for context
  var scribe = site.scribe;
  var opt = options||{};    // module options
///  var cache = new (require('./UsersCache'))(opt.cache);  // user cache
  var cache = require('./hb.Sessions')(opt.cache);  // user cache
  var db;                   //database connection
  if (typeof opt.database=='string' && opt.database in site.db) { 
    db = site.db[opt.database]; // it defines a handle of an existing db connection
    scribe.trace("Middleware 'hbAuth' using site.db connection: %s",opt.database);
    }
  else {
    // assume its a filename or definition of database to open
    var dbo = (typeof opt.database=='string') ? {file:opt.database} : opt.database;
    if (dbo===undefined) throw "Middleware 'User': NO database specified";  // no definition is an error
    scribe.trace("Middleware 'User' connecting to db: %s",dbo.file);
    db = new WrapSQ3(dbo,function (err,msg) { 
      scribe.debug(msg); if (err) throw "ERROR: middleware 'User': " + err.toString();
      });
    };
  
  // isAuth function used as a callback from a rqst (i.e. this) to: 
  // authenticate user logins, validate API access, and authorize user permissions
  
  var isAuth = function isAuth(auth={}){ // called from Express request object context
    var test = {};
    switch (auth.check) { // auth = {check:'...', ...}
      case 'login':   // local login authentication against auth.user
        test = this.hb.Session.auth||{};  // session auth should hold given login/api parameters to test
        let local = ((auth.user||{}).credentials||{}).local||'';
        if (bcrypt.compare(test.hash||'',local)) {
          // success, add user to cache and session and return hsid result
          this.hb.Session.id = this.hbUserCache.add(auth.user);
          scribe.debug("Successful login: %s (%s)", auth.user.username,this.hb.Session.id);
          return this.hb.Session.id; 
          };
        if (this.hb.Session.id){ // failed, delete user if already logged in
          this.hbUserCache.del(this.hb.Session.id);  
          delete this.hb.Session.id;
          };
        return '';
      case 'challenge':     // authenticate auth.code against auth.challenge
        let now = new Date()/1000|0;
        return (auth.code===auth.challenge.code && auth.challenge.expires>now);
      case 'api':     // authenticate API hash
        test = this.hb.Session.api;  // session api should hold given api parameters to test
        if (Math.abs(test.epoch-(new Date().style().e)) < deltaT) { // timestamp valid, check hash
          var validHash = crypto.plus.hash(cache[test.key].secret+test.salt+test.epoch);
          return (test.hash===validHash);
          // note api not removed from cache as it's always treated as an available user
          };
        break;
      default:        // check authorization , i.e auth={service:requested_access}
        /// account for default authorizations i.e. user 1 auth
        var service = Object.keys(auth)[0]; // check involves only a single key!
        // if no service, just check if request by an authenticated user
        if (service===undefined) return ('id' in this.hb.Session);  // id validated when defined!
        // get (valid) user permissions for service...
        let user = (this.hb.Session.id) ? (this.hbUserCache.list[this.hb.Session.id]||{}).user : {};
        let permissions = ((user.credentials||{}).auth) ? user.credentials.auth[service] : undefined;
        // service (key) without requested access (value), default to allow if service in user credentials and not deny
        if (auth[service]==='undefined') return (permissions!='DENY');
        // requested access specified, check if in delimited list of permissions, e.g. "read,write"
        return (permissions==='*' || permissions.indexOf(auth[service])!=-1);
      };
    };

  var mngUser = function mngUser(action,user={}){ // called from Express request object context
    };

  site.xApp.locals.hbAuth = true; // flag for user.js
  scribe.info("Middleware '%s' initialized", site.handler.tag);

  // this function called by express app for each page request...
  return function hbAuthMiddleware(rqst, rply, next) {
    // attach request objects
    rqst.hb.UserCache = cache; /// remove once users.js fixed!
    rqst.hb.isAuth = isAuth;
    rqst.hb.mngUser = mngUser;
    rqst.hb.Session = {close: session.del}; // function to remove user from cache -> close(hsid,username)
    var auth = rqst.headers.auth||(rqst.body||{}).auth||rqst.query.auth||{};  // recover auth default {}
    rqst.hb.Session.auth = (typeof auth=='string') ? auth.asJx() : auth;      // convert to object
    // recover hsid, only exists if user previously logged in...
    var hsid = rqst.headers.hsid||(rqst.body||{}).hsid||rqst.query.hsid;
    if (hsid) {
      var who = cache.list(hsid);
      if (!who.uid) return rply.json({err: 'Bad session ID!',hsid:''});
      if ((who.expires||0)< (new Date().valueOf())) return rply.json({err: 'Expired session!',hsid:''});
      rqst.hb.Session.id = hsid;  // update session
      rqst.hb.Session.who = who.user.username||'';
      return next();
      };
    // exists if call made by api without prior login!
    var api = rqst.headers.api||(rqst.body||{}).api||rqst.query.api;
    if (!api) return next(); // no api auth data
    if (typeof api=='string') {
      // assume api field includes multiple auth data parts as '-' delimited fields
      var [key,salt,epoch,hash] = api.split('-');
      api = {key:key, salt: salt, epoch: epoch, hash: hash};
      };
    rqst.hb.Session.api = api;  // update session
    if (!cache.list(api.key)) {
      // need to do a db query and add api definition to cache
      db.getDefinition({section:'API',key:api.key,dflt:{}},function(err,def){
        cache.add(def.value);
        return next();
        });
      }
      else {
        return next();
      };
    };
  };
