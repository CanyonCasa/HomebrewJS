// notify.js (c) 2017 Enchanted Engineering
// Provides hooks for notifying users via email and text messaging
// Place early in the handler chain to be available to other middleware.

var email = require('emailjs');

var site;
var scribe; // local reference for context
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
  msg.num = msg.num || msg.to || defaults.to;
  msg.text = msg.text || defaults.text;
  msg.subject = msg.text;
  // expand number to gateway list...
  msg.to = gateways.map(g=>g.replace('%s',msg.num));
  // send message via gateway, don't report errors as will aalways error...
  sendMail(msg, function(err,msg) { if (callback) return callback(err, msg) });
  };

// this function called by express app to initialize middleware...
exports = module.exports = Notify = function Notify(options){
  site = this;          // local reference for context
  scribe = site.scribe;
  cfg = options;
  if (options.email && options.email.smtp) {
    mailClient = email.server.connect(options.email.smtp);  // connect to server
    scribe.info("Notify email support initialized...");
    };
  if (mailClient && options.sms && options.sms.providers) {
    gateways = options.sms.providers.map((p)=>p[1]);
    scribe.info("Notify SMS support initialized...");
    };

  // this function called by express app for each page request...
  return function notifyMiddleware(rqst, rply, next) {
    // attach callbacks to request object...
    rqst.hbNotify = {
      sendMail: (mailClient) ? sendMail : null,
      sendText: (gateways) ? sendText : null
      };
    // continue to next middleware
    next();
    };
  };
