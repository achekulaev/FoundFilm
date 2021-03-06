var refreshDelay = (60 * 60) * 1000; //1 hour

/**
 * Main menu controller
 */
ffControllers.controller('ffMenu', ['$scope', '$settings', '$location', function($scope, $settings, $location) {
  $scope.settingsData = $settings.data;
  $scope.maximized = false;
  $scope.isLoading = true;
  $scope.showLog = false;

  $scope.hideLoader = function() {
    $scope.isLoading = false;
  };

  /**
   * Return true if path is current
   * @param path
   */
  $scope.isCurrent = function(path) {
    return $location.path() == path;
  };

  $scope.closeWindow = function() {
    win.hide();
    gui.App.quit();
  };

  $scope.zoomWindow = function() {
    win.maximize();
  };

  $scope.minimizeWindow = function() {
    win.minimize();
  };

  $scope.isLoggedOut = function() {
    return isEmpty($scope.settingsData.cookie);
  };

  ////////////////////////// ffMenu Runtime \\\\\\\\\\\\\\\\\\\\\\\\\
  $scope.$on('hideLoader', function() { $scope.hideLoader(); });
  $scope.$on('quitApplication', function() { $scope.closeWindow(); });

}]);

/**
 * Series page Controller
 */
ffControllers.controller('ffTracker', ['$scope', '$filter', '$settings', '$location', '$lfAgent', '$rootScope',
function ($scope, $filter, $settings, $location, $lfAgent, $rootScope) {

  $scope.series = angular.copy($settings.data.series);
  $scope.newCount = 0;
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

  $scope.countNew = function() {
    angular.forEach($scope.series, function(movie) {
      if (movie.isNew) {
        $scope.newCount++;
      }
    });
  };

  $scope.markSeen = function(movie) {
    movie.isNew=false;
    $scope.newCount--;
    $scope.setChanged();
  };

  $scope.markAllSeen = function() {
    angular.forEach($scope.series, function(movie) {
      movie.isNew = false;
    });
    $scope.newCount = 0;
    $scope.setChanged();
  };

  /**
   * Revert changes to trackers
   */
  $scope.cancelChanges = function() {
    $scope.series = angular.copy($settings.data.series);
    $scope.countNew();
    $scope.changed = false;
    if (!$scope.$$phase) $scope.$apply();
  };

  $scope.saveSettings = function() {
    if ($scope.series) {
      $settings.data.series = $scope.series;

      angular.forEach($scope.series, function(movie, key) {
        if (movie.status && $settings.data.series[key] && movie.status != $settings.data.series[key].status) {
          $settings.data.series[key].status = movie.status;
          $settings.data.series[key].isFinished = false; // re-adding series will force isFinished check
          $settings.config.lastUpdate = 0; // force update
        }
      });

      $settings.save();
    }
    $scope.changed = false;
    $location.path("/updates");
  };

  ////////////////////////   ffTracker Runtime   \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\

  //Prevent new windows creation. Redirect iframe instead
  win.on('new-win-policy', function(frame, url, policy) {
    policy.ignore();
    jQuery('#previewFrame').attr('src', url);
  });

  //load series names from server when needed
  if (Object.keys($scope.series).length == 0 || isEmpty($settings.config.lastUpdate) || ((Date.now() - $settings.config.lastUpdate) > refreshDelay)) {
    $lfAgent.getSeries(function(series) {
      angular.forEach(series, function(movie, key) {
        if (!$scope.series[key]) { // new series
          movie.isNew = true;
          $scope.series[key] = movie;
          $scope.newCount++;
        }
        else {
          if ($scope.series[key].title != movie.title) {
            $scope.series[key].title = movie.title;
          }
        }
      });
      $rootScope.$broadcast('hideLoader');
      if (!$scope.$$phase) $scope.$apply();
    });
  } else {
    $scope.countNew();
    $rootScope.$broadcast('hideLoader');
    if (!$scope.$$phase) $scope.$apply();
  }


}]);

/**
 * Updates controller (Main UI)
 */
ffControllers.controller('ffUpdates', ['$scope', '$settings', '$lfAgent', '$q', '$location', '$timeout', '$rootScope', '$notification',
function($scope, $settings, $lfAgent, $q, $location, $timeout, $rootScope, $notification) {

  $scope.series = $settings.data.series;
  $scope.config = $settings.config;
  $scope.childProcesses = {}; //just here to avoid IDE warning. childProcesses defined in node-init.js
  $scope.totalFileSize = 0;
  $scope.fetchingUpdates = false;
  $scope.cleanupRunning = false;

  //Prevent new windows creation. Redirect iframe instead
  win.on('new-win-policy', function(frame, url, policy) {
    policy.ignore();
    jQuery('#lf').attr('src', url);
  });

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
    $lfAgent.getEpisodes(movie.id, function(episodes, isFinished) {
      if (episodes[0] && episodes[0].error) {
        ffLog('Failed to get new movies for ' + movie.id + ': ' + episodes[0].error);
        movie.updatingDescription = 'Done';
        movie.updatingStatus = 0;
        deferred.resolve();
        return;
      }

      if (!movie.episodes) {
        movie.episodes = {}; // init object
      }

      if (isFinished) {
        movie.isFinished = true;
      }

      movie.updatingDescription = 'Verifying existing files...';
      var mPath = $lfAgent.getUserHome() + movie.id + '/';
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
   * Gets updates for all tracked movies if checked > than 1hour ago
   */
  $scope.getUpdates = function(forced) {
    if (!forced || (!isEmpty($settings.config.lastUpdate) && ((Date.now() - $settings.config.lastUpdate) < refreshDelay))) {
      $timeout(function() {
        jQuery('[data-toggle="tooltip"]').tooltip();
        $rootScope.$broadcast('hideLoader');
      });
      return;
    }

    // get updates for all trackers then update UI
    var promises = [];
    $scope.fetchingUpdates = true;

    angular.forEach($scope.series, function(movie, key) {
      if (movie.isFinished) return;
      movie.updatingStatus = 1;
      movie.updatingDescription = 'Loading...';
      if (movie.status) {
        promises.push($scope.getNewEpisodes(key));
      }
    });

    $timeout(function() { //$timeout ensures that code will run after angular finishes it's UI job
      $rootScope.$broadcast('hideLoader');
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
        $rootScope.$broadcast('hideLoader');
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
      alert('You need to Log in first. You will be redirected.');
      $location.path('/login');
      return;
    }

    if (episode.gotTorrentFile) {
      $scope.getMovie(movieIndex, episodeIndex);
      return;
    }

    $lfAgent.getTorrent(episode.link, function(torrentLinks, err) {
      if (err && err.msg) {
        alert(err.msg);
        episode.gettingTorrentFile = 0;
        return;
      }

      if (!torrentLinks.length) {
        alert('Could not get links. Something went wrong. Most likely you have to re-login');
        episode.gettingTorrentFile = 0;
        return;
      }

      $lfAgent.getTorrentFile(torrentLinks[0].href, movie.id, episode.id, function(code){
        if (code == 0) {
          episode.gotTorrentFile = 1;
          $scope.getMovie(movieIndex, episodeIndex);
        } else {
          alert('Torrent file download has failed. See log for details');
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
        file = $lfAgent.getUserHome() + movie.id + '/' + episode.id + '.torrent';
    try {
      var fd = fs.openSync(file, 'r');
      if (fd) {
        open(file);
      }
      fs.closeSync(fd);
    } catch(e) {}
  };

  $scope.openFolder = function(movieIndex) {
    var movie = $scope.series[movieIndex];
    open($lfAgent.getUserHome() + movie.id);
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
        home = $lfAgent.getUserHome();

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
        $notification.show('Download finished', '({0}.{1}) {2}'.format(episode.season, episode.number, episode.title));
      } else {
        ffLog('ERROR during torrent download of ' + episode.title);
      }
      delete childProcesses[movieIndex + episodeIndex];
      $settings.data.series[movieIndex].episodes[episodeIndex].fileSize = fs.statSync(home + movie.id + '/' + episode.id + '.avi').size;
      $scope.updateFileSizes()
        .then((total) => { $scope.totalFileSize = total });
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
      file = $lfAgent.getUserHome() + movie.id + '/' + episode.id + '.avi';
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
      path = $lfAgent.getUserHome() + movie.id + '/' + episode.id + '.avi';

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
      $rootScope.$broadcast('quitApplication');
    }
  };

  $scope.updateFileSizes = function() {
    var home = $lfAgent.getUserHome(), total = 0;
    return new Promise(function(resolve, reject) {
      var fstats = [];
      angular.forEach($settings.data.series, function(movie) {
        if (! movie.episodes) return;
        angular.forEach(movie.episodes, function(episode) {
          if (! episode.gotMovie) return;
          var fstat = fs.statAsync(home + movie.id + '/' + episode.id + '.avi').
            then(function(stats) {
              console.log(stats.size);
              total += stats.size;
              episode.fileSize = size;
            }).
            catch(function(error) {
              //console.warn(error.message)
            });
          fstats.push(fstat);
        });
      });
      Promise.all(fstats).finally(function() { resolve(total) });
    });
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
    $scope.updateFileSizes()
      .then((total) => {
        $scope.totalFileSize = total;
        $timeout(function() { $scope.$apply(); });
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
    $location.path('/tracker'); // redirect to tracker for user to select series
  } else {
    $timeout(function() {
      $scope.getUpdates();
      $scope.updateFileSizes()
        .then((total) => { $scope.totalFileSize = total; });
    });
  }

}]);

/**
 * Login page controller
 * @param  {[type]} $scope     [description]
 * @param  {[type]} $settings  [description]
 * @param  {[type]} $q         [description]
 * @param  {[type]} $location  [description]
 * @param  {[type]} $interval) {             $scope.interval [description]
 * @param  {[type]} 1000       [description]
 * @return {[type]}            [description]
 */
ffControllers.controller('ffLogin', ['$scope', '$settings', '$q', '$location', '$interval', '$timeout', '$rootScope',
function($scope, $settings, $q, $location, $interval, $timeout, $rootScope) {

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
    $rootScope.$broadcast('hideLoader');
  });

}]);