/*
  Implements a module for Safe JSON filtering ...
  (c) 2018 Enchanted Engineering, MIT license

  The SafeJSON.js library provides a reusable utility set of routines for 
  filtering user input data provided as JSON objects. It includes easily 
  customized pre-defined filter patterns.

  Exports include...
    patterns:       Pre-defined regular expression patterns for common data types
    htmlPatterns:   Pre-defined regular expression patterns for HTML
    escHTML:        Method to escape HTML blocks 
    rexSafe:        Basic regular expression filtering method
    scalarSafe:     Basic scalar data filtering method, including HTML
    htmlSafe:       Basic HTML filtering method
    jsonSafe:       Recursive JSON filtering method, including HTML fields
*/

///************************************************************
///  Dependencies...
///************************************************************
require("./Extensions2JS"); // dependency on Date stylings

var patterns = {
  alphanum: /^[a-zA-Z0-9]+$/,
  attr: /([a-z_$][\w$]{0,63})=(?:['"]([^'"]+)['"]|([^'" ]+))|(^[a-z_$][\w$]{0,63})/im,
  digits: /^\d+$/,
  email: /^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/,
  filename: /^[^\/\\]+$/,
  hash: /^[$.\/a-zA-Z0-9]+$/, // bcrypt
  hex: /^[a-f0-9]+$/i,
  identifier: /^[a-z_$][\w$-]+$/i,
  letter: /^[a-z]$/i,
  name: /^[a-zA-Z- ]+$/,
  phone: /^\d{10}$/,
  phonex: /^(\+[\d ]+)?([\d]{3})[-. ]?([\d]{3})[-. ]?([\d]{4})$/,
  password: /^(?=.*\d)(?=.*[A-Z])(?=.*[a-z])(?=.*[\W_]).{8,}$/,
  selector: /[a-z][\w\-]*/i,
  style: /[a-z0-9][\w\s\-:;.# ]*/i,
  text: /^[^\/<>]+/,
  tag: /<([\/!])?([a-z0-9-]+)([^>]*)>/im,
  url: /^(?:(http|https|ftp|file):\/\/)*([\w.-]*[^\/])*(\.*\/[\w+$!*().\/?&=%;:@-]*)/,
  urlLocal: /^(\.*\/[\w+$!*().\/?&=%;:@-]*)/,
  username: /^[\w]{3,32}$/,
  usernamex: /^[\w]{3,32}$|^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/,
  word: /^[\w-]+$/,
  words: /^[\w\s]+$/,
  zip: /^[0-9]{5}(?:-[0-9]{4})?$/
  };

// used to parse HTML
// content tags define tags for which the innnerHTML is included in the filtering
/// 
var htmlModes = {
  chlorine: {
    attributes: {
      id:'selector', 
      'class':'selector', 
      style:'style',
      title:'words'
      },
    allowed: {
      flags: ['hidden'],
      attributes: ['id','class','style','title'],
      tagDefault: {},
      tags: ['address', 'article', 'aside', 'b', 'blockquote', 'br', 'caption', 'code', 'div', 'em', 'figcaption', 'figure', 
             'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'li', 'main', 'object', 'ol', 'p', 'pre', 
             'q', 'span', 'style', 'table', 'td', 'th', 'time', 'tr', 'u', 'ul']
      },
    tags: {
      a: {action: 'strip'},
      img: {action: 'strip', selfClose:true},
      script: {action: 'strip'}
      },  
    },  
  lysol: {
    attributes: {
      alt:'words',
      id:'selector', 
      'class':'selector', 
      height:'style',
      href: 'urlLocal|',
      src: 'urlLocal|',
      style:'style',
      title:'words',
      width:'style'
      },
    standard: {
      flags: ['hidden'],
      attributes: ['id','class','style','title'],
      tagDefault: {},
      tags: ['address', 'article', 'aside', 'b', 'blockquote', 'br', 'caption', 'code', 'div', 'em', 'figcaption', 'figure', 
             'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'li', 'main', 'object', 'ol', 'p', 'pre', 
             'q', 'span', 'style', 'table', 'td', 'th', 'time', 'tr', 'u', 'ul']
      },
    tags: {
      a: {attributes: ['href']},
      img: {attributes: ['src', 'alt', 'width', 'height']},
      script: {attributes: ['src']}
      }  
    }
  };

// escape special characters found in html text...
var escHTML = function(unsafe) {
  var esc = {'&': "&amp;", '<': "&lt;", '>': "&gt;", '"': "&quot;", "'": "&#039;"};
  return unsafe.replace(/[<>"']|&(?!amp|lt|gt|quot|#039)/g,m=>esc[m]);
  };

// unescape special characters found in html text...
var unescHTML = function(safe) {
  var unesc = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': '\'' };
  return safe.replace(/&(amp|lt|gt|quot|#039);/g,m=>unesc[m]);
  };

// strips all html tags
var stripHTML = function(unsafe) {
  return unsafe.replace(/<\/[^>]+>/g,'\n').replace(/<[^>]+>/g,'').replace(/\s*\n+\s*/g,'\n').trim();
  };

// html sanitizer routine...
function htmlSafe(html,mode) {
  var error = null; var safeHTML = '';
  switch (mode) {
    case 'escape': safeHTML = escHTML(html); break;
    case 'encode': safeHTML = encodeURI(html); break;
    case 'strip': safeHTML = stripHTML(unescHTML(html)); break;
    default: 
    };
  return safeHTML;
  };

// simple regular expression pattern test ...
function rexSafe(data,pattern,dflt) {
  var m=data.match(pattern);
  return (m) ? m[0] : dflt!==undefined ? dflt : undefined;
  };

// scalarSafe scrubs scalar data using specified filter defined as pattern  (scalar) or [pattern,default], where 
//   pattern defines the regular expression match pattern, including...
//     undefined, null, '', '*', boolean, numeric, integer, date, and specific types defined in patterns 
//     including hex, html, (JS) identifier, email, password, phone, text, user, and '/regex/flags' (regular expressions).
//   default represents an optional value when no data is present or should be modified     
//     special default modifiers include: [date,format_string], [html,scope]
//   Note: regex backslashes must be escaped!!!, e.g. \\t for tab
function scalarSafe(data,filter){
  var [pat,dflt] = (Array.isArray(filter)) ? filter : [filter];
  // if no data, except for date, return default
  if ((data===undefined || data===null || data==='') && pat!='date') { return dflt||data; };
  if (pat==='*') return data; // bypass, no filtering
  // begin checking data...
  // explicitly test pattern and data... 
  switch (pat) {
    case 'undefined': return undefined; break;  // only returns undefined 
    case 'null': return null; break;            // only returns null
    case '': return dflt||''; break;            // returns '' or a forced value from default
    case 'boolean':                             // returns only true or false
      return (data===true||data===false) ? data : (dflt==true);
      break;
    case 'integer':                             // returns a valid number or default or 0
      return (isNaN(data)) ? parseInt(dflt||0) : parseInt(data); // "exceptions" to isNaN previously screened
      break;
    case 'numeric':                             // returns a valid number or default or 0
      return (isNaN(data)) ? parseFloat(dflt||0) : parseFloat(data); // "exceptions" to isNaN previously screened
      break;
    case 'date':                                // returns a valid date, uses date extensions
      if (isNaN(Date.parse(data))) {
        // no or invalid date, returns new date object or formatted string as specified by modifier
        return (dflt) ? (new Date()).style(dflt) : (new Date());
        }
      else {
        // valid, so return original string or in format specified by default
        return (dflt) ? (new Date(data)).style(dflt) : data;
        };
      break;
    case 'choice':                              // value must be one of a list (dflt), default to first item
      if (typeof dflt == 'string') dflt = dflt.split(',');  // dflt may be comma delimited string or array
      return (dflt.indexOf(data)==-1) ? dflt[0] : data;
      break;
    case 'html': /// HTML whitelist cleaning
      return 'html';
      break;
    default:
      // only string or regex patterns should remain...
      if (typeof data!='string') return dflt;
      // is it a predefined pattern?
      if (pat in patterns) return rexSafe(data,patterns[pat],dflt);
      // is it a regular expression?
      if (pat[0]==='/') {
        var rex = new RegExp(pat.slice(1,pat.last('/')),pat.slice(pat.last('/')+1));
        return rexSafe(data,rex,dflt); 
        };
      return '??? UNKNOWN PATTERN: ' + pat; // unknown pattern  
      break;
    };
  };

// recursive JSON filter. Expects a filter with structure matching JSON data, jx
function jsonSafe(jx,filter) {
  if (filter==='*') return jx;
  if (typeof jx!='object') {
    // scalar input...
    return scalarSafe(jx,filter);
  }
  else if (Array.isArray(jx)) {
    // array input... note filter should be an array of patterns each being an array
    var jxa = [];
    if (filter.length==1) {
      // shortcut filter definition allowed for arrays; use same filter[0] for all jx checks
      for (var i=0;i<jx.length;i++) jxa.push(jsonSafe(jx[i],filter[0]));
    }
    else {
      // longhand - only filter elements defined in filter
      for (var i=0;i<filter.length;i++) jxa.push(jsonSafe(jx[i],filter[i]));
    }
    return jxa;
  }
  else {
    // assume object input...
    // use keys of respective filter item for checks, extra jx keys not in filter are removed!
    var jxo = {};
    for (var k in filter) jxo[k] = jsonSafe(jx[k],filter[k]);
    return jxo;    
  };
};

module.exports = {
  patterns: patterns,
  htmlSafe: htmlSafe,
  rexSafe: rexSafe,
  scalarSafe: scalarSafe,
  jsonSafe: jsonSafe
  };
