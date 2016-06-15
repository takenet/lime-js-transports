'use strict';

var WebSocketServer = require('websocket').server;
var http = require('http');
var Promise = require('bluebird');
var Lime = require('lime-js');
var TestEnvelopes = require('./TestEnvelopes');

var WebSocketLimeServer = function() {
    this._httpServer = http.createServer();
    this._server = new WebSocketServer({
        httpServer: this._httpServer,
        autoAcceptConnections: false
    });
    this._connections = [];

    this._server.on('request', this._onConnection.bind(this));

    this.listen = Promise.promisify(this._httpServer.listen, {context: this._httpServer});
    this.close = Promise.promisify(this._httpServer.close, {context: this._httpServer});
};
WebSocketLimeServer.prototype.broadcast = function(envelope) {
    this._connections = this._connections.filter(function(socket) {
        if(!socket.remoteAddress) {
            return false;
        }
        socket.sendJSON(envelope);
        return true;
    });
};
WebSocketLimeServer.prototype._onConnection = function(request) {
    var socket = request.accept('lime', request.origin);

    socket.sendJSON = function(json) {
        socket.sendUTF(JSON.stringify(json));
    };

    this._connections.push(socket);

    socket.on('message', function(data) {
        var envelope = JSON.parse(data.utf8Data);

        // Session
        if (Lime.Envelope.isSession(envelope)) {
            switch(envelope.state) {
                case 'new':
                socket.sendJSON(TestEnvelopes.Sessions.authenticating);
                break;
                case 'authenticating':
                socket.sendJSON(TestEnvelopes.Sessions.established);
            }
        }
        // Command
        else if (Lime.Envelope.isCommand(envelope)) {
            switch(envelope.uri) {
                case '/ping':
                socket.sendJSON(TestEnvelopes.Commands.pingResponse(envelope));
                break;
            }
        }
        // Message
        else if (Lime.Envelope.isMessage(envelope)) {
            switch(envelope.content) {
                case 'ping':
                socket.sendJSON(TestEnvelopes.Messages.pong);
                break;
            }
        }
        // Notification
        else if (Lime.Envelope.isNotification(envelope)) {
            switch(envelope.event) {
                case 'ping':
                socket.sendJSON(TestEnvelopes.Notifications.pong);
                break;
            }
        }
    });
};

module.exports = WebSocketLimeServer;
