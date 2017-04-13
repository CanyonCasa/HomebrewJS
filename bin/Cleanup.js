// Extension to process object for graceful app specific cleanup...

process.cleanup = {
  // define a default app cleanup reference to be overridden by app...
  app: function() { console.log('Cleanup noOp...'); },
  // flag to prevent circular calls.
  called: false,
  // define a function to call for graceful exiting...
  delay: 400,  
  gracefulExit: function (code) {
    if (!process.cleanup.called) {
      process.cleanup.called = true;
      console.log("Graceful exit cleanup...");
      process.cleanup.app();   // do app specific cleaning once before exiting
      code = (code!==undefined) ? code : 1;
      setTimeout(function() {process.exit(code);},process.cleanup.delay);  // no stopping!
      };
    }
  };

// clean exit test...
process.on('beforeExit',
  function () {
    process.cleanup.gracefulExit(0);
    }
  );

// catch ctrl+c event and exit gracefully
process.on('SIGINT', 
  function () {
    console.log('CTRL+C...');
    process.cleanup.gracefulExit(2);
    }
  );

//catch uncaught exceptions, trace, then exit gracefully...
process.on('uncaughtException', 
  function(e) {
    console.log('Uncaught Exception...');
    console.log(e.stack);
    process.cleanup.gracefulExit(99);
    }
  );
