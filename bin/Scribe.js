// Module for transcripting homebrew web server activity...

// example: var scribe = new (require('./scribe'))({tag:'MAIN'});
//   scribe.warn("PROBLEM READING DATABASE...");
//   // logs to console:        2001-06-01 12:00:00.000 warn  MAIN     PROBLEM READING DATABASE...
//   // logs to transcript:     2001-06-01 12:00:00.000 warn  MAIN     :: PROBLEM READING DATABASE...\n
//   // raw (to console only):  PROBLEM READING DATABASE...

const colors = require('colors');
const fs = require('fs');
const frmt = require('util').format;  // returns same result as console.log for arguments
require('./Extensions2JS');

// precedence order of transcript calls...
const levels = ["all","dump","trace","debug","log","info","warn","error","fatal"];

// color styling function...
function asStyle (style, txt) {
  const styles = {
    "fatal": ['redBG','bold'],
    "error": ['red','bold'],
    "warn": ['yellow','bold'],
    "info": ['green'],
    "log": ['white'],
    "debug": ['cyan'],
    "trace": ['magenta'],
    "dump": ['magenta']
    };
  styles[style].forEach(function(s) { txt = colors[s](txt); });
  return txt;
  };

// constructor for Scribe class...
module.exports = Scribe = function Scribe(cfg) {
  var defaults = (global.scribe) ? global.scribe : {tag:(+new Date()).toString(36),transcript:{}};  
  this.tag = cfg.tag || defaults.tag;
  this.level = cfg.level || defaults.level || 'info';
  cfg.log = cfg.log || defaults.transcript;
  cfg.log.file = cfg.log.file || defaults.transcript.file || '';
  cfg.log.level = cfg.log.level || defaults.transcript.level || 'log';  // transcript level can be different than console
  cfg.log.buffer = cfg.log.buffer || '';          // can be preloaded with a message.
  // buffering (size>0) will reduce file I/O, but may lose data on exit.
  cfg.log.bufferSize = cfg.log.buffferSize || defaults.transcript.buffersize || 0;
  this.transcript = cfg.log;  // had to use transcript to avoid collision with this.log()
  };

// function for streaming transcript to a file...
Scribe.prototype.streamToLog =  function streamToLog(line,flush) {
  if (this.transcript.file) {
    // instance level logging...
    this.transcript.buffer += line+((flush)?'\n':''); // extra linefeed if flushing to paginate log file.
    if ((this.transcript.buffer.length>this.transcript.bufferSize) || flush) {
      var tmp = this.transcript.buffer;
      this.transcript.buffer = '';
      fs.appendFile(this.transcript.file,tmp, 
        function(err) {
          if (err) { console.log(asStyle('error',"Scribe Module: "),err); };
          }
        );
      };
    }
  else {
    // global level logging (or no logging if global log not defined) ...
    if (global.scribe) {
      if (global.scribe.tag!==this.tag) global.scribe.streamToLog(line,flush);
      };
    };
  };

// output function...
Scribe.prototype.write = function write(style,msg) {
  // style and print msg to console...
  var stamp = new Date().style("stamp");
  var tag = (this.tag.toUpperCase()+'        ').slice(0,8);
  var level = (style+'     ').slice(0,5);
  // only log or transcript to requested level of detail
  if (levels.indexOf(style)>=levels.indexOf(this.level)) {
    console.log(asStyle(style,[stamp,level,tag,msg].join(' ')));
    };
  if (levels.indexOf(style)>=levels.indexOf(this.transcript.level)) {
    this.streamToLog([stamp,level,tag,'::',msg].join(' ')+'\n',(style==='fatal'));  
    };
  };

Scribe.prototype.raw = function () { console.log(arguments); }; // console pass through
// message transcripting calls from lowest to highest priority...
Scribe.prototype.dump = function () { this.write('dump',frmt.apply(this,arguments)); };
Scribe.prototype.trace = function () { this.write('trace',frmt.apply(this,arguments)); };
Scribe.prototype.debug = function () { this.write('debug',frmt.apply(this,arguments)); };
Scribe.prototype.log = function () { this.write('log',frmt.apply(this,arguments)); };
Scribe.prototype.info = function () { this.write('info',frmt.apply(this,arguments)); };
Scribe.prototype.warn = function () { this.write('warn',frmt.apply(this,arguments)); };
Scribe.prototype.error = function () { this.write('error',frmt.apply(this,arguments)); };
Scribe.prototype.fatal = function () { this.write('fatal',frmt.apply(this,arguments)); };
