// Module for transcripting activity...
/*

example: 
  const Scribe = require('./Scribe');
  var scribe = new Scribe({tag:'MAIN', file: 'db.log'});
  scribe.warn("PROBLEM READING DATABASE...");
    // to console:        2001-06-01 12:00:00.000 warn  MAIN     PROBLEM READING DATABASE...
    // to transcript:     2001-06-01 12:00:00.000 warn  MAIN     :: PROBLEM READING DATABASE...\n

// a new Scribe instance can inherit a parent scribe to write to the same transcript file with a different tag
  var appScribe = new Scribe(tag: 'app', parent: scribe);
// a local scribe can simply reference and use the parent
  var mwScribe = appScribe; 

*/

const colors = require('colors');
const fs = require('fs');
const path = require('path');
const frmt = require('util').format;  // returns same result as console.log for arguments

// precedence order of transcript calls; level passes all messages equal to or greater in rank...
// assume 'dump' always only to transcript
///const levels = ["dump","trace","debug","log","info","warn","error","fatal"];
var level = {
  dump:  {txt: "DUMP ", rank: 0, style: ['magenta']},
  trace: {txt: "TRACE", rank: 1, style: ['magenta']},
  debug: {txt: "DEBUG", rank: 2, style: ['cyan']},
  log:   {txt: "LOG  ", rank: 3, style: ['white']},
  info:  {txt: "INFO ", rank: 4, style: ['green']},
  warn:  {txt: "WARN ", rank: 5, style: ['yellow','bold']},
  error: {txt: "ERROR", rank: 6, style: ['red','bold']},
  fatal: {txt: "FATAL", rank: 7, style: ['redBG','bold']},
  };

// color styling function...
function asStyle (lvl='log', txt='') {
  level[lvl].style.forEach(function(s) { txt = colors[s](txt); });
  return txt;
  };

// constructor for Scribe class...
module.exports = Scribe = function Scribe(cfg={}) {
  this.parent = cfg.parent;   // parent Scribe object
  this.tag = (cfg.tag || (cfg.parent||{}).tag || new Date().valueOf().toString(36));
  this.prompt = (this.tag.toUpperCase()+'        ').slice(0,8);
  this.mask = cfg.mask;
  // Log object: file, level, buffer, bsize, and fsize
  // NOTE: Log internally used to avoid collision with scribe.log function
  // buffering (i.e. bsize>0) will reduce file I/O, but may lose data on exit.
  let Log = ({file: "../logs/"+this.tag+'.log', fsize: 1000000, buffer:'', bsize: 10000});
  for (let k in cfg.log||{}) Log[k] = cfg.log[k];
  this.Log = Log;
  this.log("Scribe initialized for %s",this.tag.toUpperCase());  
  };

// function for streaming transcript to a file...
Scribe.prototype.streamToLog =  function streamToLog(line,flush) {
  if (this.parent) {  // parent level transcripting takes precedence
    this.parent.streamToLog(line,flush);
    return;
    };
  if (this.Log.file) { // instance level transcripting if log file defined...
    this.Log.buffer += line+((flush)?'\n':''); // extra linefeed if flushing to paginate log file.
    if ((this.Log.buffer.length>this.Log.bsize) || flush) {
      var tmp = this.Log.buffer;
      this.Log.buffer = '';
      var save = this.Log;
      /// SYNC: because buffer can fill while waiting on file I/O and call this again before complete!
      ///   reasonably fast for a local file and won't happen often for large sizes
      var s = 0; try { j=fs.statSync(save.file).size } catch (e) {};  // ignore error because file may not exist
      if (s>save.fsize) { 
        let p = path.parse(save.file); delete p.base; p.name+='-'+(new Date()/1000|0); save.tmp = path.format(p);
        fs.renameSync(save.file,save.tmp);
        };
      fs.appendFile(save.file, tmp, (err)=>{  // save log when buffer overflows (>bsize)
        if (err) return console.log(asStyle('error',"Scribe error writing to "+save.file+": "+err.toString()));
        });
      };
    };
  // otherwise no transcript saved...
  };

// output function...
Scribe.prototype.write = function write(style,msg) {
  // style and print msg to console...
  let stamp = new Date().toLocaleString();
  // only log or transcript to requested level of detail; mask dynamically assigned to allow reassignment
  let mask = this.mask || (this.parent||{}).mask || 'log';
  if (style=='dump') { 
    this.streamToLog([stamp,mask,this.tag,msg].join('|')+'\n',true);
    }
  else {
    if (level[style].rank>=level[mask].rank) {
      console.log(asStyle(style,[stamp,level[style].txt,this.prompt,msg].join(' ')));
      this.streamToLog([stamp,mask,this.tag,msg].join('|')+'\n',(style==='fatal'));
      };
    };
  };

// message transcripting calls from lowest to highest priority...
Scribe.prototype.raw = function () { console.log(arguments); }; // console pass through only
Scribe.prototype.dump = function () { this.write('dump',frmt.apply(this,arguments)); };
Scribe.prototype.trace = function () { this.write('trace',frmt.apply(this,arguments)); };
Scribe.prototype.debug = function () { this.write('debug',frmt.apply(this,arguments)); };
Scribe.prototype.log = function () { this.write('log',frmt.apply(this,arguments)); };
Scribe.prototype.info = function () { this.write('info',frmt.apply(this,arguments)); };
Scribe.prototype.warn = function () { this.write('warn',frmt.apply(this,arguments)); };
Scribe.prototype.error = function () { this.write('error',frmt.apply(this,arguments)); };
Scribe.prototype.fatal = function () { this.write('fatal',frmt.apply(this,arguments)); process.exit(100);};

Scribe.prototype.styleAs = function (lvl=log,style='restore') {
  level[lvl].restore = (level[lvl].restore!==undefined) ? level[lvl].restore : level[lvl].style;
  level[lvl].style = (style=='restore') ? level[lvl].restore : style;
  };

Scribe.prototype.setMasterMask = function setMask(mask) {
  var s = this;
  while (s.parent!=undefined) s = s.parent;
  s.savedMask = (s.savedMask!==undefined) ? s.savedMask : s.mask;
  s.mask = (mask in level) ? mask : s.savedMask;
  return s.mask;
  };