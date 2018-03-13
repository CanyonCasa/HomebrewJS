/* 
database.js - Middleware for serving No-SQL-like data from SQLite databases
Copyright (c) 2018 Enchanted Engineering

supports 4 operations using GET or POST to recall or store:
  * a single table row as an object
  * an array of table rows as an array of objects

depends on a recipe definition object to determine the data flow that includes fields:
  "get" or "post", with the following flow controls,
    "sql": DB query
    "flags": Optional query flags
    "filter": A JSON object that follows the structure of rqst.params (GET) or rqst.body (POST) for filtering query params
    "order: An optional array specifying the order of '?' specified params
    "json": An optional array specifying the names of fields that should be converted to JSON (POST) or from json (GET)
    "reduce": An optional flag to reduce the results (GET only)
    "block": An optional flag to treat data as an array of arrays or block store (POST only)
    "auth": Optional authorization requirements, see isAuth function
      "user":
      "key":
      "action":

assumes parameter based express routing: '/([$]):recipe(\\w+)/:opt1?/:opt2?/:opt3?/:opt4?/:opt5?'
  that defines a / followed by a '$' character, followed by a required recipe key (word only), followed by up to 5 optional params.
  NOTE: different routings can differentiate different middleware databases as long as each defines a recipe parameter

  For example: GET /$snow/1496275200/1527724800
    to retrieve snowfall data (i.e. recipe=snow) between startdate (opt1=1496275200=6/1/2017) and enddate (opt2=1527724800=5/31/2018)
    using recipe definition
    { get:
      { "sql": "SELECT * FROM precipitation WHERE (source='snow' AND time>? AND time<?)",
        "flags": {"simplify": false},
        "filter": {"opt1":["integer",,0],"opt2":["integer",,0]},
        "order": ["opt1","opt2"],
        }
      }
*/

// load dependencies...
require('./Extensions2JS');
const WrapSQ3 = require('./WrapSQ3');
const Safe = require('./SafeJSON');

exports = module.exports = function database(options) {
  // this function called by express app to initialize middleware...
  var site = this;          // local reference for context
  var scribe = site.scribe;
  var db;                   // local database connection reference
  if (typeof options.database=='object') {  // assume definition of database to open
    scribe.trace("Middleware 'database' connecting to: %s",JSON.stringify((options.database||{}).cfg));
    db = new WrapSQ3(options.database,function (err,msg) { scribe.log(msg); if (err) throw err; });
    }
  else if (options.database in site.db) { // is it a handle of an existing db connection?
    scribe.trace("Middleware 'database' using db connection: %s",JSON.stringify(options.database||{}));
    db = site.db[options.database];
    }
  else if (options.database) {  // assume its a filename
    scribe.trace("Middleware 'database' connecting to file: %s",JSON.stringify(options.database||{}));
    db = new WrapSQ3({file:options.database},function (err,msg) { scribe.log(msg); if (err) throw err; });
    }
  else { // no definition is an error
    throw "NO database specified for database Middleware..."
    };
  scribe.info("Middleware 'database' initialized with route:", site.handler.route);
  scribe.trace("Middleware 'database' db: %s",JSON.stringify(db||{}));
      

  // this function called by express app for each page request...
  return function databaseMiddleware(rqst, rply, next) {
    // first lookup recipe based on parameter provided
    scribe.trace("DATABASE[%s]: %s",rqst.method,rqst.params.recipe);
    db.lookup(rqst.params.recipe,
      function (err,recipeObj) {
        if (err) return next(err);
        var recipe = (recipeObj.value||{})[rqst.method.toLowerCase()];
        if (recipe===undefined) return next(); // recipe not found, continue down chain
        if (!rqst.hbIsAuth(recipe.auth)) return next(401);  // authorization check
        if (rqst.method=='GET') {
          // find the data, query params may be in URL or querystring
          db.find(recipe,{}.mergekeys(rqst.params).mergekeys(rqst.query),
            function(err,found) {
              if (err) return next(err);
              rply.json(found);
            });
          }
        else if (rqst.method=='POST') {
          // store the data, query data in body, may be an object or array of objects
          db.store(recipe,rqst.body.data,
            function(err,metadata) {
              if (err) return next(err);
              rply.json(metadata); // list of inserted id values
            });
          }
        else {
          // error: method not supported
          return next({code: 404,msg:"DATABASE method ["+rqst.method+"] NOT supported!"}); 
          };
        } 
      );
    }
  };
