var http = require("http")
  , url = require('url')
  , request = require('request')
  , iconv = require('iconv-lite')
  , cookie = require('cookie')
  , cheerio = require('cheerio') //html parser
  , gui = require('nw.gui')
  , Promise = require('bluebird')
  , fs = Promise.promisifyAll(require('fs'))
  , win = gui.Window.get()
  , mkdirp = require('mkdirp') //mkdirp node analog
  , open = require('open'); //open file with default app

var mb = new gui.Menu({ type : "menubar" });

//append CP1251 and other encodings support to request Object
iconv.extendNodeEncodings();

//-- Initiate default Mac OS menu
mb.createMacBuiltin("FoundFilm");
win.menu = mb;
win.focus();

//-- Prevent Exception that would make app unusable
process.on("uncaughtException", function(err) {
  ffLog("[!] Exception -- " + err.stack + "\n--------------------\n");

});

//-- Prevent loading external page that would make app unusable
window.onbeforeunload = function() {
  win.hide();
  gui.App.quit();
};

//-- Handle closing child processes
var childProcesses = {};
process.on('exit', function() {
  angular.forEach(childProcesses, function(process) {
    process.kill();
  });
});

/**
 * package.json starts window invisible for smoother load. here we show it
 */
$(window).on('load', function() {
  win.show();
  win.focus();
});

/**
 * Check for empty value
 * http://stackoverflow.com/questions/5515310/is-there-a-standard-function-to-check-for-null-undefined-or-blank-variables-in
 * @param value
 * @returns {boolean|*}
 */
function isEmpty(value){
  return (typeof value === 'undefined' || value == null || value === 0 || value.length === 0 || jQuery.isEmptyObject(value));
}