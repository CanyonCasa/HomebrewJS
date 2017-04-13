// notify.js (c) 2017 Enchanted Engineering
// Provides hooks for notifying users via email and text messaging
// define in config.share to pass to all sites.

var email = require('emailjs');

var scribe = global.scribe;
var cfg;
var mailClient;
var gateways;

// callback to send mail attached to request object...
function sendMail(mail,callback) {
  // set required defaults...
  var defaults = cfg.email.defaults || {};
  mail.to = mail.to || defaults.to;
  mail.from = mail.from || defaults.from;
  mail.subject = mail.subject || defaults.subject;
  mail.text = mail.text || defaults.text;
  // convert all address lists to strings...
  ['to','from','cc','bcc'].forEach(function(addr) {
    if (typeof(mail[addr])=='object') mail[addr] = mail[addr].join(', ');
    });
  // send the message...
  mailClient.send(mail,function(err,msg) {
    if (callback) { 
      return callback(err, msg);
      }      
    else {
      if (err) {
        scribe.error("NOTIFY[mail-error]: %s", JSON.stringify(err) );
        }
      else {
        scribe.info("NOTIFY[mail]: %s (%s) @ %s", mail.to, mail.subject, msg.header.date);
        };
      return;
      };
    });
  };
  
// callback to send text message attached to request object...
function sendText(msg,callback) {
  // set required defaults...
  var defaults = cfg.sms.defaults || {};
  msg.to = msg.to || defaults.to;
  msg.to = gateways.map(g=>g.replace('%s',msg.to));  // expand number to gateway list...
  msg.text = msg.text || defaults.text;
  msg.subject = msg.text;
  // send message via gateway, don't report errors as will always error...
  sendMail(msg, function(err,msg) { if (callback) return callback(err, msg) });
  };

// this function called on load...
exports = module.exports = function (options) {
  cfg = options;
  if (options.email && options.email.smtp) {
    mailClient = email.server.connect(options.email.smtp);  // connect to server
    scribe.info("Notify email support initialized...");
    };
  if (mailClient && options.sms && options.sms.providers) {
    gateways = options.sms.providers.map((p)=>p[1]);
    scribe.info("Notify SMS support initialized...");
    };
  return {
    sendMail: (mailClient) ? sendMail : null,
    sendText: (gateways) ? sendText : null
    };
  };
