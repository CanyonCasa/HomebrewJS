// account.js (c) 2014 Enchanted Engineering
// Midddleware for querying database for user credentials...

exports = module.exports = function Account(options){
  // this function called by express app to initialize middleware...
  var site = options.site || {};
  if (!(site.scribe && site.db)) {
    throw new Error("account: requires scribe and database references");
    };
  var scribe = site.scribe;   // local reference for context
  var db = site.db;           // local reference for context

  // lookup queries...
  var user = {}; 
  var query; 
  var params=[];
  var qUser = "SELECT id,username,identification FROM users WHERE username=?";
  var qID = "SELECT id,username,identification FROM users WHERE id=?";
  var qAdmin = "SELECT * FROM users WHERE username=?";
  var qIDAdmin = "SELECT * FROM users WHERE id=?";

  // GET /user [/<id> or <username>]
  //POST /user
  var pattern = /^\/user(?:\/(\w+))?/;

  scribe.info("Middleware 'ACCOUNT' initialized...");
  
  // this function called by express app for each page request...
  return function accountMiddleware(rqst, rply, next) {
    var m = rqst.url.match(pattern);    // test for url pattern...
    if (m==null) { 
      next(); // no match, proceed to next middleware
      }
    else {
      if (rqst.method=='GET') {
        if (m[1]) {
          var user = (m[1]>0) ? {id: parseInt(m[1])} : {username: m[1]};
          db.getUser(user,
            function(err,user) {
              if (err) scribe.error(err);
              scribe.debug("ACCOUNT User: %s", user);
              if (!rqst.isAuth('groups','admin')) {
                scribe.debug("ACCOUNT User: not authorized as admin!");
                if (user) delete user.credentials;
                };
              rply.end(JSON.stringify(user));
              }
            )
          }
        else {
          rply.end(JSON.stringify( {msg:"No user specified"} ));
          };
        }
      else if (rqst.method=='POST') {
        if (rqst.isAuth('groups','admin')) {
          };
        user.msg = "ACCOUNT: POST not supported!";
        rply.end(JSON.stringify(user));
        }        
      else {
        // unknown request...
        scribe.debug("ACCOUNT: [%s] URL: %s", rqst.method, rqst.url);
        next();
        };
      };
    };
  };
