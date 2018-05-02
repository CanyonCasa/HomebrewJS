// basic internal server for commanding/querying homebrew server(s)
// DO NOT proxy site to Internet; restrict access to local net

var Scribe = require('./Scribe');
var scribe;

// homebrew (command) event handler...
const EventEmitter = require('events');
const events = new EventEmitter();

// internal stats data collection...
var Stat = (()=>{
  var stats = {};
  return {
    set: (tag,key,value) => {
      if (key===undefined) stats[tag] = value;
      stats[tag] = (tag in stats) ? stats[tag] : {};
      stats[tag][key] = value;
    },
    get: (tag,key) => {
      if (tag===undefined) return stats;
      if (tag in stats) {
        if (key===undefined) return stats[tag];
        if (key in stats[tag]) return stats[tag][key];
      };
      return undefined;
    },  
    inc: (tag,key) => {
      Stat.set(tag,key,(Stat.get(tag,key)) ? Stat.get(tag,key)+1 : 1);
      return Stat.get(tag,key);
    },
    tags: () => Object.keys(stats),
    keys: (tag) => Object.keys(stats[tag])
  };
})();

// homebrew localhost server for receiving commands/queries...
var express = require('express');
var app = express();
var route = '/:action/:param?/:opt?';

app.get(route,(req,res,next)=>{
  let [action,param,opt] = [req.params.action,req.params.param,req.params.opt];
  let msg = {err: false, route: route, action: action, param:param, opt: opt, msg:""};
  switch (action) {
    case 'CMD':
      scribe.warn("Received command[%s]: %s",param,opt);
      events.emit(param||'',opt);
      msg.msg = "Sent Event: '" + param + "' with argument: '" + opt + "'";
      break;
    case 'STAT':
      scribe.info("Received stats request[%s]: %s",param,opt);
      msg.stat = Stat.get(param,opt)||{};
      break;
    case 'SCRIBE':
      if (param=='mask') msg.scribe = scribe.setMasterMask(opt);
      msg.msg = opt ? "Scribe mask set to: "+opt : "Scribe mask restored!";
      break;
    case 'HELP':
      msg.actions = ['/HELP','/CMD/<event>/<arg>','/STAT/<tag>/<key>','/SCRIBE/mask/<mask_level>'];
      msg.events = Object.keys(events._events);
      break;
    default:
      msg.err = true; msg.msg = "BAD COMMAND!";
  };
  res.json(msg);
});

module.exports = init = function init(options) {
  scribe = new Scribe({tag:options.cfg.tag, parent:options.scribe});
  app.listen(options.cfg.port);
  scribe.info("hbInternals initialized server on localhost:%s",options.cfg.port);
  return {Events:events, App:app, Stat:Stat};
  };
