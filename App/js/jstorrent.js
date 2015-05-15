var torrentStream = require('torrent-stream');
var readTorrent = require('read-torrent');

JSTorrent = function(filename) {

  this.filename = filename;
  this.engine = null;

  jstorrent = this;
  readTorrent(this.filename, function(err, torrent) {
  	if (err) {
  		console.error(err.message);
  	}

  	console.log(torrent);

    jstorrent.engine = torrentStream(torrent, {
      path: '/Users/alexei.chekulaev/tmp/'
    });
    console.log(jstorrent.engine);

    jstorrent.engine.on('ready', function() {
      console.log(jstorrent.engine.files[0]);
      // jstorrent.engine.files[0].select(); //downloads first file
    });

    jstorrent.engine.on('download', function(pi) {
      console.log(pi);
    });
  });



};
