/**
 * This script is a hub for message-passing - it routes messages from one script
 * to another. In doing so, it maintains connections with various scripts.
 */


/**
 * When we need a unique numeric ID in this script, we just increment this
 * integer and possibly convert it to a string.
 * @type {number}
 */
var nextUniqueId = 1;


/**
 * Maps a tab ID to a frame ID to a connection. The content scripts that these
 * ports connet to are all ready to receive messages.
 * @type {!Object.<string, !Object.<string, !Port>>}
 */
var frameConnections = {};


/**
 * Maps a string of the form "tab ID" to connection. The panel scripts that
 * these ports connect to are all ready to receive messages.
 * @type {!Object.<string, !Port>}
 */
var panelConnections = {};


/**
 * Determines if an object is empty.
 * @param {!Object} obj The object.
 * @return {boolean} Whether the object is empty.
 */
function isEmpty(obj) {
  return Object.keys(obj).length == 0;
}


/**
 * Handles what happens when the content script for a frame issues a message
 * indicating that it is ready to receive messages. We store a reference to the
 * port for that connection.
 * @param {!Port} port The port for the connection.
 */
function handleNewFrameListenersReady(port) {
  var tabId = port.sender.tab.id;
  if (!frameConnections[tabId]) {
    frameConnections[tabId] = {};
  }
  // Give this frame a unique ID. Store it on the port itself.
  port.frameId = nextUniqueId++;
  frameConnections[tabId][port.frameId] = port;
  port.onDisconnect.addListener(function() {
    // Remove the connection once the page is closed.
    delete frameConnections[tabId][port.frameId];
    if (isEmpty(frameConnections[tabId])) {
      // Connections for all frames from this tab have been closed.
      delete frameConnections[tabId];
    }
  });
}


/**
 * Handles a new connection made with the content script in a newly made frame.
 * The connection might not actually be able to receive messages yet.
 * @param {!Port} port The port for the connection.
 */
function handleNewFrameConnection(port) {
  // Listen to messages from the content script for the frame.
  var tabId = port.sender.tab.id;
  port.onMessage.addListener(function(message) {
    switch (message['type']) {
      case 'listeners_ready':
        handleNewFrameListenersReady(port);
        break;
    }
  });
}


/**
 * Handles what happens when the a dev panel script issues a message
 * indicating that it is ready to receive messages. We store a reference to the
 * port for that connection.
 * @param {!Port} port The port for the connection.
 */
function handleNewDevPanelListenersReady(port) {
  var tabId = port.sender.tab.id;
  panelConnections[tabId] = port;
  port.onDisconnect.addListener(function() {
    // Remove the connection once the page is closed.
    delete panelConnections[tabId];
  });
}


/**
 * Handles a new connection made with a dev panel script. The connection might
 * not actually be able to receive messages yet.
 * @param {!Port} port The port for the connection.
 */
function handleNewDevPanelConnection(port) {
  // Listen to messages from the dev panel that just opened up.
  var tabId = port.sender.tab.id;
  port.onMessage.addListener(function(message) {
    switch (message['type']) {
      case 'listeners_ready':
        handleNewDevPanelListenersReady(port);
        break;
    }
  });
}


// Handle connections to the background on case-by-case basis. A connection
// allows for future exchange of data.
chrome.runtime.onConnect.addListener(function(port) {
  var tab = port.sender.tab;
  if (!tab || !tab.id) {
    // We know not what tab this connection is coming from. It is degenerate.
    return;
  }

  // Each connection to the background script has a unique port name designating
  // what it generally is responsible for.
  var portName = port.name;

  switch (portName) {
    case 'init_frame':
      // A new frame has initialized in some tab.
      handleNewFrameConnection(port);
      break;
    case 'init_dev_panel':
      // A dev panel has opened for some tab.
      handleNewDevPanelConnection(port);
      break;
  }
});


// Listen to individual messages from scripts. A script might send an individual
// message without making a connection out of convenience (perhaps it does not
// need a 2-way connection).
chrome.runtime.onMessage.addListener(function(message, sender) {
  if (!sender.tab || !sender.tab.id)) {
    // The sender lacks a tab. Hmm, seems degenerate.
    return;
  }
  var tabId = sender.tab.id;
  switch(message['type']) {
    case 'page_changed':
      if (panelConnections[tabId]) {
        // Tell the panel that the top-level page for the tab has changed.
        panelConnections[tabId].postMessage(message);
      }
      break;
  }
});