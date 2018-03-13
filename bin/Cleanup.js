// Handles graceful application specific cleanup to avoid hung servers...

var cleanup = {
  // define a default callback reference to be overridden by application...
  callback: null,
  // flag to prevent circular calls.
  called: false,
  // define a function to call for graceful exiting...
  delay: 400,  
  gracefulExit: function (code) {
    if (!this.called) {
      this.called = true;
      console.log("Graceful exit cleanup...");
      if (this.callback) this.callback();   // do app specific cleaning once before exiting
      code = (code!==undefined) ? code : 1; // assume non-zero (i.e. error) if not explicit
      setTimeout(function() {process.exit(code);},this.delay);  // no stopping!
      };
    }
  };

// clean exit test...
process.on('beforeExit',
  function () {
    cleanup.gracefulExit(0);
    }
  );

// catch ctrl+c event and exit gracefully
process.on('SIGINT', 
  function () {
    cleanup.gracefulExit(2);
    }
  );

//catch uncaught exceptions, trace, then exit gracefully...
process.on('uncaughtException', 
  function(e) {
    console.log('Uncaught Exception...');
    console.log(e.stack);
    cleanup.gracefulExit(99);
    }
  );


module.exports = init = function init(cb=null) {
  cleanup.callback = cb;
  return cleanup;
  };
