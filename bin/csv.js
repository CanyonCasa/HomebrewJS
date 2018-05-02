/*
  Implements a module for converting JS objects to CSV ...
  (c) 2018 Enchanted Engineering, MIT license

  The csv.js library provides routines for transforming comma separated value
  data to/from JS objects
*/

///************************************************************
///  Dependencies...
///************************************************************
require("./Extensions2JS"); // dependency on Date stylings

const EOL = "\r\n";
// helper functions to quote strings and arrays...
// quote string, if not a number
var quoteIf = x => isNaN(x) ? '"'+x.replace('"','""')+'"' : Number(x);
// quote strings or elements of an array
var quote = v => v instanceof Array ? v.map(x=>quoteIf(x)) : quoteIf(v);

// obj2csv function converts an array of JS objects into a csv string.
// cfg provides convertion configuration info
//   cols: an array of col keys that determines the output order
//   labels: an array of names for column labels, default cols.
function obj2csv(obj,cfg) {
  if (!Array.isArray(obj)) return (typeof obj=='object') ? obj2csv([obj],cfg) : '';
  cfg.labels = cfg.labels || cfg.cols;
  let csv = quote(cfg.labels).join(',')+EOL;  // first row column labels
  obj.forEach(x => {
    /// fix problem of x containing objects!
    let line = quote(Array.isArray(x) ? x : x.orderBy(cfg.cols)).join(',')+EOL;
    csv += line;
    });
  return csv;
}
module.exports = {
  obj2csv: obj2csv
  };
