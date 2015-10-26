/**
 * Settings service Object structure:
 * {
 *   config: { lastUpdate: timestamp, showSeen: bool },
 *   data: {
 *     cookie: { {cookie}, {...} }, // browser cookies of current logged in user
 *     series: {
 *       id123: {
 *         collapsed: bool // collapsed/expanded in list
 *         episodes: {
 *           id_101: {
 *             ariaRunning: int (1|0)
 *             gettingTorrentFile: int (1|0)
 *             gotMovie: int (1|0)
 *             gotTorrentFile: int (1|0)
 *             id: int
 *             link: string // ex: "http://lostfilm.tv/nrdr.php?c=235&s=1&e=01"
 *             number: string // ex: "05", parsed number of episode in season
 *             season: string // ex: "1", parsed season number
 *             seen: bool
 *             title: string
 *           },
 *           id_102: {...}
 *         }
 *         id: int,
 *         isNew: bool,
 *         isFinished: bool, // when series finished never update again
 *         seen: bool,
 *         status: bool, // tracked or not
 *         title: string,
 *         unseenCount: int,
 *         updatingDescription: string,
 *         updatingStatus: int(0|1)
 *       },
 *       id124: {...}
 *     }
 *   }
 * }
 */
ffControllers.factory('$settings', [ function() {

  var $instance = angular.fromJson(window.localStorage.foundFilm);
  if (!$instance) {
    $instance = { data : {}, config: {} };
  }

  $instance.save = function() {
    window.localStorage.foundFilm = angular.toJson({ data: $instance.data, config: $instance.config });
  };

  $instance.reset = function() {
    $instance.data = $instance.config = {};
    $instance.save();
  };

  //check defaults
  if (!$instance.data.series) {
    $instance.data.series = {};
  } else {
    angular.forEach($instance.data.series, function(movie) {
      movie.updatingStatus = 0;
      if (movie.episodes) {
        angular.forEach(movie.episodes, function(episode) {
          // reset in-progress statuses
          episode.ariaRunning = 0;
          episode.gettingTorrentFile = 0;
        })
      }
    });
  }

  if (!$instance.config) {
    $instance.config = {};
  }

  return $instance;
}]);

/**
 * Agent service to access Agent object
 * @return {{}}
 */
ffControllers.factory('$agent', function() {
  return new Agent();
});

/**
 * Agent service to access New iframe-based Agent object
 * @return {{}}
 */
ffControllers.factory('$lfAgent', function() {
  var $instance = {};

  $instance.ERROR_SERIES = 'ERROR. Could not parse series: ';
  $instance.ERROR_SERIES_EPISODE = 'ERROR: No episodes found';
  $instance.ERROR_SERIES_LINK = 'ERROR: Download link can not be parsed.';
  $instance.ERROR_TORRENT = 'ERROR: Could not parse torrent links';


  $instance.loadUrl = function(url, callback) {
    var iframe = jQuery('<iframe>').appendTo('body');
    iframe.attr('nwdisable', 'nwdisable')
          .attr('nwfaketop', 'nwfaketop')
          .css('display', 'none');
    iframe[0].onload = function() {
      callback(iframe[0].contentWindow.document.body.innerHTML);
      iframe.remove();
    };
    iframe.attr('src', url);
  };

  /**
   * Gets object of objects of series
   * @param callback
   */
  $instance.getSeries = function(callback) {
    this.loadUrl('http://www.lostfilm.tv/serials.php', function(html) {
      //return value
      var series = {};
      //cheerio object
      var $ = cheerio.load(html);
      //self link
      var _this = $instance;
      var tokens = {
        //holds all series names
        names:      'div.mid div.bb a.bb_a'
      };

      $(tokens.names).each(function() {
        var movie = {};
        movie.title = _this.decode(
          jQuery.trim(
            $(this).html()
          ).stripTags().replace('(', ' (')
        );

        //-- $(this).attr('href') example: /browse.php?cat=67
        var regexMatches = $(this).attr('href').toString().match(/\d+$/);
        if (regexMatches !== null) {
          movie.id = regexMatches[0];
        }
        series['id' + movie.id] = movie;
      });

      callback(series);
    });
  };

  $instance.getEpisodes= function(movieId, callback) {
    var _this = $instance;
    this.loadUrl('http://lostfilm.tv/browse.php?cat=' + movieId, function(html) {
      //return value
      var episodes = {};
      //cheerio object
      var $ = cheerio.load(html);
      //array of selectors
      var tokens = {
        movieInfo:        'div.mid > div',
        movieStatusRegex: 'Статус:\s?(.*)',
        movieFinished:    'закончен',
        episodeRow:       'div.t_row',
        // episode title
        episodeTitle:     '.t_episode_title > div > div > nobr',
        //download link
        download:         'a.a_download',
        //download regexp
        downloadRegex:  /ShowAllReleases\('(\d+)',\s?'(\d+)',\s?'([^']+)'.*/
      };

      movieInfo = $(tokens.movieInfo).html(); //cheerio uses first match by default
      movieInfo = _this.plainString(movieInfo);
      var statusMatch = movieInfo.match(tokens.movieStatusRegex);
      var isFinished = (_this.plainString(statusMatch[1]) == tokens.movieFinished);

      var episodesDom = $(tokens.episodeRow);
      if (!episodesDom.length) {
        ffLog(_this.ERROR_SERIES + _this.ERROR_SERIES_EPISODE + ' ' + _this.plainString($('title').html()));
        return {};
      }

      $(episodesDom).each(function() {
        var episode = { link: 'http://lostfilm.tv/nrdr.php?c={0}&s={1}&e={2}' };
        var episodeTitle = $(tokens.episodeTitle, this).html();
        if (episodeTitle.length) {
          episode.title = _this.plainString(episodeTitle);
        } else {
          ffLog(_this.ERROR_SERIES + 'Could not parse episode title!');
          return true;
        }

        var download = $(tokens.download, this);
        download = download.attr('onclick').toString();
        if (!download.length) {
          ffLog(_this.ERROR_SERIES + _this.ERROR_SERIES_LINK + ' - ' + episode.title);
          return true;
        }
        // Extract ids for download page
        var matches = download.match(tokens.downloadRegex);
        if (!matches) {
          ffLog(_this.ERROR_SERIES + _this.ERROR_SERIES_LINK + ' - ' + episode.title);
          ffLog(download);
          return true;
        }
        episode.link = episode.link.format(matches[1], matches[2], matches[3]);
        episode.season = matches[2];
        episode.number = matches[3];
        episode.id = episode.season + episode.number;

        episodes['id_' + episode.id] = episode;
      });

      callback(episodes, isFinished);
    });
  };

  $instance.getTorrent = function(url, callback) {
    var tokens = {
      allTorrents: 'div > div > div > table tr > td > a'
    };
    //cheerio object
    var links = [];

    this.loadUrl(url, function(html) {
      var $ = cheerio.load(html);
      var _links = $(tokens.allTorrents);

      if (!_links.length) {
        ffLog(this.ERROR_TORRENT);
        callback([]);
      }

      $(_links).each(function() {
        links.push({
          href: $(this).attr('href'),
          name: $instance.decode($(this).text())
        });
      });

      callback(links);
    });
  };

  $instance.getTorrentFile = function(link, movieId, episodeId, callback) {
    var saveDir = this.getUserHome() + movieId;

    mkdirp(saveDir, function(err) { //try creating dir
      if (err) {
        ffLog('ERROR: Can not create folder: ' + saveDir);
        callback(false);
      } else {
        var spawn = require('child_process').spawn;
        ffLog('Downloading torrent to' + saveDir + '/' + episodeId + '.torrent');
        var wget = spawn('/usr/local/bin/wget', [
          link,
          '--output-document=' + saveDir + '/' + episodeId + '.torrent'
        ]);

        wget.stderr.on('data', function (data) {
          ffLog(data.toString());
        });

        wget.on('close', function (code) {
          callback(code);
        });
      }
    });
  };

  /**
   * Path to use home dir
   * @returns {string}
   */
  $instance.getUserHome = function() {
    var home = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
    return home + '/Library/Application Support/FoundFilm/';
  };

  /**
   * Converts entity-encoded string to decoded string (including hex-encoded)
   * @param string
   * @returns {string}
   */
  $instance.decode = function(string) {
    if (string !== null && typeof string != 'undefined') {
      return jQuery('<textarea>').html(string).text();
    } else {
      return '';
    }
  };

  /**
   * Cleanups string from tags and converts encoding
   * @param string
   * @returns {string}
   */
  $instance.plainString = function(string) {
    return this.decode(
      jQuery.trim(
        string
      ).stripTags()
    );
  };

  return $instance;
});


/**
 * Desktop notifications service
 * @return {{}}
 */
ffControllers.factory('$notification', function() {
  var $instance = {};

  $instance.show = function(title, message, delay) {
    var options = {
      //icon: "http://yourimage.jpg",
      body: message
    };

    var notification = new Notification(title, options);

    notification.onshow = function () {
      setTimeout(function() { notification.close(); }, delay ? delay : 5000);
    }
  };

  return $instance;
});

