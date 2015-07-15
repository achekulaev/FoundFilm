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

