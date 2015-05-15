ffApp.filter('keyedOrderBy', function() {
  /**
   * Orders object of objects by field saving keys binding
   * @param  {{}} items                Incoming object
   * @param  {string} field            Field name
   * @param  {bool} stringComparator   Compare values as strings: "10" < "2" (if not set compares as integers: 10 > 2)
   * @param  {bool} reverse            Reverse order
   * @return {{}}
   */
  return function(items, field, stringComparator, reverse) {
    var filtered = [], result = {};
    //convert object of objects to array of objects
    angular.forEach(items, function(item, key) {
      item.__PRESORT_ITEM_KEY = key; //preserve keys inside items
      filtered.push(item);
    });
    //sort
    filtered.sort(function(a, b) {
      if (stringComparator) {
        return (a[field] > b[field] ? 1 : -1);
      } else {
        return (parseInt(a[field]) > parseInt(b[field]) ? 1 : -1);
      }
    });
    //reverse if needed
    if (reverse) filtered.reverse();
    //restore object of objects from array of objects
    filtered.forEach(function(item) {
      var key = item.__PRESORT_ITEM_KEY;
      delete item.__PRESORT_ITEM_KEY;  //no longer needed
      result[key] = item; //restore original key binding
    });
    return result;
  };
});

ffApp.filter('fileSize', function() {
  return function (sizeInBytes) {
    var mb = 1024*1024,
        gb = mb*1024;
    if (sizeInBytes < gb) {
      return Math.round(sizeInBytes/mb) + 'MB';
    } else {
      return Math.round((sizeInBytes/gb)*100)/100 + 'GB';
    }
  }
});
