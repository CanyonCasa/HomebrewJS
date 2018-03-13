/// notify.js (c) 2018 Enchanted Engineering
// Provides hooks for notifying users via email and text messaging
// Attached as functions sendMail and sendText of rqst.hb object.

require('./Extensions2JS');
var email = require('emailjs');
const Scribe = require('./Scribe');
var scribe;
var cfg;

// callback to send mail attached to request object...
var sendMail = function (mail,callback) {
  try {
    var server = email.server.connect(cfg.email.smtp);  // connect to server
    // set required defaults...
    var msg = {all:{}}.mergekeys(cfg.email.defaults).mergekeys(mail);  
    // convert all address lists to strings...
    ['to','cc','bcc'].forEach(function(addr) {
      if (typeof(msg[addr])==='object') msg[addr] = msg[addr].join(', ');
      if (msg[addr]!==undefined) msg.all[addr] = msg[addr];
      });
    // send the message...
    server.send(msg,function(err,report) {
      if (callback) return callback(err, report);
      if (err) {
        scribe.error("Notification ERROR: %s", JSON.stringify(err));
        }
      else {
        scribe.info("Notification[%s] => %s @ %s", msg.subject, msg.all.asJx(), report.header.date);
        };
      });
    }
  catch(e) { 
    scribe.error("sendMail failure: %s",e.toString());
    if (callback) callback(e); 
    };
  };
  
// callback to send text message attached to request object...
var sendText = function (msg,callback) {
  // set required defaults and override as defined by msg...
  var sms = {}.mergekeys(cfg.esms.defaults).mergekeys(msg);
  if (sms.time) sms.text = '[' + (new Date().style('isoDateTime'))+']:\n' + sms.text;
  try {
    // handle group, assume msg.group=[{to:'?',provider:'?'},...] (or undefined)
    sms.group = sms.group || [{to:sms.to,provider:sms.provider}];
    // map provider(s) to gateway(s) and send message via gateway...
    for (let i=0;i<sms.group.length;i++) sms.group[i]=(cfg.esms.gateways[sms.group[i]['provider']].replace('%s',sms.group[i]['to']))
    sms.to = sms.group.join(', ');
    sms.subject = sms.text;
    sendMail(sms, callback);
    }
  catch(e) { 
    scribe.error("sendText failure: %s",e.toString());
    if (callback) callback(e); 
    };
  };

// this function called to initialize notification services...
var init = function init(options) {
  cfg = options.cfg;
  scribe = new Scribe({tag: options.tag, parent:options.scribe});
  var actions={};
  if (cfg.email && cfg.email.smtp) {
    actions.sendMail = sendMail;
    scribe.info("Notification EMAIL support initialized...");
    if (cfg.esms && cfg.esms.gateways) {
      actions.sendText = sendText;
      actions.providers = Object.keys(cfg.esms.gateways);
      scribe.info("Notification SMS support initialized...");
      };
    };
  return actions;
  };

module.exports = init;
