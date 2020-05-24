/*
Copyright (C) 2018 Enchanted Engineering

module to wrap communications to an SQLite database ...

Example...
var WrapSQ3 = require('./WrapSQ3');

var db = new WrapSQ3({file:'test.sq3',log:'STDOUT'});

db.sql(query,callback);

SQ3 WRAPPER CONFIGURATION PARAMETERS...
  file:     database file name (defaults to :memory:, i.e. memory-based)
  log:      log file name (defaults to time stamped derivative of file name)
  mode:     open mode: 1:readonly, 2: read/write, 4:create (default:6)
  verbose:  verbose traceback for debug.

DATABASE METHODS
structure related...
  close(callback);                              // default nop callback
  backup(filename, callback);                   // default timestamp of database name, optional callback
  logger(flag,msgObj);                          // transaction message transcripting
  getSchema(table,callback);                    // returns database table(s) schema to callback
  getTables(callback);                          // returns an array of tablenames to callback
  tableExists(name,callback)                    // make callback with error based on tables existance
  loadExtension(path, callback)                 // load custom database extensions

query releated...
  *setDefinition (definition, callback)
  *                                             // store or replace an INI-like definition
  *getDefinition (definition, callback)
  *                                             // retrieve an INI-like definition, default return sent definition
  *sql(query, callback);                        // query contains sql statement, params, flags; results passed to callback
  *sqlEach(query,rowCB,finalCB);                // iterative query, row results passed to rowCB, finalCB called after last row
  *lookup(item, callback);                      // look up an item in definitions used for storing and finding data
  *find(recipe,data,callback);                  // get content from database based on recipe and (param) data.
  *store(recipe,data,callback);                  // store content in database based on recipe and (body) data.
  
internal helper related
  quote(str);                                   // escape ' for safe SQL strings
  printableQuery(query, parameters);            // substitutes parameters into a parameterized query for transcripting
  *reduce(queryRows, flags);                    // reduces a SELECT query to minimal form


BINDINGS...
Any sqlite3.js bindings can be access from the db object within the instance
Example...
var SQ3Wrapper = require('./WrapSQ3');

var myDB = new SQ3Wrapper({file:'test.sq3'});

myDB.db.each(...);  // directly references the each method in sqlite3.js

var test=myDB.db;   // or create a local reference for convenience
test.each({sql:"SELECT * from tests"},(r)=>{console.log(r);});

*/


// ************************************************************
// CODE DEFINITION BEGINS...
// ************************************************************
require('./Extensions2JS');
const fs = require('fs');
const format = require('util').format;
const path = require('path');
const sqlite3 = require('sqlite3'); // sqlite3 bindings...
const Safe = require('./SafeJSON');
/// const csv = require('./CSV');

// ************************************************************
// HELPER METHODS...
// ************************************************************

// appropriately quotes an SQL query string by removing escapes and doubling single quotes
function quote(str) {
  if (typeof str=='string') {
    str = str.replace('\"','"');
    str = str.replace("\'","'");
    str = str.replace("'","''");
    str = "'"+str+"'";
    };
  return str;
  };

// helper to perform parameter substitution for a fully resolved query
// supports named parameters, i.e. $name
/// need to address proper quoting
function printableQuery(query) {
  if (!query.sql) return query.toString();
  var qstr = query.sql;
  var chngd = 0;
  if (Array.isArray(query.params)) {
    for (var p of query.params){ // iterate array elements
      chngd = (qstr.indexOf('?')!=-1) ? chngd+1 : chngd;
      qstr = qstr.replace('?',quote(p));
      };
    chngd = (qstr.indexOf('?')!=-1) ? -1 : chngd; // check for missing params
    }
  else {
    // named params...
    for (var p of query.params){ // iterate object keys (by jsExtension.js)
      chngd = (qstr.indexOf(p)!=-1) ? chngd+1 : chngd;
      qstr = qstr.replace(p,quote(query.params[p]));
      };
    chngd = (qstr.indexOf('$')!=-1) ? -1 : chngd; // check for missing params
    };
  if (chngd!=Object.keys(query.params).length) { // short or leftover?
    var msg = (chngd==-1) ? "Too few parameters." : "Too many parameters.";
    return "-- ERROR: Failed making printable query! - "+msg+" --> "+qstr;
    };
  return qstr+';';
  };

// helper to reduce query rows to "expected result" (variable type) by following rules:
//   0. Raw results if flags:{simplify:false} specified.
//   1. A one row and one column result returns the value only.
//   2. A single row returns as an object in the form {"col1":value1,"col2":value2,...}.
//      unless flags:{indexed:true} then returns an ordered array same as multi-row response
//   3. A multi-row, single column returns as an ordered (column) list.
//   4. One or more rows of "key,value" named columns returns a single object in the form 
//      {"key1":"value1", "key2":"value2", ...}.
//   5. Multiple rows and columns returns ...
//      a. if "id" or "tag" columns exist, a row by row object indexed by "id" or "tag"
//        (if both "id" and "tag" exist, "tag" takes precedence over "id".)
//   6. An empty query returns {} (or [] for flags:{ordered:true}.)
function reduce(rows,flags) {
  if (!(flags.simplify===undefined||flags.simplify)||rows===undefined) return rows;
  var rslt;
  switch (rows.length) {
    case 0:   // empty result
      rslt = (flags.ordered) ? [] : {};
      break;
    case 1:   // one row object (or list if ordered) or just 
      var keys = Object.keys(rows[0]);
      switch (keys.length) {
        case 0:  // empty
          rslt = (flags.ordered) ? [] : {};
          break;
        case 1: // a single value (i.e. 1 row, 1 column)
          rslt = rows[0][keys[0]];
          break;
        case 2: // key:value pair?
          if ((keys.indexOf('key')!==-1) && (keys.indexOf('value')!==-1)) { // treat as key:value pairs
            rslt = {};
            rslt[rows[0]['key']]=rows[0]['value'];
            break;
            };
        default:  // multi-column
          rslt = (flags.ordered) ? rows : rows[0];
          break;
        };
      break;
    default:  // multi-row result
      var keys = Object.keys(rows[0]);
      switch (keys.length) {
        case 0:
          rslt = (flags.ordered) ? [] : {};
          break;
        case 1:
          rslt = [];
          for(var i=0;i<rows.length;i++) { rslt.push(rows[i][keys[0]]); };
          break;
        case 2:
          if ((keys.indexOf('key')!==-1) && (keys.indexOf('value')!==-1)) { // treat as key:value pairs
            rslt = {};
            for(var i=0;i<rows.length;i++) { rslt[rows[i]['key']]=rows[i]['value']; };
            break;
            };
        default:  // multi-column
          var index = (keys.indexOf('tag')!==-1) ? 'tag' : (keys.indexOf('id')!==-1) ? 'id' : '';
          if (index && flags.indexed) {
            rslt = {};
            for(var i=0;i<rows.length;i++) { rslt[rows[i][index]]=rows[i]; };
            }
          else {
            rslt = rows;
            };
          break;
        };
      break;
    };
  return rslt;
  };


// ************************************************************
// OBJECT DEFINITION...
// ************************************************************
// constructor to encapsulate and initialize the database communications...
// cfg defines database filename (default in memory) and optional mode
module.exports = WrapSQ3 = function WrapSQ3(cfg, callback) {
  // check database filename and define log file and db instance...
  this.cfg = {};
  this.cfg.file = cfg.file || ':memory:';  // default to memory based database.
  this.cfg.log = cfg.log || ((cfg.file==':memory:') ? 'memory.log' : 'WrapSQ3.log');
  this.cfg.mode = cfg.mode || (sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);  // set default database mode
  this.cfg.verbose = cfg.verbose;
  this.tag = cfg.tag || path.basename(cfg.file,path.extname(cfg.file));
  if (cfg.verbose) sqlite3.verbose();  // enable traceback debug support
  var self = this;    // define a local scope reference for callback
  // open the connection ...
  this.db = new sqlite3.Database(this.cfg.file,this.cfg.mode,
    function(err) {
      var msg = (err) ? "-- WRAPSQ3 OPEN ERROR["+self.cfg.file+"]: "+err.toString() :
        "-- WRAPSQ3 OPEN SUCCESS["+self.cfg.file+"]"
      self.logger(msg);
      if (callback) { callback(err,msg) };
      }
    );
  };

// wrapper for database close function, optional callback...
WrapSQ3.prototype.close = function close(callback) {
  this.db.close(callback);
  };

// database transaction transcript logger...
WrapSQ3.prototype.logger = function logger(flag, msgObj) {
  msgObj = msgObj || flag;  // if only one argument, assumes its the message
  var msg = ((typeof msgObj=='string') ? msgObj : (flag in msgObj) ? msgObj[flag] : printableQuery(msgObj))+'\n';
  if (this.cfg.log==='STDOUT') {
    console.log(msg);
    } 
  else {
    var logFile = this.cfg.log;
    fs.appendFile(this.cfg.log,msg, 
      function(err) {
        if (err) { console.log("WrapSQ3 module: Problem writing to "+logFile+"!"); };
        }
      );
    };
  };

// create a backup of the database to given filename,or timestamped derivative by default...
WrapSQ3.prototype.backup = function backup(filename,callback) {
  var stamp = (new Date().getTime()/1000).toFixed(0);
  filename = filename || (this.cfg.file+'.bak'+stamp);
  try {
    fs.createReadStream(this.cfg.file).pipe(fs.createWriteStream(filename));
    this.logger("-- BACKUP of database to "+filename+" successful!");
    if (callback) { callback(null,filename); };
    } 
  catch(e) { 
    this.logger("-- ERROR: BACKUP of database to "+filename+" failed!"); 
    if (callback) { callback(e,filename); };
    };
  return this;
  };

// retrieves database structure schema, or table specific schema.
WrapSQ3.prototype.getSchema = function (table,callback) {
  if (arguments.length==1) { callback=table; table=''; }; // correct for optional table
  if (table) {
    this.db.all("SELECT * from sqlite_master WHERE type='table' and name=?",[table],callback);
    }
  else {
    this.db.all("SELECT * from sqlite_master WHERE type='table'",callback);
    };
  return this;
  };

// convenience function to list database tablenames.
WrapSQ3.prototype.getTables = function getTables(callback) {
  this.db.all("SELECT name from sqlite_master WHERE type='table'",
    function(err,rows) {
      if (err) {
        callback(err,null)
        }
      else {
        var names = [];
        rows.forEach(function(r) { names.push(r.name); });
        callback(null,names);
        };
      }
    );
  return this;
  };

// test existence of table and makes callback(name) or callback(null) based an existance
WrapSQ3.prototype.tableExists = function tableExists(name,callback) {
  this.getTables(function (err,names) { callback((!err&&names.indexOf(name)!=-1) ? name: null) });
  return this;
  };

// define user extensions
WrapSQ3.prototype.loadExtension = function loadExtension(path, callback) {
  this.db.loadExtension(path,callback);
  return this;
  };

// convenience method to directly access database...
// Makes database query and (by default) simplifies results to return "expected result" 
// query argument takes the form shown below (with default flags)...
//   query:{sql:'sql_statement', params:[], flags:{simplify:true, indexed:false, ordered:false}
//   see reduce function for simplification rules.
WrapSQ3.prototype.sql = function sql (query, callback) {
  // resolve arguments
  if (query.sql===undefined) { callback("-- ERROR: query object requires an sql field!",null); };
  query.params = query.params || [];
  var flags = query.flags || {};
  flags.simplify = ('simplify' in flags) ? flags.simplify : true;
  flags.indexed = ('indexed' in flags) ? flags.indexed : false;
  flags.ordered = ('ordered' in flags) ? flags.ordered : false;
  flags.log = (this.cfg.verbose) || ('log' in flags) ? flags.log :  undefined;
  callback = callback || this.nop;
  var action = query.sql.substr(0,query.sql.indexOf(' ')).toUpperCase();
  var self = this;
  if (action=='SELECT') {
    // transcript select queries only if verbose (debug)
    if (flags.log) self.logger(query);
    // select query...
//    if ('$id' in query.params) console.log("NAMED QUERY: \n",query);
    self.db.all(query.sql,query.params,
      function(err,rows) {
        if (err) {
          if (!flags.log) self.logger(query);
          self.logger(err);
          callback(err,null);
          }
        else {
          // SELECT response...
          var rslt = (flags.simplify) ? reduce(rows,flags) : rows; 
          callback(null,rslt);  // select results
          }
        }
      );
    }
  else {  // non-select actions...
    self.logger(query);
    self.db.run(query.sql,query.params,function(err,rqst) {
      if (err) {
        self.logger(err);
        callback(err,null);
        }
      else {
        if (action=='INSERT') {
          callback(null,{id:this.lastID});
          }
        else if (action=='UPDATE') {
          callback(null,{changes:this.changes});
          }
        else if (action=='DELETE') {
          callback(null,{changes:this.changes});
          }
        else {
          // other actions such as CREATE TABLE, etc., take action but ignore response
          callback(null,null);
          };
        };
      });
    };
  return self.db
  };

// API serializer equivalent...
// pass an array of API actions where each array element is an array
// of [API function, params, callback] i.e. assumes last param is callback
WrapSQ3.prototype.sequence = function serialize(actions) {
  var self=this;
  function series(...args){
    // first call prior action callback;
    // won't happen first time since action not yet called
    if (self.cb) self.cb.apply(self,args);  
    // so this block sequences a series of actions...
    var action=actions.shift();       // get next action from original list
    if (action) {                     // loop as long as actions exist
      self.func = action.shift();     // first element is function to call
      self.cb = action.pop();         // last element is its callback
      action.push(series)             // replace callback with this function
      self.func.apply(self,action);   // call func that will call 'series'
      };
    };
  series(); // start things off before returning
  return this;
  };

// convenience method to directly access database iteratively...
// Assumes it performs a SELECT and does not log action.
// unlike WrapSQ3.sql it performs no simplification since it provides an intermediate callback
// argument query:{sql:'sql_statement', params:[]}
WrapSQ3.prototype.sqlEach = function sqlEach (query, rowCB, finalCB) {
  var nop = ()=>{};
  this.db.each(query.sql, query.params||[], rowCB||nop, finalCB||nop);
  if (query.verbose||this.cfg.verbose) this.logger(query);
  return this.db
  };

// convenience method for retrieving an INI-like configuration definition ...
  // retrieves definition for requested section and key if it exists;
  // returns given default (definition) if it doesn't exist;
  // value automatically restored to JSON object
WrapSQ3.prototype.getDefinition = function getDefinition (definition, callback) {
  if (!('section' in definition && 'key' in definition)) {
    definition.error = "-- ERROR[getDefiniton]: requires section and key parameters";
    this.logger(definition.error);
    callback(definition.error,definition);
    return this.db;
    };
  // find out if definition exists
  var query = {sql: "SELECT * FROM definitions WHERE (section=? AND key=?)", params: [definition.section,definition.key]};
  var self = this;
  this.sql(query,
    function(err,def) {
      if (err) { 
        def = def || {};
        def.error = "-- ERROR[getDefiniton]: acquiring definition! "+err.toString();
        def.action = 'ERROR';
        self.logger(def.error);
        callback(err,def);
        }
      else if ('value' in def) {
        // a single definition exists, fix value and return
        def.action = 'FOUND';
        def.jstr = def.value;
        def.value = def.value.asJx();
        if ((typeof def.value=='object') && ('err' in def.value)) { def.error=Object.assign({},def.value); def.value={}; };
        callback(null,def);
        }
      else if (Object.keys(def).length===0) {
        // does not exists, so return default (given definition)
        definition.action = 'DEFAULT';
        definition.value = ('dflt' in definition) ? definition.dflt : undefined;  // force default
        callback(null,definition);
        }      
      else {
        // corrupt database as mulitple definitions can not exist
        def.action = 'ERROR';
        def.error = "-- ERROR[getDefinition]: Multiple definitions found!";
        self.logger(def.error);
        callback(def.error,def);
        };
      }
    );
  return this;
  };

// convenience method for storing an INI-like configuration definition ...
  // creates a new definition if it doesn't exist; 
  // updates existing definition; 
  // removes definition with no value
  // value automatically stored as JSON string
WrapSQ3.prototype.setDefinition = function setDefinition (definition, callback) {
  if (!('section' in definition && 'key' in definition)) {
    definition.error = "-- ERROR[setDefiniton]: requires section and key parameters";
    this.logger(definition.error);
    callback(true,definition);
    return this.db;
    };
  // convert value to JSON string, and define defaults
  definition.jstr = definition.jstr || (definition.value||{}).asJx();
  definition.error = null;
  // find out if definition exists
  var self = this;
  this.getDefinition({section: definition.section,key: definition.key},
    function(err,def) {
      if (err) {
        def = def || {};
        def.error = "-- ERROR[setDefiniton]: Could not acquire definition! "+err.toString();
        def.action = 'ERROR';
        self.logger(def.error);
        callback(def.error,def);
        }
      else {
        var query = {};
        if (def.action=='DEFAULT') {
          // does not exists, so create
          query.sql = "INSERT INTO definitions VALUES(NULL,?,?,?,?)";
          query.params = [definition.section,definition.key,definition.jstr,definition.description||''];
          }      
        else if (!('value' in definition)) {
          // exists, but no value given in default definition, so remove
          definition.id = def.id;
          definition.value = undefined;
          query.sql = "DELETE FROM definitions WHERE id=?";
          query.params = [def.id];
          }
        else {
          // exists, so update
          definition.id = def.id;
          definition.description = definition.description||def.description;
          query.sql = "UPDATE definitions set value=?,description=? WHERE id=?";
          query.params = [definition.jstr,definition.description,definition.id];
          };
        self.sql(query,
          function(err,meta) {
            definition.action = query.sql.substr(0,query.sql.indexOf(' '));
            if (err) {
              definition.error = "-- ERROR[setDefinition]: "+err.toString();
              self.logger(definition.error);
              callback(definition.error,definition);
              }
            else {
              definition.id = definition.id || (meta.id) ? meta.id : 0;
              callback(null,definition);
              };
            }
          );
        }
      }
    );
  return this;
  };

// convenience method to indirectly lookup a definition, from section LOOKUP by default...
WrapSQ3.prototype.lookup = function lookup (item, callback) {
  this.getDefinition((typeof item=='object') ? item : {section:'LOOKUP',key:item,dflt:{}},
    function (err,def){
      if (err) return callback(err,def);
      if ((def.action!=='FOUND') && def.required) return callback({code:404,msg:'LOOKUP NOT FOUND'},def);
      if ('error' in def) return callback(def.error,def);
      callback(null,def);
      }
    );
  return this.db;
  };

// convenience method to perform filtered INSERT actions
WrapSQ3.prototype.find = function find(recipe,data,callback) {
  // prep optional (tainted) params based on recipe...
  recipe.safeParams = (recipe.filter) ? Safe.jsonSafe(data,recipe.filter) : data;
  // order query params if necessary
  recipe.params = (recipe.order) ? recipe.safeParams.orderBy(recipe.order) : recipe.safeParams;
  // recipe now has complete query of sql, params, and flags
  try {
    this.sql(recipe, function(err,result) {
      if (err) return callback(err);
      // restore JSON fields - result could be an object or array of objects
      if (Array.isArray(result)) {
        for (let n=0;n<result.length;n+=1) {
          for (let j of recipe.json||[]) { if (j in result[n]) result[n][j] = result[n][j].asJx(recipe.pretty); };
        };
      }
      else {
        for (let j of recipe.json||[]) { if (j in result) result[j] = result[j].asJx(recipe.pretty); };
      };
      // optional reduce and screening after other processing
      result = recipe.screen ? Safe.jsonSafe(result,recipe.screen) : result;
      result = recipe.reduce ? reduce(result,recipe.reduce) : result;
      callback(null,result);
      });
    }
  catch (e) {
    callback(e,null);
    };
  };

// convenience method to retrieve authorized data
WrapSQ3.prototype.store = function store(recipe,data,callback) {
  if (data===undefined) return callback(null,[]); // no data found means no actions
  var self = this;
  // always treat as a block of INSERT/UPDATE/DELETE actions with data being an array of params
  // querys involving multiple params would therefore need to be an array of objects
  data = (Array.isArray(data)) ? data : [data]; // so wrap objects for singular queries as array
  recipe.meta = []; // return metadata
  self.db.serialize(function() {
    let stmt = self.db.prepare(recipe.sql, function(err) {
      if (err) {
        self.logger(err.message);
        return callback(err,recipe.meta);
        };
      let serr = null;
      for (let d=0;d<data.length;d++) {
        // filter data, translate JSON, and order params 
        let px = (recipe.filter) ? Safe.jsonSafe(data[d],recipe.filter) : data[d];
        for (let j of recipe.json||[]) { if (j in px) px[j] = px[j].asJx(recipe.pretty); };
        px = (recipe.order) ? px.orderBy(recipe.order) : px;
        self.logger(printableQuery({sql:recipe.sql,params:px}));
        stmt.run(px,function(err){
          // lastID valid only for INSERT statements
          if (err) { serr = err; } else { recipe.meta.push([this.lastID,this.changes]); };
          });
        };
      stmt.finalize(function(err) {
        callback(err||serr,recipe.meta);
        });
      });
      
    });
  };
