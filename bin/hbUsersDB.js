/// hbUsers.js Copyright (C) 2018 Enchanted Engineering
/*
Manages users database interface


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

///const msgs = {
  'cache full': { code: 500, msg:'Max users exceeded, please try again later!' },
  'not found': { code: 401, msg:'User not found!' },
  'invalid': { code: 404, msg:'User authentication failed!' }
};



var UserDB = (()=>{
///  var full = () => (max && Object.keys(cache).length>=max);    // true if max users
  return {
    set: (options) => {                                     // set options
      hDB = options.hDB;
    },
    get: () => {return {db: hDB};},
    
    activate: (user, code, cb) => {},
    
    create: (user) => {                                     // add user to database
      if (full() || typeof user!='object') return;
      if (user.username) {
        var id = index[user.username] || makeUID(); // replace existing user or define new user
        cache[id] = {
          uid: id,
          index: user.username,
          user: user,
          expires: (new Date()).valueOf()+expiration
          };
        index[user.username] = id;
        return id;
      } else if (user.key) {  // treat as API entry
        cache[user.key] = {
          api: user, 
          index:user.key
        };
        index[user.key] = user.key;
        return user.key;
      };
    },
    challenge: (user, mode, cb) => {},
    del: (user) => {                                        // remove user from database
      if (user in cache) { // uid given
        delete index[cache[user]['index']];
        delete cache[user];
        return user;
      }
      if (user in index) { // username given
        delete cache[index[user]];
        delete index[user];
        return user;
      }
      return;
    },
    full: full,
    list: (who) => {                                        // returns a user record
      var uid = index[who] || who;       // 'who' could be a username or uid or undefined
      if (uid) return cache[uid]||{};    // return specified user record
      return idx ? index : cache;        // or return index or all cached users
    },
    update: (user) {                                        // update a user
      
    }
  }
})();

module.exports = function init(options) { UserDB.set(options); return UserDB; };
