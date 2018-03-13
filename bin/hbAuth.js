/// hbAuth.js (c) 2018 Enchanted Engineering -- MIT License

/*
All inclusive middleware for authenticating/authorizing users and API functions...
  - Maintains a sessions cache for fast access
  - Implements user database management interface
  - Implements hbIsAuth request callback for downstream middleware
  - Recovers auth credentials from requests
  - Performs user account operations

  NOTE: This represents an unusually long module, but it has a well organized and partitioned structure.
  Performing all authentication/authorization operations in one module simplifies overal implementation.
  
METHOD:       USE
ROUTE:        ['/user/:action/:user/:arg?','']

VARS and METHODS...
  Sessions:         Sessions cache to hold active users and API references
  hsid:             Homebrew sessions ID associated with current session and valid user login,
                    recovered from requests from: hsid header, post data hsid key, or query hsid key 
  Session:          Current active session attached to request homebrew object (i.e. hb)
  isAuth(auth):     Downstream middleware callback function attached to request homebrew object to: 
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
  UsersDB:            Users database management wrapper.
*/


///***********************************************
/// General module and variables declarations...
///***********************************************
require ('./Extensions2JS');
const crypto = require('./CryptoPlus');
const bcrypt = require('bcryptjs');
var WrapSQ3 = require('./WrapSQ3');           // SQLite3 database wrapper
var makeUID = function(form) {
  const forms = {code: {size:6, base:10}, hex: {size:64,base:16}, text: {size:8}};
  return crypto.plus.randStr((form in forms) ? forms[form] : forms['text']);
};
var scribe;


///***********************************************
/// Sessions cache object definition...
///***********************************************
// holds active users and API records
var Sessions = (()=>{
  var max = 0;                    // max users allowed, 0=unlimited 
  var expiration = 24*60*60*1000; // 24 hours (ms);
  var cache = {};                 // cached user data
  var index = {};                 // cache cross-reference by username 
  var full = () => (max && Object.keys(cache).length>=max);    // true if max users
  return {
    set: (options={}) => {                                  // set options
      max = options.maxusers ? options.maxusers : max;
      expiration = options.expiration ? options.expiration : expiration;
    },
    get: () => {return {max: max, expiration: expiration, cache: cache, index:index};},
    add: (user={}) => {                                     // add user to cache
      if (full() || typeof user!='object') return;
      if (user.username) {
        var id = index[user.username] || makeUID(); // replace existing user or define new user
        cache[id] = {
          uid: id,
          index: user.username,
          user: user,
          expires: (new Date()).valueOf()+expiration
          };
        index[user.username] = id;
        return id;
      } else if (user.key) {  // treat as API entry
        cache[user.key] = {
          api: user, 
          index:user.key
        };
        index[user.key] = user.key;
        return user.key;
      };
    },
    del: (u, v) => {                                        // remove user (u->username or uid) from cache
      if (v) {                                              // if v given, first verify user in cache matches uid 
        if (!((u in cache && cache[u].index==v) || (u in index && index[u]==v) )) return;
        };
      if (u in cache) { // uid given
        delete index[cache[u]['index']];
        delete cache[u];
        return u;
      }
      if (u in index) { // username given
        delete cache[index[u]];
        delete index[u];
        return u;
      }
      return;
    },
    exists: (idx)=> (idx && (idx in cache || idx in index)),
    full: full,
    list: (who,idx) => {                                    // returns a user record, or cache/index if no uid specified
      var uid = index[who] || who;       // 'who' could be a username or uid or undefined
      if (uid) return cache[uid]||{};    // return specified user record
      return idx ? index : cache;        // or return index or all cached users
    },
    refresh: () => {                                        // remove expired users from cache, returns size of cache
      for (var k in cache) {
        if (cache[k].expires<(new Date()).valueOf()) Sessions.del(k);
      }
      return Object.keys(cache).length;
    }
  }
})();


///***********************************************
/// User database management wrapper definition...
///***********************************************
// Performs user database actions; NOTE 'who' denotes a complete database entry
// only who.username considered public ask and chg (change) helpers act as get/set
var UsersDB = (()=>{
  var hDB;
  var recipes;
  var getUser = (username,cb) => {hDB.find(recipes.user,{username:username},cb);};
  var obj = (x,y,z)=> y ? ( z ? ((x||{})[y]||{})[z]||{} : (x||{})[y]||{}) : x||{};
  var objs ={hDB: hDB, recipes: recipes};
  return {
    get: (x,y,z) => obj(x=='hDB'?hDB:recipes,y,z),
    init: (db) => {
      hDB = db ? db : hDB;
      hDB.getDefinition({section:'RECIPE',key:'user'},(e,d)=>{
        if (e||d===undefined) throw (e) ? e.toString() : "NO USER RECIPE DEFINITION!"
        recipes=d.value; 
      });
    },
    askAuth: (who,service) => service ? obj(who,'credentials','auth')[service]||'' : obj(who,'credentials','auth'),
    askChallenge: (who) => obj(who,'credentials','challenge'),
    askCredentials: (who) => obj(who,'credentials'),
    askIdentification: (who) => obj(who,'identification'),
    askLocalPW: (who) => obj(who,'credentials')['local']||'',
    askPhone: (who) => obj(who,'identification','phone'),
    askStatus: (who,state) => state ? (obj(who).status===state) : obj(who).status,
    backup: () => {hDB.backup();},
    chgAccount: (who,account) => {who.identification.account = account;},
    chgAuth: (who,auth) => {who.credentials.auth.mergekeys(auth||{});},
    chgChallenge: (who,chlg) => {who.credentials.challenge = chlg;},
    chgCredentials: (who,credentials) => {who.credentials.mergekeys(credentials||{});},
    chgIdentification: (who,identification) => {who.identification.mergekeys(identification||{});},
    chgLocalPW: (who,pw) => {who.credentials.local = pw[0]=='$' ? pw : bcrypt.hashSync(pw,8);},
    chgStatus: (who,status) => {who.status = status;},
    createUser: (who,cb) => {hDB.store(recipes.create,who,cb);},
    getAPI: (key,cb) => {hDB.getDefinition({section:'API',key:key,dflt:{}},(e,d)=>{cb(e,d.value)});}, 
    getUser: getUser,
    groupChange: (users,cb) => {
      
    },
    updateUser: (who,cb) => {hDB.store(recipes.update,who,cb);}
  }
})();


///***********************************************
/// isAuth middleware callback...
///***********************************************
// authenticate user logins, validate API access, and authorize user permissions
// isAuth function used as a callback from Express requests context (i.e. this) 
var isAuth = function isAuth(auth={}){
  var test = {};
  switch (auth.check) { // auth = {check:'...', ...} holds given login/api parameters to test
    case 'login':   // local login authentication for auth.user
      let local = UsersDB.askStatus(auth.user,'ACTIVE') ? UsersDB.askLocalPW(auth.user) : ''; // get valid credentials
      if (local && bcrypt.compare((this.hbSession.auth||{}).hash||'',local)) {
        // success, add user to Sessions cache and session and return hsid result
        this.hbSession.id = Sessions.add(auth.user);
        this.hbSession.user = auth.user;
        scribe.debug("Successful login: %s (%s)", auth.user.username,this.hbSession.id);
        return this.hbSession.id; 
        };
      return '';
    case 'challenge':     // authenticate auth.code against auth.challenge
      return (auth.code===auth.challenge.code && auth.challenge.expires>this.hbSession.now);
    case 'api':     // authenticate API hash
      test = this.hbSession.api;  // session api should hold given api parameters to test
      if (Math.abs(test.epoch-(new Date().style().e)) < 60) { // timestamp valid, check hash
        var validHash = crypto.plus.hash((Sessions[test.key]||{}).secret+test.salt+test.epoch);
        return (test.hash===validHash);
        // note api not removed from cache as it's always treated as an available user
        };
      break;
    default:        // check authorization , i.e auth={service:requested_access}
      /// account for default authorizations i.e. user 1 auth
      var service = Object.keys(auth)[0]; // check involves only a single key!
      // if no service defined, just check if request by an authenticated user
      if (service===undefined) return ('id' in this.hbSession);  // id validated when defined!
      // if service defined as user, check if value matches authenticated user
      if (service==='user') return ((this.hbSession.user||{}).username==auth['user']);
      // get (valid) user permissions for service...
      let permissions = (((this.hbSession.user||{}).credentials||{}).auth||{})[service]||'';
      // service (key) with no requested access (value falsy), default to allow if service in user credentials not deny
      if (!auth[service]) return (permissions!='DENY');
      // requested access specified, check if in delimited list of permissions, e.g. "read,write"
      return (permissions==='*' || permissions.indexOf(auth[service])!=-1);
    };
  };


///***********************************************
/// Middleware...
///***********************************************
module.exports = hbAuth = function hbAuth(options){
  // this function called by express app to initialize middleware...
  var site = this;          // local reference for context
  scribe = site.scribe;
  var opt = options||{};    // module options
  Sessions.set(opt.cache);
  var db;
  if (typeof opt.database=='string' && opt.database in site.db) { // defines reference to existing db connection
    db = site.db[opt.database]; 
    scribe.trace("Middleware 'hbAuth' using site.db connection: %s",opt.database);
    }
  else {
    // assume its a database filename or object defining database to open
    var dbo = (typeof opt.database=='string') ? {file:opt.database} : opt.database;
    if (dbo===undefined) throw "Middleware 'hbAuth': NO database specified";  // no definition is an error
    scribe.trace("Middleware 'hbAuth' connecting to db: %s",dbo.file);
    db = new WrapSQ3(dbo,function (err,msg) { 
      scribe.debug(msg); if (err) throw "ERROR: middleware 'hbAuth': " + err.toString();
      });
    };
  UsersDB.init(db);
  scribe.info("Middleware 'hbAuth' initialized...");

  // this function called by express app for each page request...
  return function hbAuthMiddleware(rqst, rply, next) {
    // attach request objects
    rqst.hbIsAuth = isAuth;  // isAuth function used as a callback from requests (i.e. this) 
    rqst.hbSession = {now: new Date()/1000|0};
    // recover authentication credentials (auth) from any of multiple sources; only if login attempt; default {}
    var auth = rqst.headers.auth||(rqst.body||{}).auth||rqst.query.auth||{};  
    rqst.hbSession.auth = (typeof auth=='string') ? auth.asJx() : auth;  // convert to object, add to session
    // recover hsid, only exists if user previously logged in and sent with this request...
    var hsid = rqst.headers.hsid||(rqst.body||{}).hsid||rqst.query.hsid;
    if (hsid) {
      if (!Sessions.exists(hsid)) return rply.json({err: 'Bad session ID!',hsid:''});
      var who = Sessions.list(hsid);
      if ((who.expires||0)<(new Date().valueOf())) return rply.json({err: 'Expired session!',hsid:''});
      rqst.hbSession.id = hsid;    // update session id, session, and user
      rqst.hbSession.user = who.user;
      };
    // recover api; exists only if API function request; prior login not necessary!
    var api = rqst.headers.api||(rqst.body||{}).api||rqst.query.api;
    if (api) {
      if (typeof api=='string') {
        // assume api field includes multiple auth data parts as '-' delimited fields
        var [key,salt,epoch,hash] = api.split('-');
        api = {raw: api, key:key, salt: salt, epoch: epoch, hash: hash};
        };
      if (!api.key) return rply.json({err:e.toString()||'NO API KEY!'});
      rqst.hbSession.api = api;  // assign api object to session
      // add API definition to cache if not already loaded
      if (!Sessions.exist(api.key)) {
        UsersDB.getAPI(api.key, (e,a)=>{
          if (e||a==undefined) return rply.json({err:e.toString()||'API KEY NOT DEFINED!'});
          Sessions.add(a);
          }); 
        };
      };
    // only executes if POST and /user/:action/:user/:arg? route match!
    if (rqst.method==='POST' && rqst.params.action) {     // user action request
      let [action,user,arg] = [rqst.params.rqrd1,rqst.params.rqrd2,rqst.params.opt1];
      UsersDB.getUser(user,(err,who)=>{
        if (err) next(500);
        switch (action) {
          case 'account': // create a user account or update identification
            let data = (rqst.body.account||{});
            if (arg=='new') { // restrict auth credentials
              if (who.username) return rply.json({err: "USER ALREADY EXISTS!"});
              // define a new user with given username, and info from body
              let newuser = UsersDB.get('recipes','defaults').mergekeys({username: user});
              UsersDB.chgIdentification(newuser,data.identification);
              // only allow user to define password, default random if not provided
              UsersDB.chgLocalPW(newuser,(data.credentials||{}).local||makeUID());
              return UsersDB.createUser(newuser, (e,id)=>{
                if (e) return rply.json({err: e.toString()});
                scribe.debug('New account created for user: %s',user); 
                rply.json({msg: 'ACCOUNT CREATED!'});
                });
              };
            if (arg=='change') { // restrict to identification and local PW changes
              if (!who.username) return rply.json({err: "NO SUCH USER EXISTS!"});
              if (!rqst.hbIsAuth({user:who.username})) return rply.json({err: "NOT AUTHORIZED!"});
              UsersDB.chgIdentification(who,data.identification);
              // only allow user to re-define password, default random if not provided
              UsersDB.chgLocalPW(who,(data.credentials||{}).local||makeUID());
              return UsersDB.updateUser(who, (e,id)=>{
                if (e) return rply.json({err: e.toString()});
                scribe.debug('Account updated for user: %s',who.username); 
                rply.json({msg: 'ACCOUNT UPDATED!'});
                });
              };
            scribe.warn("UNKNOWN ACCOUNT REQUEST!")
            rply.json({err: 'NEW/CHANGE ACCOUNT REQUEST REQUIRED'});
            break;
          case 'activate':  // activate a user
            switch (UsersDB.askStatus(who)) {
              case 'ACTIVE': return rply.json({msg:'ACCOUNT ACTIVATED!*'});
              case 'INACTIVE': return rply.json({msg:'ACCOUNT INACTIVE!'});
              case 'PENDING': // validate challenge
                if (!rqst.hbIsAuth({check:'challenge', code: arg, challenge: UsersDB.askChallenge(who)}))
                  return rply.json({msg: 'ACCOUNT ACTIVATION FAILED/EXPIRED!'}); 
                UsersDB.chgStatus(who,'ACTIVE');
                UsersDB.updateUser(who,(e,id)=>{
                  if (e) return rply.json({err: err.toString()});
                  scribe.debug('Account activated for user: %s',who.username); 
                  return rply.json({msg: 'ACCOUNT ACTIVATED!'});
                  });
                break;
              default:
                return {msg:'NO SUCH USER!'};
              };
            break;
          case 'admin': // update user data for a list of users
            if (!rqst.hbIsAuth({admin:'*'})) next(401);
            if (who.username) {
              UsersDB.chgAuth(who,arg.asJx());
              UsersDB.updateUser(who,(e,id)=>{
                if (e) return rply.json({err: err.toString()});
                rply.json({msg: 'User Authorization updated for '+who.username}); 
                });
              } 
            else {
            UsersDB.backup();
            UusersDB.groupChange(rqst.body.data,(e,msg)=>{rply.json(e ? {err:e.toString()} : {msg:msg})});
              };
            break;
          case 'code': // generate a user challenge; argument determines form
            let chlg = {code: makeUID(arg), expires: rqst.hbSession.now+(opt.expires||10)*60};  // good for 10 minutes default
            UsersDB.chgChallenge(who,chlg);
            UsersDB.updateUser(who,(e,id)=>{
              if (e) return rply.json({err: err.toString()});
              let p = UsersDB.askPhone(who);
              let msg = {text: 'Challenge Code: '+chlg.code, time: true, provider: p.provider, to: p.number};
              site.services.notify.sendText(msg);
              scribe.debug('Challenge set for user[%s]: %s', who.username, chlg.code); 
              rply.json({msg: 'CHALLENGE CODE SENT TO: '+ p.number}); 
              });
            break;
          case 'list': // list user auth credentials or ???
            if (!rqst.hbIsAuth({admin:'*'})) next(401);
            UsersDB.listUsers((e,u)=>{
              if (e) return rply.json({err: e.toString()});
              rply.json({users: u});
              });
            break;
          case 'login': // authenticate a user and return a unique session id
            if (Sessions.full()) return rply.json({err:'Max users exceeded, please try again later...'});
            let hsid = (rqst.hbIsAuth({check:'login', user:who})) ? Sessions.add(who) : '';
            let validIdentification = hsid ? UsersDB.askIdentification(who) : {};
            let optService = hsid ? UsersDB.askAuth(who, arg) : '';
            rply.json({hsid: hsid, user: validIdentification , auth: optService});
            break;
          case 'logout':  // terminate a user's session if session ID (arg) matches username
            // must know user and hsid (arg) to prevent someone from logging out other cached users by username
            if (arg==Sessions.del(arg,user)) {  // successful logout if validates
              scribe.debug("User %s (%s) logged out",user,arg)
              rply.json({hsid:'', user:''});
              }
            else {
              scribe.debug("Bad hsid (%s) for specified user (%s) logout!",arg,user);
              rply.json({err: 'Bad Session ID for specified user!'});
              };
            break;
          case 'reset': // reset a user's login password if challenge (arg) matches
            if (rqst.hbIsAuth({check:'challenge', code: arg, challenge: UsersDB.askChallenge(who)})) {
              UsersDB.chgLocalPW(who,crypto.plus.hash(who.username+arg)); // replace password
              UsersDB.updateUser(who,(e,id)=>{
                if (e) return rply.json({err: err.toString()});
                scribe.debug('Password reset for user[%s]',who.username); 
                rply.json({msg:'PASSWORD RESET'});
                });
              }
            else {
              rply.json({err:'PASSWORD CHALLENGE FAILED!'});
              };
            break;
          default:  // no such user action; return error
            next(404);
          };
        });
      }
    else if (rqst.method==='GET' && rqst.params.action) { // user form request
      let [what,name,extra] = [rqst.params.rqrd1,rqst.params.rqrd2,rqst.params.opt1];;
      switch (what) {
        case 'form':
          return rply.json({form: UsersDB.get('recipes','form',name)});
        default:  // no such user data request; return error
          next(404);
        };
      }
    else {
        return next();
      };
    };
  };
