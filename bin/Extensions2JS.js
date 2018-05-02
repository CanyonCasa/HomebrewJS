/*
 Personal JavaScript language extensions...
 (c) 2018 Enchanted Engineering, MIT license
*/


///************************************************************
/// Array Object Extensions...
///************************************************************
// Boolean indicating if Array contains element 
if (!Array.has) Object.defineProperty(Array,'has', {
  value: function (element){ return this.indexOf(element)!==-1; },
  enumerable: false
})


///************************************************************
/// Date Object Extensions...
///************************************************************
// number of days per month...
const daysByMonth = [31,28,31,30,31,30,31,31,30,31,30,31];
// milliseconds per interval...
const msPer = {
  'Y': 31556952000,   // 1000*60*60*24*365.2425
  'M': 2629746000,    // 1000*60*60*24*365.2425/12
  'W': 604800000,     // 1000*60*60*24*7
  'D': 86400000,      // 1000*60*60*24
  'h': 3600000,       // 1000*60*60
  'm': 60000,         // 1000*60
  's': 1000           // 1000 ms per second
  };

// Calculate the ISO week of the year...
if (!Date.prototype.getWeek) Date.prototype.getWeek = function () {
  var firstThu = new Date(this.getFullYear(),0,[5,4,3,2,1,7,6][new Date(this.getFullYear(),0,1).getDay()]);
  var nearestThu = new Date(this.getFullYear(),this.getMonth(),this.getDate()-((this.getDay()+6)% 7)+3);
  return (nearestThu.getFullYear()>firstThu.getFullYear()) ? 1 : 
    1 + Math.ceil((nearestThu.valueOf()-firstThu.valueOf())/msPer['W']);
}
if (!Date.prototype.getUTCWeek) Date.prototype.getUTCWeek = function () {
  var firstThu = new Date(this.getUTCFullYear(),0,[5,4,3,2,1,7,6][new Date(this.getUTCFullYear(),0,1).getUTCDay()]);
  var nearestThu = new Date(this.getUTCFullYear(),this.getUTCMonth(),this.getUTCDate()-((this.getUTCDay()+6)% 7)+3);
  return (nearestThu.getUTCFullYear()>firstThu.getUTCFullYear()) ? 1 : 
    1 + Math.ceil((nearestThu.valueOf()-firstThu.valueOf())/msPer['W']);
}

// Test if date or given year is a leapyear...
if (!Date.prototype.isLeapYear) Date.prototype.isLeapYear = function (year) {
  year = year || this.getFullYear();
  return year%4==0&&(year%100==year%400);
}

// Calculate the day of the year...
if (!Date.prototype.getDayOfYear) Date.prototype.getDayOfYear = function () {
  var leapDay = (this.getMonth()>1 && Date.prototype.isLeapYear(this.getFullYear())) ? 1 : 0;
  return (this.getMonth() ? daysByMonth.slice(0,this.getMonth()) : [0]).reduce((t,m)=>t+=m) + this.getDate() + leapDay;
}
if (!Date.prototype.getUTCDayOfYear) Date.prototype.getUTCDayOfYear = function () {
  var leapDay = (this.getUTCMonth()>1 && Date.prototype.isLeapYear(this.getUTCFullYear())) ? 1 : 0;
  return (this.getUTCMonth() ? daysByMonth.slice(0,this.getUTCMonth()) : [0]).reduce((t,m)=>t+=m) + this.getUTCDate();
}

// Adjust a date by specified grammar...
// expects an input string in the form 'quantity units, ...'
// e.g. '+1 yr -4 days'
// can translate just about any nomenclature for units, i.e. y, yr, yrs, year, years, Y, ...
// ms (milliseconds), minutes, and months require at least 2 characters to differentiate
// assumes milliseconds by default. 
var chgPattern = /^(?:(ms)|(y)|(mo)|(w)|(d)|(h)|(mi?)|(s))|(~)/;
if (!Date.prototype.change) Date.prototype.change = function (adjStr) {
  var adjustments = adjStr.split(/[\s,]+/);
  while (adjustments.length) {
    var quan = Number(adjustments.shift());
    quan = isNaN(quan) ? 0 : quan; 
    // add dummy pattern to always force a match, and check against patterns
    var units = (adjustments.shift()+'~').toLowerCase().match(chgPattern)[0];
    switch (units) {
      case 'y': this.setUTCFullYear(this.getUTCFullYear()+quan); break;
      case 'mo': this.setUTCMonth(this.getUTCMonth()+quan); break;
      case 'w': this.setUTCDate(this.getUTCDate()+7*quan); break;
      case 'd': this.setUTCDate(this.getUTCDate()+quan); break;
      case 'h': this.setUTCHours(this.getUTCHours()+quan); break;
      case 'mi': this.setUTCMinutes(this.getUTCMinutes()+quan); break;
      case 's': this.setUTCSeconds(this.getUTCSeconds()+quan); break;
      case '~': // dummy pattern and ms default to milliseconds
      case 'ms':
      default: this.setUTCSeconds(this.getUTCSeconds()+quan/1000); break;
    };
  };
  return this;
}

// Difference two dates. Returns an object with several terms
// byUnit returns the absolute difference for each unit
// bySet return the running series of years, months, days, hours, minutes, and seconds.
if (!Date.prototype.diff) Date.prototype.diff = function (date) {
  var differBy = (first,last,delta)=> (a.valueOf()+delta<bvalueOf());
  var dx = {value: date.valueOf()-this.valueOf(), byUnit: {}, bySet: {} };
  dx.sign = (dx.value>0) ? 1 : (dx.value<0) ? -1 : 0;
  var newSet = date.style();
  var oldSet = this.style();
  for (var key of msPer) dx.byUnit[key] = dx.value/msPer[key];
  // create new ordered instances that can be changed ...
  var first = new Date(dx.value>0 ? this:date);
  var last = new Date(dx.value>0 ? date:this);
  dx.bySet.Y = Math.floor((last.valueOf()-first.valueOf())/msPer['Y']);
  first.change(dx.bySet.Y+' years');
  dx.bySet.M = Math.floor((last.valueOf()-first.valueOf())/msPer['M']);
  first.change(dx.bySet.M+' months');
  dx.bySet.D = Math.floor((last.valueOf()-first.valueOf())/msPer['D']);
  first.change(dx.bySet.D+' days');
  dx.bySet.h = Math.floor((last.valueOf()-first.valueOf())/msPer['h']);
  first.change(dx.bySet.h+' hrs');
  dx.bySet.m = Math.floor((last.valueOf()-first.valueOf())/msPer['m']);
  first.change(dx.bySet.m+' min');
  dx.bySet.s = (last.valueOf()-first.valueOf())/msPer['s'];
  return dx;
}


//************************************************************
// Date.style() formats a date according to the given format string
// if no format is given it returns a representative date object with that 
// includes fields not provided by other date functions, such as leapyear and 
// daylight saving time flag, typical of what I use. 
// Uses more 
// References:
//   http://javascript.about.com/library/bldst.htm
//   Derived from code of Scott Trenda <scott.trenda.net> and Kris Kowal 
//     <cixar.com/~kris.kowal/> with more consistent patterns and more fields 
//
// Date.prototype.style(<format_string>)
//   formats a date according to specified string defined by ...
//     'text'    quoted text preserved
//     UTC:      prefix to force Universal Coordinated Time, must be at start of format
//     YY:       2 digit year, i.e. 16
//     YYYY:     4 ddigit year, i.e. 2016
//     M:        month, i.e. 2
//     MM:       padded month, i.e. 02
//     MMM:      short month name, i.e. Feb
//     MMMM:     long month name, i.e. February
//     D:        day of month, i.e. 4
//     DD:       padded day of month, i.e. 04
//     DDD:      short day name, i.e. Sun
//     DDDD:     long day name, i.e. Sunday
//     W:        day of the week, i.e. 0-6
//     WW:       (US) Week of the year, i.e. 1-53
//     WWW:      Alias short day name, i.e. Sun
//     WWWW:     Alias for long day name, i.e. Sunday
//     h:        hour of the day, 12 hour format, i.e. 9
//     hh:       padded hour of the day, 12 hour format, i.e. 09
//     hhh:      hour of the day, 24 hour format, i.e. 19
//     hhhh:     padded hour of the day, 24 hour format, i.e. 19
//     m:        minutes part hour, i.e. 7
//     mm:       padded minutes past hour, i.e. 07
//     s:        seconds past minute, i.e. 5
//     ss:       padded seconds past minute, i.e. 05
//     x:        milliseconds, i.e. 234
//     a:        short meridiem flag, i.e. A or P
//     aa:       long meridiem flag, i.e. AM or PM
//     z:        short time zone, i.e. MST
//     zz:       long time zone i.e. Mountain Standard Zone
//     o:        time zone offset in minutes, i.e. -420 (-7 hours)
//     p:        Prevailing time 0: DST, 1:ST
//     n:        numeric suffix of day i.e. "TH", "ST", "ND", "RD" 
//     e:        Unix epoch, seconds past midnight Jan 1, 1970
//     default:  returns an object representing basic fields noted above
//   defined format keywords ...
//     shortDate:          "M/D/YY",
//     mediumDate:         "MMM D, YYYY",
//     longDate:           "MMMM D, YYYY",
//     fullDate:           "DDDD, MMMM D, YYYY",
//     shortTime:          "h:mm a",
//     mediumTime:         "h:mm:ss aa",
//     longTime:           "h:mm:ss aa z",
//     isoDate:            "YYYY-MM-DD",
//     isoTime:            "hhhh:mm:ss",
//     isoDateTime:        "YYYY-MM-DD'T'hhhh:mm:ss",
//     isoUtcDateTime:     "UTC:YYYY-MM-DD'T'hhhh:mm:ss'Z'",
//     http:               "UTC:DDD, DD MMM YYYY hhhh:mm:ss GMT",
//     stamp:              "YYYYMMDD'T'hhhhmmss-x", valid file extension timestamp
//  examples...
//    d = new Date();      // 2016-12-07T21:22:11.262Z
//    d.style();           // { Y:2016, M:12, MM:'December', D:7, d:3, DD:'Wednesday', 
//                         //   h:14, m:22, s:11, x:262, os:420, z:'MST', e:1481145731.262, dst:false, 
//                         //   t:[ 2016, 11, 7, 14, 22, 11, 262 ] }
//    d.style().e;         // 1481145731.262
//    d.style().t;         // t:[ 2016, 11, 7, 14, 22, 11, 262 ]
//    d.style('stamp');    // '20161207T142211-262'
//    d.style("MM/DD/YY"); // '12/07/16'

// definitions captured by closure 
// common formats...
var masks = {
  shortDate:        "M/D/YY",
  mediumDate:       "MMM D, YYYY",
  longDate:         "MMMM D, YYYY",
  fullDate:         "DDDD, MMMM D, YYYY",
  shortTime:        "h:mm a",
  mediumTime:       "h:mm:ss aa",
  longTime:         "hh:mm:ss aa z",
  isoDate:          "YYYY-MM-DD",
  isoTime:          "hhhh:mm:ss",
  isoDateTime:      "YYYY-MM-DD'T'hhhh:mm:ss",
  isoUtcDateTime:   "UTC:YYYY-MM-DD'T'hhhh:mm:ss'Z'",
  http:             "UTC:DDD, DD MMM YYYY hhhh:mm:ss 'GMT'",
  httpLocal:        "DDD, DD MMM YYYY hhhh:mm:ss z ('GMT'o)",
  stamp:            "YYYYMMDD'T'hhhhmmss-x-o-z",
  iot:              "e+o+z"
  };
var days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
var months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
var zones = {P:'Pacific', M:'Mountain', C:'Central', E:'Eastern', A:'Atlantic'};
var times = {S:'Standard', D:'Daylight', P:'Prevailing'};
var token = /YY(?:YY)?|M{1,4}|D{1,4}|W{1,2}|h{1,4}|m{1,2}|s{1,2}|a{1,2}|z{1,2}|[enopx]|"[^"]*"|'[^']*'/g;
var pad = function(x,n) { return ('0000'+String(x)).slice(-(n||2)); };
if (!Date.prototype.style) Date.prototype.style = function (frmt) {
  frmt = masks[frmt] || frmt;  // default and translate masks 
  var utc = ((frmt||'').slice(0,4)==='UTC:') ? 'UTC' : '';  // set flag and strip prefix?
  frmt = utc ? frmt.slice(4) : frmt;
  var zone = utc ? utc : String(this).match(/\([a-z ]+\)/i).shift().replace(/[a-z ()]+/g,'');
  var get = (x)=>this['get'+utc+x]();
  var dx = {
    Y: get("FullYear"), 
    M: get("Month")+1, 
    MM: months[get("Month")], 
    D: get("Date"), 
    WD: get("Day"), 
    DW: days[get("Day")],
    DY: get("DayOfYear"),
    W: get("Week"),    
    h: get("Hours"), 
    m: get("Minutes"), 
    s: get("Seconds"), 
    x: get("Milliseconds"), 
    os: {
      std: new Date(1970,1,1).getTimezoneOffset(),
      dst: new Date(1970,6,1).getTimezoneOffset(), 
      now:this.getTimezoneOffset(),
      },
    dst: new Date(1970,1,1).getTimezoneOffset()-this.getTimezoneOffset() ? 1 : 0,
    z: zone, 
    e: this.valueOf()*0.001
    };
  // add fields that first require dx definition   
  dx.tx = [dx.Y,dx.M-1,dx.D,dx.h,dx.m,dx.s,dx.x];
  dx.os.iso = (dx.os.now>0 ? "-":"+") + pad(Math.floor(Math.abs(dx.os.now)/60)*100+Math.abs(dx.os.now)%60,4);
  dx.LY = Date.prototype.isLeapYear(dx.Y);
  if (!frmt) return dx;   // no format returns the internal date object
  var flags = {
    YY:   dx.Y%100,
    YYYY: dx.Y,
    M:    dx.M,
    MM:   pad(dx.M),
    MMM:  dx.MM.slice(0,3),
    MMMM: dx.MM,
    D:    dx.D,
    DD:   pad(dx.D),
    DDD:  dx.DW.slice(0,3),
    DDDD: dx.DW,
    W:    dx.WD,
    WW:   dx.W,
    WWW:  dx.DW.slice(0,3),
    WWWW: dx.DW,
    h:    dx.h % 12 || 12,
    hh:   pad(dx.h % 12 || 12),
    hhh:  dx.h,
    hhhh: pad(dx.h),
    m:    dx.m,
    mm:   pad(dx.m),
    s:    dx.s,
    ss:   pad(dx.s),
    x:    pad(dx.x,3),
    a:    dx.h < 12 ? "A" : "P",
    aa:   dx.h < 12 ? "AM" : "PM",
    z:    zone,
    zz:   utc ? "Universal Coordinated Time" : [zones[zone.charAt(0)],times[zone.charAt(1)],'Time'].join(' '),
    o:    dx.os.iso,
    p:    dx.dst,
    n:    ["TH", "ST", "ND", "RD"][dx.D % 10 > 3 ? 0 : (dx.D % 100 - dx.D % 10 != 10) * dx.D % 10],
    e:    dx.e
    };
  return frmt.replace(token, function ($0) { return $0 in flags ? flags[$0] : $0.slice(1,$0.length-1); });
  };

  
  ///************************************************************
/// Number Object Extensions...
///************************************************************
if (Number.isOdd===undefined) Number.isOdd = (n) => n % 2 ? true : false;
if (Number.isEven===undefined) Number.isEven = (n) => !Number.isOdd(n);

///************************************************************
/// Object Extensions...
///************************************************************
// make object keys iterable to work in for-of-loops like arrays
Object.prototype[Symbol.iterator] = function () {
  var keys = Object.keys(this); var index = 0;
  return { next: () => index<keys.length ? {value: keys[index++], done: false} : {done: true} };
}
if (!Object.isObj) Object.defineProperty(Object,'isObj', {
  value: (obj) => (typeof obj==='object' && !(obj instanceof Array)),
  enumerable: false
  })
// following done as prototype definitions to force non-enumerable to not break "for in" loops
/// merge the keys of an ojbect into an existing objects with merged object having precedence
///Object.defineProperty(Object.prototype,'mergekeyskeys', {
///  value: function(merged) {for (var key of Object.keys(merged||{})) { this[key] = merged[key]; }; return this; },
///  enumerable: false
///})
// recursively mergekeys the keys of an object into an existing objects with mergekeysd object having precedence
if (!Object.mergekeys) Object.defineProperty(Object.prototype,'mergekeys', {
  value: 
    function(merged={}) {
      for (let key in merged) { 
        if (Object.isObj(merged[key]) && Object.isObj(this[key])) {
          this[key].mergekeys(merged[key]); // both objects so recursively mergekeys
        }
        else {
          this[key] = merged[key];  // just replace with or insert mergekeysd
        };
      };
      return this; 
    },
  enumerable: false
})
// shortcuts for converting to/from JSON...
if (!Object.asJx) {
  Object.defineProperty(Object.prototype,'asJx', {
    value: function(pretty) { return (JSON.stringify(this,null,pretty?2:0)); },
    enumerable: false
  })
  Object.defineProperty(String.prototype,'asJx', {
    value: function(reviver) {
      let str = this.slice()
      let temp = {};
      try {temp=JSON.parse(str,reviver)} catch(e) { return {err:e.toString(),code:'JX_PARSE', str:str}; }; 
      return temp;
      },
    enumerable: false
  })
}
// order the values of an object as defined by list or alphabetically into an array 
if (!Object.orderBy) Object.defineProperty(Object.prototype,'orderBy', {
  value: function(list) {
    var ordered = [];
    list = list || Object.keys(this).sort();
    for (let i in list) ordered.push(this[list[i]]);
    return ordered; 
  },
  enumerable: false
})

// return resolved object by following sub keys without undefined warnings
if (!Object.retrieve) Object.defineProperty(Object.prototype,'retrieve', {
  value: function (...args){ // (optional object, keys array, optional default)
    let obj = (args[0] instanceof Array) ? this : args[0];
    let keys = (args[0] instanceof Array) ? args[0] : args[1];
    let dflt = args[2] || (args[1]!==keys ? (args[1]||{}) : {});
    while (keys.length) {
      if (obj===undefined) break;
      obj = obj[keys.shift()];
      };
    return (obj===undefined) ? dflt : obj;
  },
  enumerable: false
})


///************************************************************
/// String Object Extensions...
///************************************************************
// pads a string, right or left, with a character to specified length...
// examples: 
//   'Sunday'.pad(' ',10); // returns 'Sunday    '
//   'Sunday'.pad(' ',10,true); // returns '    Sunday'
//   'Sunday'.pad(' ',3); // returns 'Sun'
if (!String.prototype.pad) 
  Object.defineProperty(String.prototype,'pad', {
    value: function(ch,len,left=false){
      let str = (left) ? this.slice(-len) : this.slice(0,len);
      let x = len - str.length;
      return x>0 ? (left ? (new Array(x).join(ch))+str : str+(new Array(x).join(ch))) : str;
    }
  })
// clone of lastIndexOf
if (!String.prototype.last)
  Object.defineProperty(String.prototype,'last', {
    value: String.prototype.lastIndexOf,
    enumerable: false
  })  
// shortcut for test of character existence
if (!String.prototype.has)
  Object.defineProperty(String.prototype,'has', {
    value: function(ch){
      return this.indexOf(ch)!==-1;
    },
    enumerable: false
  })  
// convert string to regular expression...
if (!String.prototype.toRegExp)
  Object.defineProperty(String.prototype,'toRegExp', {
    value: function(){
      let pat = this.indexOf('/')==0 ? this.slice(1,str.lastIndexOf('/')) : str;
      let flags = this.indexOf('/')==0 ? this.slice(str.lastIndexOf('/')+1) : '';
      return new RegExp(pat,flags);
    },
    enumerable: false
  })  
// convert to JSON object... 
// Since String is an object, asJx defined with object above to override Object.asJx
