// account.js (c) 2015 Enchanted Engineering -- MIT License
// Midddleware for handling user credentials...

// GET /user?id=<id> or username=<username> or email=<email>
  // lookup a user by id, username, or email
  // content selectively returned based on login
// POST /user
  // save user to database
  // selectively filter based on login
  
var parse = new (require('./parser'))();
var crypto = require('./cryptoPlus').crypto;

exports = module.exports = function Account(options){
  // this function called by express app to initialize middleware...
  var site = options.site || {};
  if (!(site.scribe && site.users && site.mailer)) {
    throw new Error("account: requires scribe, mailer, and database references");
    };
  var scribe = site.scribe;   // local reference for transripting
  var users = site.users;     // local reference for users database
  
  var soap = {
    "id": "integer",
    "hash": "hex",
    "status": "word",
    "username": "username",
    "firstname": "name",
    "lastname": "name",
    "email": "email",
    "phone": "phone",
    "question": "text",
    "hash": "hex",
    "pin": "numeric",
    "answer": "text",
    "pwHash": "hex"
    };
  var userStructure = {
    "id": undefined,
    "status": undefined,
    "username": undefined,
    "identification": {
      "firstname": undefined,
      "lastname": undefined,
      "email": undefined,
      "phone": undefined,
      "question": undefined
      },
    "credentials": {
      "hash": undefined,
      "pin": undefined,
      "answer": undefined,
      "local": {
        "pwHash": undefined,
        "username": undefined
        }
      }
    };

  function sendActivationMail(who) {
    var link = 'http://'+rqst.host+'/account?action=activate&id='+who.id+'&hash='+who.credentials.hash;
    var mail = {
      "subject": "Account Activation Notice",
      "text": "Click the link below to activate your account...\n"+link,
      "to": who.identification.email
      };
    site.mailer.send(mail);
    };

  function sendActivationMail(who) {
    var link = 'http://'+rqst.host+'/account?action=authorize&id='+who.id;
    var mail = {
      "subject": "Account Authorization Notice",
      "text": "Click the link below to authorize account...\n"+link,
      "to": site.cfg.app.contact
      };
    site.mailer.send(mail);
    };

  function sendResetMail(who) {
    var mail = {
      "subject": "Account Reset Notice",
      "text": "Your account password has been changed to: "+user.pw,
      "to": who.identification.email
      };
    site.mailer.send(mail);
    };

  var pattern = /^\/user/;

  scribe.info("Middleware 'account' initialized...");
  
  // this function called by express app for each page request...
  return function accountMiddleware(rqst, rply, next) {
    var m = rqst.url.match(pattern);    // test for url pattern...
    if (m==null) { 
      next(); // no match, proceed to next middleware
      }
    else {
      if (rqst.method=='GET') {
        var action = parse.word(rqst.query.action) || '';
        var x = parse.laundry(rqst.query,soap);
        var who = (x.id) ? {id:x.id} : (x.username) ? {username:x.username} : (x.email) ? {email:x.email} : {};
        who.hash = x.hash;
        scribe.debug("ACCOUNT[who]:",JSON.stringify(who));
        if (who) {
          users.getUser(who,  
            function(err,user) {
              if (err || (user==null)) {
                scribe.warn("ACCOUNT: No user found!");
                rply.end(JSON.stringify({"err":err, "user":user, "msg":"No user found!"}));
                }
              else {
                switch (action) {
                  case 'authorize':
                    // return everything only to admin for authorization
                    if (rqst.login.isAuth({'groups':'admin'})) {
                      scribe.trace("ACCOUNT[%s]: valid admin!", user.id);
                      rply.end(JSON.stringify({"user":user, "msg":""}));
                      }
                    else {
                      rply.end(JSON.stringify({"err":401, "user":{}, "msg":"Not authorized admin!"}));
                      };
                    break;
                  case 'change':
                    // return only user identification only to same logged in user to change
                    if (rqst.login.isAuth({'user':user.credentials.auth.user})) {
                      scribe.trace("ACCOUNT[%s]: valid user!", user.id);
                      delete user.credentials;
                      rply.end(JSON.stringify({"user":user, "msg":""}));
                      }
                    else {
                      // don't return anything
                      rply.end(JSON.stringify({"err":401, "user":{}, "msg":"User not authorized!"}));
                      };
                    break;
                  case 'reset':
                  // return only user question...
                    scribe.trace("ACCOUNT[%s]: reset question!", user.id);
                    rply.end(JSON.stringify({"msg":"",
                    "user":{"id":user.id,"identification":{"question":user.identification.question}}}));
                    break;
                  default:
                    // don't return anything
                    scribe.debug("ACCOUNT[%s]: Unknown GET request!", action);
                    rply.end(JSON.stringify({"err":401, "user":{}, "msg":"Not authorized!"}));
                  };
                };
              }
            );
          }
        else {
          rply.end(JSON.stringify( {"err":404, "msg":"No user specified"} ));
          };
        }
      else if (rqst.method=='POST') {
        var action = parse.word(rqst.body.action) || '';
        console.log(rqst.body);
        if (action=='authorize') {
          // post raw unfiltered user data only if admin.
          if (rqst.login.isAuth({'groups':'admin'})) {
            users.setUser(rqst.body,
              function(err,user) {
                if (err) {
                  scribe.error("ACCOUNT: Adding user failed [%s]",JSON.stringify(err));
                  rply.end(JSON.stringify({"msg":"Authorizing user failed.", "err":err}));
                  }
                else {
                  scribe.debug("ACCOUNT: Added user %s",user);
                  rply.end(JSON.stringify({"msg":"User Authorization updated!", "id":user}));
                  };
                }
              );
            }
          else {
            rply.end(JSON.stringify({"err":401, "user":{}, "msg":"Not authorized admin!"}));
            };
          }
        else {
          // otherwise get user data and post filtered changes...
          var clean = parse.laundry(rqst.body,soap);        // sanitize user data
          clean = parse.hierarchy(clean,userStructure);     // establish user structure
          scribe.debug("ACCOUNT POST[clean]: %s",JSON.stringify(clean));
          // get existing user for comparison
          users.getUser(clean,
            function(err,user) {
              if (err) {
                scribe.error("ACCOUNT: Retrieving user failed [%s]",JSON.stringify(err));
                }
              else {
                switch (action) {
                  case 'register':
                    // sanitize, check existing, defaults, save, emails
                    if (!user) {
                      clean.credentials.hash = crypto.hash(crypto.salt());  // create a random hash
                      clean.status = "PENDING";
                      users.setUser(clean,
                        function(err,newUser) {
                          if (err) {
                            rply.end(JSON.stringify({"err":err, "msg":"Failed to register user!", "user":clean}));
                            }
                          else {
                            rply.end(JSON.stringify({"msg":"Registered user["+newUser+"]!", "user":{"id":newUser}}));
                            //this.sendActivationMail(clean);
                            //this.sendAdminMail(clean);
                            };
                          }
                        )
                      }
                    else {
                      rply.end(JSON.stringify({"err":user.id, "msg":"User already exists!"}));
                      };
                    break;
                  case 'activate':
                    // user may only activate an account that matches id and hash.
                    scribe.log("user:\n",JSON.stringify(user));
                    if (user && clean.credentials.hash==user.credentials.hash) {
                      user.credentials.auth = user.credentials.auth || {};
                      user.credentials.auth.user = user.credentials.auth.user || [user.id.toString()];
                      user.credentials.auth.groups = user.credentials.auth.groups || ['guest'];
                      var activation = { "id":user.id, "status":"ACTIVE", "username":user.username, 
                        "authorization":user.credentials.auth };
                      scribe.log("activation:\n",JSON.stringify(activation));
                      users.setUser({"id":user.id, "status":"ACTIVE", "credentials":user.credentials},
                        function(err,data) {
                          activation.err = err;
                          activation.msg = (err) ? "Activation failed!" : "Activation successful!";
                          rply.end(JSON.stringify(activation));
                          }
                        );
                      }
                    else {
                      rply.end(JSON.stringify({"err":401, "msg":"Activation not authorized!"}));
                      };
                    break;
                  case 'change':
                   // user must be logged in and may only change their account, not including auth or hash
                    if (user && rqst.login.isAuth({'user':user.id})) {
                      var change = {"id":user.id, "username":clean.username, "identification":clean.identification};
                      change.credentials = clean.credentials;
                      change.credentials.auth = user.credentials.auth;    // restore existing authorizations
                      change.credentials.hash = user.credentials.hash;    // restore existing hash
                      users.setUser(change,
                        function(err,chgdUser) {
                          if (err) {
                            rply.end(JSON.stringify({"err":err, "msg":"Change failed!"}));
                            }
                          else {
                            rply.end(JSON.stringify({"msg":"Change successful!"}));
                            };
                          }
                        );
                      }
                    else {
                      rply.end(JSON.stringify({"err":401, "msg":"Change not authorized!"}));
                      };
                    break;
                  case 'reset':
                    // sanitize, change user, send email
                    // user may only reset password for account matching username or email
                    if (user && clean.credentials.answer==user.credentials.answer) {
                      var change = {"id":user.id};
                      change.credentials = user.credentials;
                      var pw = crypto.salt();
                      change.credentials.local.pwHash = crypto.hash(pw);
                      users.setUser(change,
                        function(err,rstUser) {
                          if (err) {
                            rply.end(JSON.stringify({"err":err, "msg":"Reset failed!"}));
                            }
                          else {
                            rply.end(JSON.stringify({"msg":"Reset successful! Password sent by email"}));
                            rstUser.pw = pw;
                            //this.sendResetMail(rstUser);
                            };
                          }
                        );
                      }
                    else {
                      rply.end(JSON.stringify({"err":401, "msg":"Reset not authorized!"}));
                      };
                    break;
                  default:
                    rply.end(JSON.stringify({"err":404, "msg":"Unsupported Action!"}));
                  };
                };
              }
            );
          };        
        }        
      else {
        // unknown request...
        scribe.debug("ACCOUNT[%s]: Unknown Request URL: %s", rqst.method, rqst.url);
        rply.end(JSON.stringify({"err":404, "msg":"Unsupported method!"}));
        };
      };
    };
  };
