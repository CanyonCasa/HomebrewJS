/// hbSessions.js Copyright (C) 2018 Enchanted Engineering
/*

Example:
  var sessions = require('./hbSessions')(opt.cache);  // user cache

CACHE ENTRIES...
{ <uid1>: {
    uid:    <uid1>,
    name:    <user.username>,
    user:    {<user_data>},
    expires: <expiration_time>
    }
  <uid2>: {
    uid:    <uid2>,
    name:    <user.username>,
    user:    {<user_data>},
    expires: <expiration_time>
    }
  <api.key>: {
    name:   <api.key>,
    api:    {<api_data>}
    }
  }
INDEX ENTRIES... (cross reference of cache by name)
{ <username1>: <uid1>,
  <username2>: <uid2>,
  <api.key>: <api.key>
  }
*/

var Sessions = (()=>{
  var max = 100;                  // max users allowed, 0=unlimited 
  var expiration = 24*60*60*1000; // 24 hours (ms);
  var cache = {};                 // cached user data
  var index = {};                 // cache cross-reference by username 
  var makeUID = () => Math.random().toString(36).substr(2,8);  // generate a unique string
  var full = () => (max && Object.keys(cache).length>=max);    // true if max users
  return {
    set: (options={}) => {                                  // set options
      max = options.maxusers ? options.maxusers : max;
      expiration = options.expiration ? options.expiration : expiration;
    },
    get: () => {return {max: max, expiration: expiration, cache: cache, index:index};},
    add: (user={}) => {                                     // add user to cache
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
    del: (u, v) => {                                        // remove user (u->username or uid) from cache
      if (v) {                                              // if v given, first verify user in cache matches uid 
        if (!((u in cache && cache[u].index==v) || (u in index && index[u]==v) )) return;
        };
      if (u in cache) { // uid given
        delete index[cache[u]['index']];
        delete cache[u];
        return u;
      }
      if (u in index) { // username given
        delete cache[index[u]];
        delete index[u];
        return u;
      }
      return;
    },
    full: full,
    list: (who,idx) => {                                    // returns a user record, or cache/index if no uid specified
      var uid = index[who] || who;       // 'who' could be a username or uid or undefined
      if (uid) return cache[uid]||{};    // return specified user record
      return idx ? index : cache;        // or return index or all cached users
    },
    makeUID: makeUID,
    refresh: () => {                                        // remove expired users from cache, returns size of cache
      for (var k in cache) {
        if (cache[k].expires<(new Date()).valueOf()) Sessions.del(k);
      }
      return Object.keys(cache).length;
    }
  }
})();

module.exports = function init(options) { Sessions.set(options); return Sessions; };
