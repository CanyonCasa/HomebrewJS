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
    }
  };
})();

// homebrew localhost server for receiving commands/queries...
var express = require('express');
var app = express();

app.get('/:cmd/:key?/:value?',(req,res,next)=>{
  let [cmd,key,value] = [req.params.cmd,req.params.key,req.params.value];
  let msg = {err: false, cmd: cmd, key:key, value: value, msg:""};
  switch (cmd) {
    case 'CMD':
      scribe.warn("Received command[%s]: %s",key,value);
      events.emit(key||'',value);
      msg:"Sent Event: " + key+ " " + value;
      break;
    case 'STAT':
      scribe.info("Received stats request[%s]: %s",key,value);
      msg.stat = Stat.get(key,value)||{};
      break;
    case 'SCRIBE':
      if (key=='mask') msg.scribe = scribe.setMasterMask(value);
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
