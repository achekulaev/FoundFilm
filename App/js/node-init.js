var isBrowser = (typeof require === 'undefined');

if (!isBrowser) {
  var http = require("http")
    , url = require('url')
    , request = require('request')
    , iconv = require('iconv-lite')
    , cookie = require('cookie')
    , cheerio = require('cheerio') //html parser
    , gui = require('nw.gui')
    , fs = require('fs')
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
    console.log("Exception: ", err);
  });

  //-- Prevent loading external page that would make app unusable
  window.onbeforeunload = function() {
    gui.App.quit();
  };

  //-- Handle closing child processes
  var childProcesses = {};
  process.on('exit', function() {
    angular.forEach(childProcesses, function(process) {
      process.kill();
    });
  });

  $(window).on('load', function() {
    win.show();
    win.focus();
  });
} else {
  //emulate some things to avoid errors
  require = function(module) {
    switch (module) {
      case 'nw.gui':
        var gui = {}, window = {};
        gui.Window = {};
        gui.Window.get = function() { return window; }
        return gui;
    }
  }
}

/**
 * Check for empty value
 * http://stackoverflow.com/questions/5515310/is-there-a-standard-function-to-check-for-null-undefined-or-blank-variables-in
 * @param value
 * @returns {boolean|*}
 */
function isEmpty(value){
  return (typeof value === 'undefined' || value == null || value.length === 0 || jQuery.isEmptyObject(value));
}