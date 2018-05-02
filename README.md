# HomebrewJS

## Keywords:	Raspberry Pi, RPi, NodeJS, webserver, open source.

## A Flexible User Configurable NodeJS Web Server

**_By Dave Campbell_**

### Abstract

NodeJS implements server-side JavaScript and supports development of application specific web servers. This code implements a flexible user-configurable web server platform with a number of embellishments over the basic NodeJS examples. These embellishments include, a reverse proxy for handling multiple servers/services on a single IP address, features and services defined by a user-configurable JSON file, and adaptable application based on user specified handlers loaded at startup.

The document *A Flexible User Configurable NodeJS Web Server.docx* and example configuration files provide additional details.

### Changes

- Embellishments based on deployment of a fully functional shopping site
  - Upgraded database.js to data.js to also include get/post of files via recipes
  - added JSON to CSV module
  - Extended Notification to enable sending SMS/email messages from a webpage
- Fixed SafeJSON HTML routines
- Numerous bug fixes
  - A number of changes to WrapSQ3.find and WrapSQ3.store to improve robustness

### To Do

- Fix proxy/websocket interaction
- Build a demo site
- Update documentation
- Cleanup and post VueJS components
