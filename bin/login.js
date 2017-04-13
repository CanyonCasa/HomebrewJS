// login.js (c)2014 Enchanted Engineering
// User login authentication and authorization module 

// GET /login - checks for active user
// POST /login - authenticate user credentials
// POST /logout - terminate login session

//var passport = require('passport');
//var ppLocalStrategy = require('passport-local').Strategy;

var crypto = require('./cryptoPlus').crypto;
var parse = new (require('./parser'))();
var timeout = 3600; // seconds

exports = module.exports = Login = function Login(options) {
  // this function called by express app to initialize middleware...
  var site = options.site || {};
  if (!(site.scribe && site.users)) {
    throw new Error("login: requires scribe and user userbase references");
    };
  var scribe = site.scribe;   // local reference for context
  var users = site.users;     // local reference for context
  scribe.info("Middleware 'login' initialized...");

  return function authenicate(rqst, rply, next) {
    // Provide callback functions for middleware to authorize against
    var isExpired = function isExpired() {
      rqst.session.login = rqst.session.login || {"valid": false, "msg": "No active user!"};
      if (rqst.session.login.expires) {
        var now = (new Date)/1E3|0;
        if ((now - rqst.session.login.mark)>rqst.session.login.expires) {
          rqst.session.login.valid = false;
          rqst.session.login.msg = "Session Expired!";
          delete rqst.session.user;  // unset defaults
          return true;   // session expired
          };
        };
      return false;
      };

    var isAuth = function isAuth(authCheck) {
      if (!('user' in rqst.session)) return false;      // no user
      if (rqst.login.isExpired()) return false;         // session expired
      if (typeof(authCheck)=='undefined') return true;  // no check, just check for logged in user
      var auth = rqst.session.user.credentials.auth || {};
      for (key in authCheck) {
        var permission = authCheck[key].toString();
        if (!permission) {
          // key without permission, just check for key defined
          if (key in auth) return true;
          }
        else {
          auth[key] = auth[key] || [];
          // key with permission, check for match
          if (auth[key].indexOf(permission)!=-1) return true;
          };
        };
      return false;
      };

    // validate login credentials against valid credentials. 
    var validate = function validate(login,valid) {
      if (login.username!=valid.username) return {"valid": false, "msg":"Invalid username!"};
      if (!valid.pwHash) return {"valid": false, "msg":"No login account or authorization!"};
      var now = (new Date)/1E3|0;
      var epoch = login.password.epoch;
      if (!crypto.timeOK(epoch,now)) return {"valid": false, "msg":"Expired request!"};
      var salt = login.password.salt;
      valid.sha = valid.sha || 'SHA256';
      var validHash = (valid.sha=='SHA1') ? crypto.SHA1(salt+epoch+valid.pwHash) : crypto.SHA256(salt+epoch+valid.pwHash);
      return (login.password.hash==validHash) ? 
        {"valid": true, "msg":"Login Successful!", "mark": now, "expires": valid.expires||0} : 
          {"valid": false, "msg":"Invalid password!"};
      };
      
    rqst.login = {"isAuth":isAuth, "isExpired":isExpired, "validate":validate};

    if (rqst.method=='POST' && rqst.url=='/login') {
      var soap = {"username":"word", "password":{"epoch":"integer", "hash":"hex", "salt":"word", "sha":"word"}};
      var loginCredentials = parse.laundry(rqst.body || {},soap);
      // authenticate user
      users.getUser(loginCredentials.username,
        function(error,user) {
          if (error) {
            scribe.log("Login Error: ",error);
            scribe.log("Login user: ",user);
            };
          user = user || {};
          delete rqst.session.user;  // set defaults
          loginCredentials.msg = "Login failed!";
          loginCredentials.valid = false;
          if (user.username && user.status=='ACTIVE') {
            try {
              rqst.session.login = 
                rqst.login.validate(loginCredentials,user.credentials.local);
              if (rqst.session.login.valid) rqst.session.user = user;
              loginCredentials.msg = rqst.session.login.msg;
              loginCredentials.valid = rqst.session.login.valid;
              }
            catch(err) {
              loginCredentials.msg = loginCredentials.msg + ": " + err;
              };
            };
          rply.end(JSON.stringify(loginCredentials));
          }
        );
      }
    else if (rqst.method=='GET' && rqst.url=='/login') {
      var who = { username: '', valid: false, msg: '' };
      if (rqst.login.isExpired()) { // check expiration.
        who.msg = "Session expired!";
        }
      else if (rqst.session.user) { // check current user
        who.username = rqst.session.user.username;
        who.msg = "Active Session!";
        who.valid = true;
        };
      rply.end(JSON.stringify(who));
      }
    else if (rqst.url=='/logout') {
      delete rqst.session.user;  // unset defaults
      var nobody = {username: '', valid: false, msg: "User logged out!" };
      rply.end(JSON.stringify(nobody));
      }
    else {
      next(); // no match proceed to next middleware
      };
    };

  };

