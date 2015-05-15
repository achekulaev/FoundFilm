var ffApp = angular.module('foundFilm', [
  'ngRoute',
  'ffControllers'
]);

ffApp.config(['$routeProvider',
  function($routeProvider) {
    $routeProvider.
      when('/tracker', {
        templateUrl: 'app/partials/tracker.html',
        controller: 'ffTracker'
      }).
      when('/updates', {
        templateUrl: 'app/partials/updates.html',
        controller: 'ffUpdates'
      }).
      when('/login', {
        templateUrl: 'app/partials/login.html',
        controller: 'ffLogin'
      }).
      otherwise({
        redirectTo: '/updates'
      });
}]);
