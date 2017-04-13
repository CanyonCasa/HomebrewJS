// login.js (c)2014 Enchanted Engineering
// User login authentication and authorization module 

// GET /login - checks for active user
// POST /login - authenticate user credentials
// POST /logout - terminate login session


//var passport = require('passport');
//var ppLocalStrategy = require('passport-local').Strategy;

var crypto = require('./crypto');

exports = module.exports = Login = function Login(options) {
  // this function called by express app to initialize middleware...
  var site = options.site || {};
  if (!(site.scribe && site.users)) {
    throw new Error("login: requires scribe and user database references");
    };
  var scribe = site.scribe;   // local reference for context
  var users = site.users;     // local reference for context
  scribe.info("Middleware 'login' initialized...");

  var isAuth = function isAuth(key,permission) {
    if (this.session.user) {
      if (typeof(key)=='undefined') {
        // no key, just check for user
        return true;  
        }
      else {
        var auth = this.session.user.credentials.auth || {};
        if (typeof(permission)=='undefined') {
          // key without permission, just check for key defined
          return (key in auth);
          }
        else {
          auth[key] = auth[key] || '';
          // key with permission, check for match
          return auth[key].indexOf(permission)!=-1;
          };
        };
      }
    else {
      return false; // no user!
      };
    };
  
  return function authenicate(rqst, rply, next) {
    // ALWAYS provide callback function for other pages to authorize against
    rqst.isAuth = isAuth;
    if (rqst.method=='POST' && rqst.url=='/login') {
      var posted = rqst.body || {};
      //scribe.log("POSTED: ", posted);
      // authenticate user
      users.getUser(posted.username,
        function(error,data) {
          if (error) {
            scribe.log("Login Error: ",data);
            scribe.log("Login Data: ",data);
            };
          data = data || {};
          rqst.session.user = undefined;  // set defaults
          posted.msg = "Login failed!";
          posted.valid = false;
          if (data.username) {
            try {
              var epoch = (new Date)/1E3|0;
              var timeDiff = Math.abs(posted.password.epoch - epoch);
              var pwHash = crypto.SHA1(posted.password.salt + 
                posted.password.epoch + data.credentials.local.pwhash);
              if (pwHash==posted.password.hash  && timeDiff<60) {
                // valid password generated within the last 60 seconds.
                posted.msg = "Login successful!";
                posted.valid = true;
                rqst.session.user = data;
                };
              }
            catch(err) {
              posted.msg = posted.msg + ": " + err;
              };
            };
          rply.end(JSON.stringify(posted));
          }
        );
      }
    else if (rqst.method=='GET' && rqst.url=='/login') {
      var who = { username: '', valid: false, msg: '' };
      if (rqst.session.user) { // check current user
        who.username = rqst.session.user.username;
        who.msg = "Active Session!";
        who.valid = true;
        };
      rply.end(JSON.stringify(who));
      }
    else if (rqst.method=='POST' && rqst.url=='/logout') {
      rqst.session.user = undefined;  // unset defaults
      var nobody = {username: '', valid: false, msg: "User logged out!" };
      rply.end(JSON.stringify(nobody));
      }
    else {
      next(); // no match proceed to next middleware
      };
    };

  };

