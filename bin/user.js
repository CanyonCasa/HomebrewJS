/// user.js (c) 2018 Enchanted Engineering -- MIT License
/*
Middleware for handling user credentials and login...

METHOD:       POST
ROUTE:        /user/:action/:user/:arg?

ACTIONS...
* account:        create an account or update (with valid user login)
                    POST /user/account/<username> (user identification data in body)
* activate:       change account status to active with auth code
                    POST /user/activate/<username>/<code>
* authorize:      admin authorization for services, admin access only
                    POST /user/authorize/<admin> (user(s) authorization data in body)
* code:           generate a code stored in user.credentials.challenge
                    POST /user/code/<username>/<mode> (mode='text', default numeric) 
* list:           list user(s) for admin authorization, admin access only
                    POST /user/list/<admin>/<cache|db>
* login:          validate user local login credentials
                    POST /user/login/<username>/<auth_key> (user credentials data in body)
  logout:         terminate user access
                    POST /user/logout/<username>/<hsid>
* reset:          reset a user local login password
                    POST /user/reset/<username>/<challenge>

*/

const crypto = require('./CryptoPlus');
var genChallenge = function(form) {
  const forms = {
    code: {size:6, base:10},
    hex: {size:64,base:16},
    text: {size:8}
  };
  return crypto.plus.randStr((form in forms) ? forms[form] : forms['text']);
};
const msgs = {
  'cache full': { code: 500, msg:'Max users exceeded, please try again later!' },
  'not found': { code: 401, msg:'User not found!' },
  'invalid': { code: 404, msg:'User authentication failed!' }
};

module.exports = User = function User(options){
  // this function called by express app to initialize middleware...
  var site = this;                  // local reference for context
  var scribe = site.scribe;
  var opt = options||{};        // module options
  if (!site.xApp.locals.hbAuth) throw "'User' module requires prior declaration of 'hbAuth' module.";
  var db;                           // local db connection reference 
  if (typeof opt.database=='string' && opt.database in site.db) { 
    db = site.db[opt.database]; // it defines a handle of an existing db connection
    scribe.trace("Middleware 'user' using site.db connection: %s",opt.database);
    }
  else {
    // assume its a filename or definition of database to open
    var dbo = (typeof opt.database=='string') ? {file:opt.database} : opt.database;
    if (dbo===undefined) throw "NO database specified for User Middleware...";  // no definition is an error
    scribe.trace("Middleware 'User' connecting to db: %s",dbo.file);
    db = new WrapSQ3(dbo,function (err,msg) { 
      scribe.debug(msg); if (err) throw err;
      });
    };
  var recipe;               // holds user recipe info
  db.getDefinition({section:'RECIPE',key:'user',dflt:{}},function(err,def){
    recipe = def.value;
    });
  scribe.info("Middleware '%s' initialized with DB: %s", site.handler.tag, db.cfg.file);

  // this function called by express app for each page request...
  return function userMiddleware(rqst, rply, next) {
    let [action, user, arg] = [rqst.params.action, rqst.params.user, rqst.params.arg];
///    rqst.hb.UserCache.refresh();  // first refresh user cache
    if (action==='logout') {  
      // must know hsid (arg) to prevent someone from logging out other cached users by username
      let cachedUser = arg ? ((rqst.hb.UserCache.list(arg)||{}).user||{}).username : '';
      if (user===cachedUser) {   // session user matches request username
        rqst.hb.UserCache.del(id);
        scribe.debug("User %s (%s) logged out",c.user.username,id)
        return rply.json({hsid:'', user:''});
        };
      scribe.debug("Bad hsid (%s) for specified user (%s) logout!",arg,user);
      return rply.json({err: 'Bad hsid for specified user!'});
      } 
    else {
      // all other actions require username lookup
      db.find(recipe.list,{username:user},function(err,who){
      let now = new Date()/1E3|0;
      if (!who.username) return next(msgs['not found']);
        switch (action) {
          case 'account': /// /user/account/<username>/<new|change>
          
          
            // if new create user
            // if update, verify user login and make update
            break;
          case 'activate':
            if (who.status=='ACTIVE') return rply.json({msg:'ACCOUNT ACTIVATED!*'});
            let chUser = (who.credentials||{}).challenge||{};
            let confirmed = rqst.hb.isAuth({check:'challenge', code: arg||'', challenge: chUser}); // validate
            if (confirmed) {
              if (who.status=='PENDING'){
                db.sql({sql:recipe.activate.sql,params:['ACTIVE',who.username]},function (err,id){
                  scribe.debug('Account activated for user[%s]',who.username); 
                  rply.json({msg:(id) ? 'ACCOUNT ACTIVATED!' : err.toString()}); 
                  });
                return;
                } 
              else {
                scribe.debug('Account activation failed for INACTIVE user[%s]',who.username); 
                return rply.json({msg:'ACCOUNT INACTIVE!'});
                }
              } 
            else {
              scribe.debug('Account activation failed for user[%s]',who.username); 
              return rply.json({msg:'ACCOUNT ACTIVATION FAILED/EXPIRED!'});
              };
           break;
          case 'authorize':
            // authenticate admin login
            // backup database
            // update authentications for user(s)
            // reply with confirmation
            break;
          case 'code':
            let chCode = genChallenge(arg);
            let expiration = now + (opt.expires||10)*60;  // good for 10 minutes default
            // update user credentials with challenge, save, and send reply to user
            who.credentials.challenge = {code:chCode, expires:expiration};
            db.sql({sql:recipe.credentials.sql,params:[who.credentials.asJx(2),who.username]},function (err,id){
              scribe.debug('Challenge set for user[(%s)%s]: %s',id,who.username, who.credentials.challenge.asJx()); 
              // send challenge to user
              let p = who.identification.phone;
              let txt = {text: 'Challenge Code: '+chCode, time: true, provider: p.provider, to: p.number};
              //site.services.notify.sendText(txt);
              rply.json({msg: 'CHALLENGE CODE SENT TO: '+ p.number}); 
              });
            break;
          case 'list':
            ///rply.json(((who.credentials||{}).account=='admin') ? rqst.hb.UserCache.list(): {err:'ADMIN only!'});
            break;
          case 'login':
            if (rqst.hb.UserCache.full()) next(msgs['cache full']);
            // authenticate (and add to cache) and return hsid and user info and optional auth service permissions
            let hsid = rqst.hb.isAuth({check:'login', user:who});
            let validID = hsid ? who.identification : {};
            let optAuth = hsid ? ((who.credentials||{}).auth||{})[arg]||'' : '';
            rply.json({hsid: hsid, user: validID , auth: optAuth});
            break;
          case 'reset':
            let chPW = genChallenge(arg);
            let pwOK = rqst.hb.isAuth({check:'challenge', code: chPW, challenge: who.credentials.challenge||{}}); // validate
            if (pwOK) {
              who.credentials.local = crypto.plus.hash(who.username+chPW); // replace password
              db.sql({sql:recipe.credentials.sql,params:[who.credentials.asJx(2),who.username]},function (err,id){
                scribe.debug('Password reset for user[%s]',who.username); 
                rply.json({msg:(id) ? 'PASSWORD['+ id +'] RESET' : err.toString()}); 
                });
              } 
            else {
              rply.json({msg:'PASSWORD RESET FAILED!'}); 
              };
            break;
          default:
            next(404); // no such user action...
          };
        });
      };
    };
  };
