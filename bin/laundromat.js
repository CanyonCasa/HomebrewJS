/*
  JavaScript data cleansing tools...
  (c) 2017 Enchanted Engineering, MIT license

  The laundromat.js library provides a set of routines for filtering tainted 
  user input data. It includes pre-defined filters that can be easily
  customized.

  Exports include...
    cleansers:      Simple regular pattern filters for basic data types
    disinfectants:  Complex html filtering instructions
    cleanse:        Simple regular expression pattern test with default
    wash:           Basic sclar data filtering method, including HTML
    santitize:      Configurable HTML filter
    scrub:          Recursive JSON filtering method, including HTML
*/

///************************************************************
///  ...
///************************************************************
require("./Extensions2JS");

var cleansers = {
  alpha: /^[a-zA-Z]+$/,
  alphanum: /^[a-zA-Z0-9]+$/,
  attr: /([a-z_$][\w$]{0,63})=(?:['"]([^'"]+)['"]|([^'" ]+))|(^[a-z_$][\w$]{0,63})/im,
  digits: /^[\d+-]$/,
  number: /^[\deE+-.]+$/,
  email: /^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+.[a-zA-Z]{2,4}$/,
  hex: /^[a-fA-F0-9]+$/,
  identifier: /^[a-z_$][\w$]{0,63}$/,
  phone: /^(\+[\d ]+)?([\d]{3})[-. ]?([\d]{3})[-. ]?([\d]{4})$/,
  password: /^(?=.*\d)(?=.*[A-Z])(?=.*[a-z])(?=.*[\W_]).{8,}$/,
  selector: /[a-z][\w\-]*/i,
  style: /[a-z0-9][\w\s\-:;.# ]*/i,
  text: /^[^\/<>]+/,
  tag: /<([\/!])?([a-z0-9-]+)([^>]*)>/im,
  url: /^(?:(http|https|ftp|file):\/\/)*([\w.-]*[^\/])*(\.*\/[\w+$!*().\/?&=%;:@-]*)/,
  urlLocal: /^(\.*\/[\w+$!*().\/?&=%;:@-]*)/,
  user: /^[a-z0-9_-]{3,16}$/,
  words: /[\w\s]+/,
  zip: /^[0-9]{5}(?:-[0-9]{4})?$/
  };

// used to parse HTML
// content tags define tags for which the innnerHTML is included in the filtering
// 
var disinfectants = {
  chlorine: {
    attributes: {
      id:'selector', 
      'class':'selector', 
      style:'style',
      title:'words'
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
var escChar = {'&': "&amp;", '<': "&lt;", '>': "&gt;", '"': "&quot;", "'": "&#039;"};
var escapeHTML = function(unsafe) {
  return unsafe.replace(/[<>"']|&(?!amp|lt|gt|quot|#039)/g, (m)=>escChar[m]);
  };

// simple regular expression pattern test ...
function cleanse(data,pattern,dflt) {
  var m=data.match(pattern);
  return (m) ? m[0] : dflt!==undefined ? dflt : undefined;
  };

// wash scrubs scalar data using soap defined as <pattern>[|<modifier>], 
// where patterns include: undefined, null, '', boolean, numeric, date, and 
// specific string types of hex, html, (JS) identifier, email, password, 
// phone, text, user, and regex (regular expressions).
// <modifier> provides additional soap details.
//   - for simple scalar types the modifier represents a default value, 
//       e.g. 'numeric|0'
//   - a date modifier provides a format string, 
//       e.g. 'date|isoUTCDateTime' or 'date|YYYY-MM-DD'
//   - regex modifier defines the regular expression and flags, 
//       e.g. 'regex|/pattern/flags'
//       Note: regex backslashes must be escaped!!!, e.g. \\t for tab
//   - for html the mdoifier defines a disinfectant method, 
//       e.g. 'html|chlorine' or 'html|lysol'
function wash(data,soap){
  // split soap 'pattern|default' into filter pattern and default values
    // note 'undefined'->['undefined',undefined]; 'undefined|'->['undefined','']
  var sep = (soap||'').indexOf('|');
  var pat = (sep!=-1) ? soap.slice(0,sep).toLowerCase() : (soap||'').toLowerCase();
  var mod = (sep!=-1) ? soap.slice(sep+1) : undefined;
  // extract regular expression and flags if exist. 
  var rex = pat=='regex' ? new RegExp(mod.slice(1,mod.last('/')),mod.slice(mod.last('/')+1)) : /(?:)/;
  // begin cleaning...
  // if no data, except for date, return default
  if ((data===undefined || data===null || data==='')&&pat!='date') { return mod; };  
  // explicitly test pattern and data... 
  switch (pat) {
    case 'undefined': return undefined; break;  // only returns undefined 
    case 'null': return null; break;            // only returns null
    case '': return mod||''; break;            // returns '' or a forced value from default
    case 'boolean':                             // returns only true or false
      return (data===true||data===false)?data:(mod==true);
      break;
    case 'numeric':                             // returns a valid number or default or 0
      return (isNaN(data)) ? parseFloat(mod||0) : parseFloat(data); // "exceptions" to isNaN previously screened
      break;
    case 'date':                                // returns a valid date, uses date extensions
      if (isNaN(Date.parse(data))) {
        // no or invalid date, returns new date object or as formatted
        return (mod) ? (new Date()).style(mod) : (new Date());
        }
      else {
        // valid, so return original string or in format specified by default
        return (mod) ? (new Date(data)).style(mod) : data;
        };
      break;
    case 'regex': // custom regular expression
      return cleanse(data,rex,mod); 
      break;
    case 'html': /// HTML whitelist cleaning
      break;
    default:
      // only string patterns should remain...
      if (typeof data!='string') return mod;
      if (pat in cleansers) return cleanse(data,cleansers[pat],mod);
      return '???'; // unknown pattern  
      break;
    };
  };

// html sanitizer routine...
function sanitize(html,disinfectant,done) {
  var error = null; var cleanHTML = '';
  var soap = disinfectants[disinfectant];
  soap.standard = soap.standard || {};
  var i = 20;
  var pos = 0; var nextTag; var tmp = ''; var stripping=''; var skip=false;
  do {
    nextTag = html.slice(pos).match(cleansers.tag);
    if (nextTag && nextTag.index>0) {
      // piece of text before tag...
      tmp = escapeHTML(html.slice(pos,pos+nextTag.index)).trim();
      if (!stripping&&!skip) cleanHTML += tmp;
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
              cleanHTML += "</"+name+">";
              }
            else {
              // openning tag...
              var flags = (soap.standard.flags||[]).concat(filter.flags||[]);
              var attributes = (soap.standard.attributes||[]).concat(filter.attributes||[]);
              var attrs = []; var am;
              do {
                am = attrStr.trim().match(cleansers.attr);
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
              cleanHTML += '<' + name + (attrs.length ? ' '+attrs.join(' ') : '') + '>';
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
        if (!stripping) cleanHTML += tmp;
        };
      };
    i--;
    } while (nextTag&&i>0);
  if (done) done(error,cleanHTML);
  return [error,cleanHTML];
  };

function scrub(data,soap,done) {
  var dataType= typeof data!='object' ? 'scalar' : Array.isArray(data) ? 'array' : 'object';
  var soapType= typeof soap!='object' ? 'scalar' : Array.isArray(soap) ? 'array' : 'object';
  var cleanData = soapType=='object' ? {} : soapType=='array' ? [] : undefined;
  var error = null;
  if (dataType!=soapType) {
    var err = "ERROR[scrub]: data/soap type mismatch -> "+dataType+"/"+soapType;
    if (done) done(err,null);
    return [err, null];
    };
  switch (dataType) {
    case 'scalar':
      // simple data types: string, numeric, boolean, null, ...
      cleanData = wash(data,soap);
      break;
    case 'array':
      if (soap.length==1) {
        // shortcut soap definition, use same soap item for all data checks 
        for (var i=0;i<data.length;i++) {
          if (typeof data[i]=='object') { // iterative scrub
            [error, cd] = scrub(data[i],soap[0]);
            if (error) break;
            cleanData.push(cd);
            }
          else {
            cleanData.push(wash(data[i],soap[0]));
            };
          };
        }
      else {
        // use respective soap item for all checks, extra data not in soap removed!
        for (var i=0;i<soap.length;i++) {
          if (typeof soap[i]=='object') { // iterative scrub
            [error, cd] = scrub(data[i],soap[i]);
            if (error) break;
            cleanData.push(cd);
            }
          else {
            cleanData.push(wash(data[i],soap[i]));
            };
          };
        };
      break;
    case 'object':
      for (var key of soap) {
        if (typeof soap[key]=='object') {  // iterative scrub
          [error, cd] = scrub(data[key],soap[key]);
          if (error) break;
          cleanData[key]=cd;
          }
        else {
          cleanData[key]=wash(data[key],soap[key]);
          };
        };
      break;
    };
  if (done) done(error,cleanData);
  return [error,cleanData];
  };

function sort(laundry, closet) {
  var sorted = [];
  for (var item of closet) { sorted.push(laundry[item]); };
  return sorted;
}

module.exports = {
  cleansers: cleansers,
  disinfectants: disinfectants,
  cleanse: cleanse,
  wash: wash,
  sanitize: sanitize,
  scrub: scrub,
  sort: sort
  };

