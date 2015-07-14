var ffControllers = angular.module('ffControllers', []);

/**
 * Settings service
 * @return {{}}
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

ffControllers.factory('$menu', function() {
  return { 
    hideLoading: function() {
      jQuery('#loadingOverlay').hide();
    }
  };
});


ffControllers.controller('ffMenu', ['$scope', '$menu', '$settings', function($scope, $menu, $settings) {
  $scope.settingsData = $settings.data;
  $scope.appQuit = function() {
    gui.App.quit();
  }
}]);

/**
 * Series page Controller
 */
ffControllers.controller('ffTracker', ['$scope', '$filter', '$settings', '$location', '$agent', '$menu',
function ($scope, $filter, $settings, $location, $agent, $menu) {

  $scope.series = $settings.data.series;
  $scope._series = {}; //for storing unchanged copy
  $scope.changed = false;
  $scope.previewActive = false;
  $scope.previewId = -1;
  $scope.previewBase = 'http://www.lostfilm.tv/browse.php?cat={0}';

  /**
   * Opens preview pane
   * @param movieId
   */
  $scope.preview = function(movieId) {
    var previewFrame = jQuery('#previewFrame');
    if (movieId == $scope.previewId && $scope.previewActive) {
      $scope.previewActive = false;
      $scope.previewId = -1;
      previewFrame.animate({ height: '0' }, 150);
    } else {
      $scope.previewActive = true;
      $scope.previewId = movieId;
      previewFrame[0].src = $scope.previewBase.format(movieId);
      previewFrame.animate({ height: '50%' }, 150);
    }
  };

  /**
   * Sets changes status to show save/cancel buttons
   */
  $scope.setChanged = function() {
    $scope.changed = true;
    if (!$scope.$$phase) $scope.$apply();
  };

  /**
   * Revert changes to trackers
   */
  $scope.cancelChanges = function() {
    angular.copy($scope._series, $settings.data.series);
    $scope.changed = false;
    if (!$scope.$$phase) $scope.$apply();
  };

  $scope.saveSettings = function() {
    if ($scope.series) {
      $settings.data.series = $scope.series;
      $settings.save();
    }
    $scope.changed = false;
    $location.path("/updates");
  };

  //----------------- Runtime ---------------------//

  //Prevent new windows creation. Redirect iframe instead
  win.on('new-win-policy', function(frame, url, policy) {
    policy.ignore();
    jQuery('#previewFrame').attr('src', url);
  });

  //load series names from server and tracking statuses from local settings
  $agent.getSeries(function(series) {
    angular.forEach(series, function(movie, key) {
      if (!$scope.series[key]) {
        movie.isNew = true;
        $scope.series[key] = movie;
      }
//      else {
//        $scope.series[key].title = movie.title;
//      }
    });
    $menu.hideLoading();
    $scope.$apply();
    angular.copy($scope.series, $scope._series);
  });

}]);

/**
 * Updates controller (Main UI)
 */
ffControllers.controller('ffUpdates', ['$scope', '$settings', '$agent', '$q', '$location', '$timeout', '$rootScope', '$menu',
function($scope, $settings, $agent, $q, $location, $timeout, $rootScope, $menu) {

  $scope.series = $settings.data.series;
  $scope.config = $settings.config;
  $scope.childProcesses = {}; //just here to avoid IDE warning. childProcesses defined in node-init.js
  $scope.totalFileSize = 0;
  $scope.fetchingUpdates = false;
  $scope.cleanupRunning = false;

  /**
   * Checks if file exists and readable. Returns 1 or 0
   * @param path
   * @returns {number}
   */
  $scope.fileOK = function(path) {
    var result = 0;
    try {
      var fd = fs.openSync(path, 'r');
      result = fd ? 1 : 0;
      fs.closeSync(fd);
    } catch(e) {
      return 0;
    }
    return result;
  };

  /**
   * Async function to get updates
   * @param mIndex
   * @returns {promise}
   */
  $scope.getNewEpisodes = function(mIndex) {
    var deferred = $q.defer(),
        movie = $scope.series[mIndex];

    if (!Object.keys(childProcesses).length) { //if no aria's is running
      angular.forEach(movie.episodes, function(e) {
        //reset this status which means that aria2c has started
        e.ariaRunning = 0;
      });
    }

    movie.updatingDescription = 'Getting episodes list...';
    $agent.getEpisodes(movie.id, function(episodes) {
      if (episodes[0] && episodes[0].error) {
        ffLog('Failed to get new movies for ' + movie.id + ': ' + episodes[0].error.code);
        deferred.resolve();
        return;
      }
      //done updating this movie
      if (!movie.episodes) {
        movie.episodes = {};
      }

      movie.updatingDescription = 'Verifying existing files...';
      var mPath = $agent.getUserHome() + movie.id + '/';
      //Check torrentStatus at startup
      angular.forEach(episodes, function(episode, key) {
        if (!movie.episodes[key]) { // this episode is new
          //check if files existed before in case it's not really new but a re-addition of series that were tracked before
          episode.gotTorrentFile = $scope.fileOK(mPath + episode.id + '.torrent');
          episode.gotMovie = $scope.fileOK(mPath + episode.id + '.avi');
          movie.episodes[key] = episode;
        } else { // this episode is already in our list
          var e = movie.episodes[key];
          //check movie file exists
          if (e.gotMovie) {
            e.gotMovie = $scope.fileOK(mPath + episode.id + '.avi');
          } 
          //if no movie exists check if torrent file exists
          // else if (e.gotTorrentFile) {
          //   e.gotTorrentFile = $scope.fileOK(mPath + episode.id + '.torrent');
          // }
        }
      });

      //check if we need to mark whole movie as seen
      $scope.updateSeenStatus(mIndex);
      movie.updatingDescription = 'Done';
      movie.updatingStatus = 0;

      deferred.resolve();
    });

    return deferred.promise;
  };

  /**
   * Gets updates for all movies
   */
  $scope.getUpdates = function(forced) {
    var refreshDelayMsec = (60 * 60) * 1000; //1 hour
    if (!forced && $settings.config.lastUpdate && ((Date.now() - $settings.config.lastUpdate) < refreshDelayMsec)) {
      $timeout(function() {
        jQuery('[data-toggle="tooltip"]').tooltip();
        $menu.hideLoading();
      });
      return;
    }

    // get updates for all trackers then update UI
    var promises = [];
    $scope.fetchingUpdates = true;

    angular.forEach($scope.series, function(movie, key) {
      movie.updatingStatus = 1;
      movie.updatingDescription = 'Loading...';
      if (movie.status) {
        promises.push($scope.getNewEpisodes(key));
      }
    });

    $timeout(function() { //$timeout ensures that code will run after angular finishes it's UI job
      $menu.hideLoading();
    });

    $q.all(promises).then(function() {
      if (!$scope.$$phase) {
        $scope.$apply();
      }
      $settings.series = $scope.series;
      $settings.config.lastUpdate = Date.now();
      $scope.saveSettings();
      $scope.fetchingUpdates = false; // stop spinners
      $timeout(function() { //$timeout ensures that code will run after angular finishes it's UI job
        jQuery('[data-toggle="tooltip"]').tooltip();
        $menu.hideLoading();
      });
    });
  };

  /**
   * Download torrent for episode
   * @param movieIndex
   * @param episodeIndex
   */
  $scope.getTorrent = function(movieIndex, episodeIndex) {
    var movie = $scope.series[movieIndex],
        episode = movie.episodes[episodeIndex];

    episode.gettingTorrentFile = 1;
    episode.downloadingDescription = 'Downloading torrent file...';

    if (!$settings.data.cookie) {
      alert('You need to Log in first. You will be redirected.')
      $location.path('/login');
      return;
    }

    if (episode.gotTorrentFile) {
      $scope.getMovie(movieIndex, episodeIndex);
      return;
    }

    $agent.getTorrent(episode.link, $settings.data.cookie, function(torrentLinks, err) {
      if (err && err.msg) {
        alert(err.msg);
        return;
      }

      if (!torrentLinks.length) {
        alert('You need to Log in. You will be redirected.')
        $settings.data.cookie = false;
        $location.path('/login');
        return;
      }

      $agent.getTorrentFile(torrentLinks[0].href, movie.id, episode.id, function(result) {
        if (result === false) {
          alert('Download has failed. You may need to re-login.');
          episode.downloadingDescription = 'Error downloading torrent file!';
        }
        else {
          episode.gotTorrentFile = 1;
          $scope.getMovie(movieIndex, episodeIndex);
        }
        episode.gettingTorrentFile = 0;
        $scope.$apply();
      });
    });
  };

  /**
   * Open torrent in default client
   * @param movieIndex
   * @param episodeIndex
   */
  $scope.openTorrent = function(movieIndex, episodeIndex) {
    var movie = $scope.series[movieIndex],
        episode = movie.episodes[episodeIndex],
        file = $agent.getUserHome() + movie.id + '/' + episode.id + '.torrent';
    try {
      var fd = fs.openSync(file, 'r');
      if (fd) {
        open(file);
      }
      fs.closeSync(fd);
    } catch(e) {}
  };

  /**
   * Downloads actual movie using aria2c torrent client
   * @param movieIndex
   * @param episodeIndex
   */
  $scope.getMovie = function(movieIndex, episodeIndex) {
    var movie = $scope.series[movieIndex],
        episode = movie.episodes[episodeIndex];

    if (episode.gotMovie) {
      episode.downloadingDescription = 'Already downloaded';
      return;
    }
    episode.ariaRunning = 1;
    episode.ariaResumable = 1;
    episode.gotMovie = 0;
    $scope.series[movieIndex].episodes[episodeIndex].downloadingDescription = 'Starting download...';
    $rootScope.$broadcast('scopeApply');
    $rootScope.$broadcast('settings');

    // http://aria2.sourceforge.net/manual/en/html/aria2c.html
    var spawn = require('child_process').spawn,
        home = $agent.getUserHome();

    // childProcesses var is defined in node-init.js
    childProcesses[movieIndex + episodeIndex] = spawn(process.cwd() + '/bin/aria2c', [
      '--enable-color=false',
      '--summary-interval=1',
      '--allow-overwrite=true',
      '--index-out=1=' + episode.id + '.avi',
      '--dir=' + home + movie.id,
      '--check-integrity=true',
      '--continue=true',
      '--max-connection-per-server=5',
      '--seed-time=0',
      '--on-download-complete=exit',
      '' + home + movie.id + '/' + episode.id + '.torrent'
    ]);
    var aria2c = childProcesses[movieIndex + episodeIndex];

    aria2c.stdout.on('data', function (data) {
      var out = data.toString(), matches;
      ffLog(out);

      //Checking checksum
      if (out.match('Checksum')) {
        matches = out.match(/\[#\w{6}\s([^\s]+).*Checksum[^\s]+\s(.*)\]/);
        var progress = (matches && matches[2]) ? matches[2] : '';
        $settings.data.series[movieIndex].episodes[episodeIndex].downloadingDescription = 'Verifying file {0}'.format(progress);
        $rootScope.$broadcast('scopeApply');
      }
      //Download finished
      else if (out.match('SEED')) {
        $settings.data.series[movieIndex].episodes[episodeIndex].downloadingDescription = 'Finishing download...';
      }
      //Download in progress
      else {
        matches = out.match(/\[#\w{6}\s([^\s]+)/);
        if (matches && matches.length > 1) {
          $settings.data.series[movieIndex].episodes[episodeIndex].downloadingDescription = 'Downloading {0}'.format(matches[1]);
        } else {
          $settings.data.series[movieIndex].episodes[episodeIndex].downloadingDescription = 'Starting download...';
        }
        $rootScope.$broadcast('scopeApply');
      }
    });

    aria2c.stderr.on('data', function (data) {
      ffLog(data.toString());
    });

    aria2c.on('close', function (code) {
      episode.ariaRunning = 0;
      if (code == 0) {
        episode.gotMovie = 1;
        episode.ariaResumable = 0;
      } else {
        ffLog('ERROR during torrent download of ' + episode.title);
      }
      delete childProcesses[movieIndex + episodeIndex];
      $settings.data.series[movieIndex].episodes[episodeIndex].fileSize = fs.statSync(home + movie.id + '/' + episode.id + '.avi').size;
      $scope.totalFileSize = $scope.updateFileSizes();
      $rootScope.$broadcast('scopeApply');
      $rootScope.$broadcast('settings');
      ffLog('Aria for ' + movieIndex + ':' + episodeIndex +' exited with code ' + code);
    });
  };

  /**
   * Launches media player
   * @param movieIndex
   * @param episodeIndex
   */
  $scope.playMovie = function(movieIndex, episodeIndex) {
    var movie = $scope.series[movieIndex],
      episode = movie.episodes[episodeIndex],
      file = $agent.getUserHome() + movie.id + '/' + episode.id + '.avi';
    try {
      var fd = fs.openSync(file, 'r');
      if (fd) {
        open(file);
      }
      fs.closeSync(fd);
    } catch(e) {
      ffLog('ERROR playing movie. Can not open file ' + file);
    }
  };


  /**
   * Delete downloaded episode video file
   * @param  {int} mIndex Movie index
   * @param  {int} eIndex Episode index
   * @return {null}
   */
  $scope.fileDelete = function(mIndex, eIndex) {
    var movie = $scope.series[mIndex],
      episode = movie.episodes[eIndex], 
      path = $agent.getUserHome() + movie.id + '/' + episode.id + '.avi';

    fs.unlink(path, function(err) {
      if (err) {
        alert("Can not delete \"" + path + "\". " + err);
      }
      $settings.data.series[mIndex].episodes[eIndex].gotMovie = 0;
      $settings.data.series[mIndex].episodes[eIndex].fileSize = 0;
      $rootScope.$broadcast('filesUpdate');
      $rootScope.$broadcast('settings');
    });
  };

  $scope.fileDeleteConfirm = function(mIndex, eIndex) {
    if (confirm('Delete this file?')) {
      $scope.fileDelete(mIndex, eIndex);
    }
  };

  $scope.fileCleanup = function() {
    $scope.cleanupRunning = true;
    // $timeouts to ensure UI get's updated not just stuck
    $timeout(function() {
      angular.forEach($settings.data.series, function (movie, mIndex) {
        if (movie.episodes) {
          angular.forEach(movie.episodes, function (episode, eIndex) {
            if (episode.gotMovie && episode.seen) {
              $scope.fileDelete(mIndex, eIndex);
            }
          })
        }
      });
      $timeout(function() {
        $scope.cleanupRunning = false;
      });
    });
  };

  /**
   * Fully resets saved settings
   */
  $scope.resetSettings = function() {
    if (confirm('Reset will erase saved series and login data. Downloaded files will NOT be deleted. Continue?')) {
      $settings.reset();
      gui.App.quit();
    }
  };

  $scope.updateFileSizes = function() {
    var home = $agent.getUserHome(), total = 0;

    angular.forEach($settings.data.series, function(movie) {
      if (movie.episodes) {
        angular.forEach(movie.episodes, function(episode) {
          if (episode.gotMovie) {
            var size = fs.statSync(home + movie.id + '/' + episode.id + '.avi').size;
            total += size;
            episode.fileSize = size;
          }
        })
      }
    });

    return total;
  };

  /**
   * Sets seen/unseen status on movie and counts unseen episodes
   * @param mIndex
   */
  $scope.updateSeenStatus = function(mIndex) {
    var movie = $scope.series[mIndex],
      mSeen = true;
    movie.unseenCount = 0;

    angular.forEach(movie.episodes, function(e) {
      if (!e.seen) { //if single episode is not seen then whole movie has "not seen" status
        mSeen = false;
        movie.unseenCount++;
      }
    });

    movie.seen = mSeen;
    if (!$scope.$$phase) {
      $scope.$apply();
    }
    $scope.saveSettings();
  };

  /**
   * Marks all episodes and movie as seen
   * @param mIndex
   */
  $scope.markMovieSeen = function(mIndex) {
    var movie = $scope.series[mIndex];
    angular.forEach(movie.episodes, function(e) {
      e.seen = true;
    });
    movie.seen = true;
    movie.showSeen = true; // unhide seen episodes
    if (!$scope.$$phase) {
      $scope.$apply();
    }
    $scope.saveSettings();
  };

  /**
   * Saves settings
   */
  $scope.saveSettings = function() {
    if ($scope.series && $scope.series.length) {
      $settings.data.series = $scope.series;
    }

    if ($scope.config && $scope.config.length) {
      angular.forEach($scope.config, function(value, key) {
        $settings.config[key] = value;
      });
    }
    $settings.save();
  };

  $scope.$on('settings', function(e) {
    $scope.saveSettings();
  });

  $scope.$on('filesUpdate', function(e) {
    $scope.totalFileSize = $scope.updateFileSizes();
    $timeout(function() {
      $scope.$apply();
    });
  });

  $scope.$on('scopeApply', function(e) {
    if (!$scope.$$phase) {
      $scope.$apply();
    }
  });

  /**
   * Hacker function to delete episode from saved data array
   * @param mIndex
   * @param eIndex
   */
  $scope.episodeDelete = function(mIndex, eIndex) {
    delete $scope.series[mIndex].episodes[eIndex];
    $scope.saveSettings();
  };

  //--------------------- Runtime --------------------------//

  if (!Object.keys($scope.series).length) {
    console.log('No series to track!');
    $location.path('/tracker'); // redirect to tracker for user to select series
  } else {
    $timeout(function() {
      $scope.getUpdates();
      $scope.totalFileSize = $scope.updateFileSizes();
    });
  }

}]);

/**
 * Login page controller
 * @param  {[type]} $scope     [description]
 * @param  {[type]} $settings  [description]
 * @param  {[type]} $agent     [description]
 * @param  {[type]} $q         [description]
 * @param  {[type]} $location  [description]
 * @param  {[type]} $interval) {             $scope.interval [description]
 * @param  {[type]} 1000       [description]
 * @return {[type]}            [description]
 */
ffControllers.controller('ffLogin', ['$scope', '$settings', '$agent', '$q', '$location', '$interval', '$timeout',
function($scope, $settings, $agent, $q, $location, $interval, $timeout) {

  $scope.interval = null;

  $scope.getCookie = function() {
    var lfCookie = cookie.parse(document.getElementById('loginFrame').contentWindow.document.cookie);
    if (lfCookie.uid && lfCookie.uid.length && lfCookie.pass && lfCookie.pass.length) {
      $settings.data.cookie = lfCookie;
      $settings.save();
      $location.path('/updates');
    }
  };

  $scope.goHome = function() {
    jQuery('#loginFrame').attr('src', 'http://lostfilm.tv');
  };

  //--------------------- Runtime --------------------------//

  jQuery('[data-toggle="tooltip"]').tooltip();

  interval = $interval(function() {
    //$scope.getCookie();
  }, 1000);

  $scope.$on('$destroy', function() {
    $interval.cancel(interval);
  });

  //Prevent new windows creation. Redirect iframe instead
  win.on('new-win-policy', function(frame, url, policy) {
    policy.ignore();
    jQuery('#loginFrame').attr('src', url);
  });

  $timeout(function() {
    jQuery('#loadingOverlay').hide();
  });

}]);