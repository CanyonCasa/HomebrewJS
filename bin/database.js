/// database.js - Middleware for serving No-SQL-like data from SQLite databases
/// Copyright (c) 2016 Enchanted Engineering

// load dependencies...
const WrapSQ3 = require('./WrapSQ3');

exports = module.exports = function database(options) {
  // this function called by express app to initialize middleware...
  var site = this;          // local reference for context
  var scribe = site.scribe;
  if (typeof options.db=='object') {  // assume definition of database to open
    db = new WrapSQ3(options.db,function (err) { if (err) throw err; });
    }
  else if (options.db in site.db) { // is it a handle of an existing db connection?
    db = site.db[options.db];
    }
  else if (options.db) {  // assume its a filename
    db = new WrapSQ3({file:options.db},function (err,db) { if (err) throw err; });
    }
  else { // no definiition is an error
    throw "NO database specified for database Middleware..."
    };
  var route = options.route ? options.route.toRegExp() : /^\/db\/([a-z0-9]+)/;
  scribe.info("Middleware 'database' initialized with route:", route);
  scribe.trace("Middleware 'database' db: %s",JSON.stringify(db||{}));


  // this function called by express app for each page request...
  return function databaseMiddleware(rqst, rply, next) {
    var m = rqst.url.match(route);    // test for url pattern...
    if (m==null) return next(); // no match proceeds to next middleware
    db.lookup(m[1],
      function(err,wholeRecipe) {
        if (err) return next(err);
        var recipe = wholeRecipe[rqst.method.toLowerCase()];
        if (recipe) { // process recipe
          scribe.debug("recipe: %s",JSON.stringify(recipe));
          ///if (auth in recipe && !isAuth(recipe.auth)) return next(401);
          if (rqst.method=='GET') {
            db.find(recipe,rqst.query, function(err, data) { if (err) {return next(err);} else {rply.json(data);} });
            } 
          else if (rqst.method=='POST') { 
            db.store(recipe,rqst.body, function(err, meta) { if (err) {return next(err);} else {rply.json(meta);} });
            } 
          else {
            return next({code: 400,msg:"Recipe method '"+rqst.method+"' NOT suported!"}); 
            }
          }
        else { 
          return next({code: 404,msg:"Recipe "+m[1]+" NOT found/supported for method "+rqst.method+"!"}); 
          };
        }
      );
    };
  };
