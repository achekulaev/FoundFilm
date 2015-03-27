var torrentStream = require('torrent-stream');
var readTorrent = require('read-torrent');

JSTorrent = function(filename) {

  this.filename = filename;
  this.engine = null;

  this.init = function() {
    readTorrent(this.filename, function(err, torrent) {
    	if (err) {
    		console.error(err.message);
    	}

    	// console.log(torrent);
      this.engine = torrentStream(torrent, {
        path: '/Users/alexei.chekulaev/tmp/'
      });
      console.log(this.engine);

      this.engine.on('ready', function() {
        console.log(this.engine.files);
      });
    });
  };



};
