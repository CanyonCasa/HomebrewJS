/* 
data.js - Middleware for serving No-SQL-like data from SQLite databases, and file upload/download
Copyright (c) 2018 Enchanted Engineering

supports GET, POST, PUT and DELETE to recall, store, udpate, and remove database records respectively:
  * a single table row as an object
  * an array of table rows as an array of objects
supports file upload/download as well

action depends on a recipe definition object to determine the data flow that includes fields:
  "get" or "post", with the following flow controls,
    "sql": DB query
    "flags": Optional query flags
    "filter": A JSON object that follows the structure of rqst.params (GET) or rqst.body (POST) for filtering query params
    "order: An optional array specifying the order of '?' specified params
    "json": An optional array specifying the names of fields that should be converted to JSON (POST) or from json (GET)
    "reduce": An optional flag to reduce the results (GET only) after json recovery and screening
    "screen": A JSON object that follows the structure of result for restricting returned fields
    "auth": Optional authorization requirements, "auth":{"service":"level"}, see isAuth function

file upload/download using the following recipe fields:
  "get": ... (more likely done with static route, but offers authentication)
    "path": Path where to retrieve downloaded file
    "auth": Read authorization
  "post":...
    "path": Path where to store uploaded file
    "auth": Write authorization

assumes parameter based express routing: '/([$]):recipe(\\w+)/:opt1?/:opt2?/:opt3?/:opt4?/:opt5?'
  that defines a / followed by a '$' character, followed by a required recipe key (word only), followed by up to 5 optional params.
  NOTE: different routings can differentiate different middleware databases as long as each defines a recipe parameter

  For example: GET /$snow/1496275200/1527724800
    to retrieve snowfall data (i.e. recipe=snow) between startdate (opt1=1496275200=6/1/2017) and enddate (opt2=1527724800=5/31/2018)
    using recipe definition
    { get:
      { "sql": "SELECT * FROM precipitation WHERE (source='snow' AND time>? AND time<?)",
        "flags": {"simplify": false},
        "filter": {"opt1":["integer",0],"opt2":["integer",0]},
        "order": ["opt1","opt2"],
        }
      }
*/

// load dependencies...
require('./Extensions2JS');
const WrapSQ3 = require('./WrapSQ3');
const Safe = require('./SafeJSON');
const csv = require('./csv');

exports = module.exports = function data(options) {
  // this function called by express app to initialize middleware...
  var site = this;          // local reference for context
  var scribe = site.scribe;
  var db;                   // local database connection reference
  if (typeof options.database=='object') {  // assume definition of database to open
    scribe.trace("Middleware 'data' connecting to: %s",JSON.stringify((options.database||{}).cfg));
    db = new WrapSQ3(options.database,function (err,msg) { scribe.log(msg); if (err) throw err; });
    }
  else if (options.database in site.db) { // is it a handle of an existing db connection?
    scribe.trace("Middleware 'data' using db connection: %s",JSON.stringify(options.database||{}));
    db = site.db[options.database];
    }
  else if (options.database) {  // assume its a filename
    scribe.trace("Middleware 'data' connecting to file: %s",JSON.stringify(options.database||{}));
    db = new WrapSQ3({file:options.database},function (err,msg) { scribe.log(msg); if (err) throw err; });
    }
  else { // no definition is an error
    throw "NO database specified for data Middleware..."
    };
  scribe.info("Middleware 'data' initialized with route:", site.handler.route);
  scribe.trace("Middleware 'data' db: %s",JSON.stringify(db||{}));
      

  // this function called by express app for each page request...
  return function dataMiddleware(rqst, rply, next) {
    // first lookup recipe based on parameter provided
    scribe.trace("DATA[%s]: %s %s",db.tag, rqst.method,rqst.params.recipe);
    db.lookup(rqst.params.recipe,
      function (err,recipeObj) {
        scribe.trace("DATA RECIPE[%s]: ",rqst.params.recipe,(err)?err.toString():'FOUND!');
        if (err) return next(err);
        var recipe = (recipeObj.value||{})[rqst.method.toLowerCase()];
        if (recipe===undefined) return next(); // recipe not found, continue down chain
        scribe.trace("DATA AUTH[%s]: ",rqst.params.recipe,recipe.auth);
        if (!rqst.hbIsAuth(recipe.auth)) return next(401);  // authorization check
        if (rqst.method=='GET') {
          if ('path' in recipe) {
            // file download... filename is opt1 paramater
            let fd = [recipe.path,rqst.params.opt1].join('/');
            scribe.trace("DATA FILE[%s] -> ",rqst.params.recipe,fd);
            rply.sendFile(fd);
            }
          else {
            // database find... query params may be in URL or querystring
            scribe.trace("DATA PARAMS[%s]: ",rqst.params.recipe, rqst.params);
            db.find(recipe,{}.mergekeys(rqst.params).mergekeys(rqst.query),
              function(err,found) {
                if (err) return next(err);
                scribe.trace("DATA DATA[%s]: FOUND!",rqst.params.recipe);
                if ('csv' in recipe) {
                  rply.set('Content-Type', 'text/csv');
                  rply.send(csv.obj2csv(found,recipe.csv)); 
                  rply.end;
                  return;
                  };
                rply.json(found);
              });
            };
          }
        else if (rqst.method=='POST' || rqst.method=='PUT') {
          if ('path' in recipe) {
            // file upload...
            if (Object.keys(rqst.files||{}).length==0) return rply.json({err:'No files were uploaded.'});
            let fp = [];
            for (let f in rqst.files) {
              let fObj = rqst.files[f];
              fObj.location = [recipe.path,fObj.name].join('/');
              scribe.trace("DATA UPLOAD[%s] <- ", rqst.params.recipe, fObj.location);
              fp.push(fObj.mv(fObj.location).then((res,rej)=>{
                }));
              };
            Promise.all(fp).then(res=>{rply.json({msg: 'File uploading complete!'})})
              .catch(e=>{rply.json({err:' Error uploading file...', msg: err.toString()})});
            }
          else {
            // database store... query data in body, may be an object or array of objects
            scribe.trace("DATA BODY[%s]: ",rqst.params.recipe, rqst.body.data);
            db.store(recipe,rqst.body.data,
              function(err,metadata) {
                if (err) return next(err);
                rply.json(metadata); // list of inserted id values
              });
            };
          }
        else {
          // error: method not supported
          return next({code: 404,msg:"DATA method ["+rqst.method+"] NOT supported!"}); 
          };
        } 
      );
    }
  };
