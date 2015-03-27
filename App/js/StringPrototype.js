String.prototype.stripTags = function () {
  return this.replace(/(<([^>]+)>)/ig, "");
};

/**
 * sprintf-like functionality
 * replaces {0}, {1}... in a string with arguments passed to a function
 */
if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) {
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
        ;
    });
  };
}
