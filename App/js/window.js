(function($){
  var $dragging = null;
  var clientX = 0;
  var clientY = 0;

  $(document).on("mousemove", function(e) {
    if ($dragging) {
      win.moveBy(e.clientX-clientX, e.clientY-clientY);
    }
  });

  $(document).on('mousedown', '#window-toolbar',function(e) {
    clientX = e.clientX;
    clientY = e.clientY;
    $dragging = true;
  });

  $(document).on("mouseup", function(e) {
    $dragging = null;
  });

  $(window).on('blur', function() {
    $dragging = null;
  });
})(jQuery);
