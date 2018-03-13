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
///  ...
///************************************************************
require("./Extensions2JS"); // dependency on Date stylings

var patterns = {
  alpha: /^[a-zA-Z]+$/,
  alphanum: /^[a-zA-Z0-9]+$/,
  attr: /([a-z_$][\w$]{0,63})=(?:['"]([^'"]+)['"]|([^'" ]+))|(^[a-z_$][\w$]{0,63})/im,
  digits: /^\d+$/,
  email: /^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+.[a-zA-Z]{2,4}$/,
  hash: /^[$.\/a-zA-Z0-9]+$/, // bcrypt
  hex: /^[a-f0-9]+$/i,
  identifier: /^[a-z_$][\w$-]+$/i,
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
  usernamex: /^[\w]{3,32}$|^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+.[a-zA-Z]{2,4}$/,
  word: /^\w+$/,
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
var escCB = {'&': "&amp;", '<': "&lt;", '>': "&gt;", '"': "&quot;", "'": "&#039;"};
var escHTML = function(unsafe) {
  return unsafe.replace(/[<>"']|&(?!amp|lt|gt|quot|#039)/g, (m)=>escCB[m]);
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
  if ((data===undefined || data===null || data==='') && pat!='date') { return dflt; };
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

// html sanitizer routine...
function htmlSafe(html,mode) {
  var error = null; var safeHTML = '';
  var filter = htmlModes[mode];
  soap.standard = soap.standard || {};
  var i = 20;
  var pos = 0; var nextTag; var tmp = ''; var stripping=''; var skip=false;
  do {
    nextTag = html.slice(pos).match(patterns.tag);
    if (nextTag && nextTag.index>0) {
      // piece of text before tag...
      tmp = escHTML(html.slice(pos,pos+nextTag.index)).trim();
      if (!stripping&&!skip) safeHTML += tmp;
      pos += nextTag.index;
      };
    if (nextTag) {
      // handle the tag...
      var [tag,prefix,name,attrStr] = nextTag.slice(0,4);
      var filter = soap.standard.tags.indexOf(name)!=-1 ? soap.standard.tagDefault : name in soap.tags ? soap.tags[name] : undefined;
      if (filter) {
        if (stripping) {
          // stripping and closing tag found with same name as openning tag, just clear skipping...
          stripping = prefix=='/'&&stripping==name ? '' : stripping;
          }
        else {
          // process tag...
          if (filter.action=='strip') {
            stripping = (filter.selfClose) ? '' : name;
            }
          else {
            // valid tag...
            if (prefix=='/') {
              // closing tag
              safeHTML += "</"+name+">";
              }
            else {
              // openning tag...
              var flags = (soap.standard.flags||[]).concat(filter.flags||[]);
              var attributes = (soap.standard.attributes||[]).concat(filter.attributes||[]);
              var attrs = []; var am;
              do {
                am = attrStr.trim().match(patterns.attr);
                if (am) {
                  if (flags.indexOf(am[4])!=-1) {
                    attrs.push(wash(am[4],'identifier|'));
                    };
                  if (attributes.indexOf(am[1])!=-1) {
                    attrs.push(am[1]+'="'+wash(am[2]||am[3],soap.attributes[am[1]])+'"');
                    };
                  attrStr=am.input.slice(am[0].length).trim();
                  };
                } while (am);
              // add sanitized tag...
              safeHTML += '<' + name + (attrs.length ? ' '+attrs.join(' ') : '') + '>';
              };
            };
          };
        }
      else {
        // skip tag as no filter parameters given...
        //skip = !skip;
        };
      pos += nextTag[0].length;
      }
    else {
      // no tag, so handle any remaining text...
      if (pos<html.length) {
        tmp = escapeHTML(html.slice(pos));
        if (!stripping) safeHTML += tmp;
        };
      };
    i--;
    } while (nextTag&&i>0);
  return safeHTML;
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
  htmlModes: htmlModes,
  escHTML: escHTML,
  rexSafe: rexSafe,
  scalarSafe: scalarSafe,
  htmlSafe: htmlSafe,
  jsonSafe: jsonSafe
  };
