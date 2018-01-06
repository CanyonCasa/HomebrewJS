// login.js (c)2014 Enchanted Engineering
// User login session authentication and authorization module 

// POST /login - authenticate user credentials
// POST /logout - terminate login session

// server sessions data store managed by this code...
const Manager = require('./SessionsManager');

exports = module.exports = Login = function Login(options) {
  // this function called by express app to initialize middleware...
  var site = this;                  // local reference for context
  var scribe = site.scribe;         // local reference for context
  var pattern = /\/(login|logout)/;
  options = options || {};
  options.sessions = options.sessions || {};
  options.sessions.scribe = scribe;
  options.sessions.usersDB = site.db['users'];
  var sm = new Manager(options.sessions);
  scribe.info("Middleware 'login' initialized...");
  
  // this function called by express app for each page request...
  return function loginMiddleware(rqst, rply, next) {
    // recover session or generate a new one
    scribe.trace("login: %s...",rqst.headers.session);
    /// add jsonBody
    rqst.session = sm.defineSession(rqst.headers.session||rqst.body.auth);
    scribe.log("SESSION: ",rqst.session.id);
    console.log(rqst.session);
    var mx = rqst.url.part(pattern,'',1);
    if (mx && rqst.method=='POST') {
      scribe.trace("POST request...",mx);
      if (mx=='login') {
        scribe.trace("body: ", rqst.body.auth);
        rqst.session.login(rqst.body.auth, // rqst.body.auth parsed and sanitized by session.login
          function cb(msg){
            scribe.trace("msg: ", msg);
            if (msg.code!=0) {
              scribe.error(msg.asJx());
            } else {
              scribe.debug(msg.asJx());
            }
            rply.json(msg);  //msg includes session and error info...
          }); 
      } else { // logout
        rply.json(rqst.session.logout());
      };
    } else {
      scribe.trace("%s request...",rqst.method);
      next();
    };
  };
};
