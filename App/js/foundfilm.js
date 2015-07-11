/**
 * FoundFilm HTTP Agent
 * @constructor
 */
var Agent = function() {
  this.options = {
    url:                'http://lostfilm.tv/browse.php',
    method:             'GET',
    headers: {
      'User-Agent':     'Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2049.0 Safari/537.36',
      'Content-Type':   'Content-Type:text/html'
    },
    encoding:           'CP1251',
    qs: { // query string, ex.:
          // 'cat' : '101'
    }
  };

  /**
   * Gets object of objects of series
   * @param callback
   */
  this.getSeries = function(callback) {
    var options = {};
    angular.copy(this.options, options);
    options.url = 'http://www.lostfilm.tv/serials.php';
    options.qs = {};

    request(options, function(error, response, body) {
      if (!error && response.statusCode == 200) {
        var parser = new Parser();
        callback(parser.parseSeries(body));
      }
    });
  };

  /**
   * Gets object of objects of episodes
   * @param seriesId
   * @param callback
   */
  this.getEpisodes = function(seriesId, callback) {
    var options = {};
    angular.copy(this.options, options);
    options.qs.cat = seriesId;

    request(options, function(error, response, body) {
      if (!error && response.statusCode == 200) {
        var parser = new Parser();
        callback(parser.parseEpisodes(body));
      } else {
        var result = [{ error : '' }];
        if (error) {
          console.log(error);
          result[0].error += 'Error contacting lostfilm.tv: ' + error.message;
        }
        else if (response && response.statusCode) {
          result[0].error +=  'Error contacting lostfilm.tv: ' + response.statusCode;
        }
        callback(result);
      }
    });
  };

  /**
   * Returns object with links to torrent files for episodes
   * @param nrdrUrl
   * @param callback
   */
  this.getTorrent = function(nrdrUrl, cookies, callback) {
    var options = {};
    angular.copy(this.options, options);
    options.url = nrdrUrl;

    var j = request.jar();

    angular.forEach(cookies, function(value, key) {
      j.setCookie(key + '=' + value + '; Domain=.lostfilm.tv', 'http://www.lostfilm.tv/', {}, function() {});
    });

    options.jar = j;

    request(options, function(error, response, body) {
      if (!error && response.statusCode == 200) {
        var parser = new Parser();
        var links = parser.parseTorrent(body);
        // TODO: parser should report if login was fine but it could not parse
        callback(links);
      } else {
        ffLog(error);
        callback([], { msg: error });
      }
    });
  };

  /**
   * Downloads torrent files by link
   * @param link
   * @param movieId
   * @param episodeId
   * @param callback
   */
  this.getTorrentFile = function(link, movieId, episodeId, callback) {
    //link = 'http://tracktor.in/td.php?s=...hash goes here no cookies needed....';

    if (!movieId || !episodeId) {
      callback(false);
      return;
    }

    var saveDir = this.getUserHome() + movieId;
    mkdirp(saveDir, function(err) { //try creating dir
      if (err) {
        ffLog('ERROR: Can not create folder: ' + saveDir);
        callback(false);
      } else {
        var writer = request(link,
          function(error, response) {
            if (response.statusCode != '200') {
              ffLog('ERROR: Can not download ' + link);
              ffLog('Status' + response.statusCode);
            }
          })
          .pipe(fs.createWriteStream(saveDir + '/' + episodeId + '.torrent'));

        if (writer) {
          writer.on('finish', function() {
            callback(true);
          });
        } else {
          callback(false);
        }
      }
    });
  };

  /**
   * Path to use home dir
   * @returns {string}
   */
  this.getUserHome = function() {
    var home = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
    return home + '/Library/Application Support/FoundFilm/';
  };

};

var Parser = function() {

  this.ERROR_SERIES = 'ERROR. Could not parse series: ';
  this.ERROR_SERIES_EPISODE = 'ERROR: No episodes found';
  this.ERROR_SERIES_LINK = 'ERROR: Download link can not be parsed.';
  this.ERROR_TORRENT = 'ERROR: Could not parse torrent links';


  /**
   * Finds direct torrent links on a download torrent page
   * @param html
   * @returns {[]}
   */
  this.parseTorrent = function(html) {
    var tokens = {
      allTorrents: 'div > div > div > table tr > td > a'
    };

    //return value
    var links = [];
    //cheerio object
    var $ = cheerio.load(html);
    //self link
    var parser = this;

    var _links = $(tokens.allTorrents);

    if (!_links.length) {
      ffLog(this.ERROR_TORRENT);
      return [];
    }

    $(_links).each(function() {
      links.push({
        href: $(this).attr('href'),
        name: parser.decode($(this).text())
      });
    });

    return links;
  };

  /**
   * Return array of series
   * @param html
   * @returns {{}}
   */
  this.parseSeries = function(html) {
    //return value
    var series = {};
    //cheerio object
    var $ = cheerio.load(html);
    //self link
    var _this = this;
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

    return series;
  };

  /**
   * Finds season titles and episode titles and links on series page
   * @param html
   * @returns {{}}
   */
  this.parseEpisodes = function(html) {

    //return value
    var episodes = {};
    //cheerio object
    var $ = cheerio.load(html);
    //self link
    var _this = this;

    //array of selectors
    var tokens = {
      episodeRow:       'div.t_row',
      // episode title
      episodeTitle:     '.t_episode_title > div > div > nobr',
      //download link
      download:         'a.a_download',
      //download regexp
      downloadRegex:  /ShowAllReleases\('(\d+)',\s?'(\d+)',\s?'([^']+)'.*/
    };

    var episodesDom = $(tokens.episodeRow);
    if (!episodesDom.length) {
      ffLog(this.ERROR_SERIES + this.ERROR_SERIES_EPISODE + ' ' + this.plainString($('title').html()));
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

    return episodes;
  };

  /**
   * Converts entity-encoded string to decoded string (including hex-encoded)
   * @param string
   * @returns {string}
   */
  this.decode = function(string) {
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
  this.plainString = function(string) {
    return this.decode(
      jQuery.trim(
        string
      ).stripTags()
    );
  };

};
