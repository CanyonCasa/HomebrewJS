// node script to create bcrpyt has from a username and password...

const crypto = require('./CryptoPlus');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const rd = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function makeHash(credentials) {
  credentials.pwhash = crypto.plus.hash(credentials.username+credentials.pw);
  credentials.bhash = bcrypt.hashSync(credentials.pwhash, 8);
  credentials.check = bcrypt.compareSync(credentials.pwhash,credentials.bhash);
  console.log("Credentials: ",credentials);
}

function askPW(username) {
rd.question('Enter the password: ', (answer) => { makeHash({username: username, pw: answer}); rd.close(); });
}

function askUsername(callback) {
  rd.question('Enter the username: ', (answer) => callback(answer));
}

askUsername(askPW);
