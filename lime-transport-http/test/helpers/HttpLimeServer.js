'use strict';

var http = require('http');
var express = require('express');
var bodyParser = require('body-parser');
var Promise = require('bluebird');
var Lime = require('lime-js');
var TestEnvelopes = require('./TestEnvelopes');

var HttpLimeServer = function() {
    this._app = express();
    this._server = http.createServer(this._app);
    this._nodes = {};

    this.listen = Promise.promisify(this._server.listen, { context: this._server });
    this.close = Promise.promisify(this._server.close, { context: this._server });

    var self = this;
    this._app.use(bodyParser.json());
    this._app.use(function(request, response, next) {
        var from = request.headers.authorization;
        if (!self._nodes[from])
            self._nodes[from] = { messages: [], notifications: [] };
        next();
    });

    this._app.get('/messages/inbox', this._sendQueuedEnvelopes.bind(this, 'messages'));
    this._app.post('/messages', this._onMessage.bind(this));

    this._app.get('/notifications/inbox', this._sendQueuedEnvelopes.bind(this, 'notifications'));
    this._app.post('/notifications', this._onNotification.bind(this));

    this._app.post('/commands', this._onCommand.bind(this));
};

HttpLimeServer.prototype.broadcast = function(envelope) {
    for (var from in this._nodes) {
        this._queueEnvelope(from, envelope);
    }
};

HttpLimeServer.prototype._sendQueuedEnvelopes = function(type, request, response) {
    var from = request.headers.authorization;
    response.json(this._nodes[from][type]);
    response.end();
    this._nodes[from][type] = [];
};

HttpLimeServer.prototype._onMessage = function(request, response) {
    var envelope = request.body;
    switch(envelope.content) {
    case 'ping':
        this._queueEnvelope(request.headers.authorization, TestEnvelopes.Messages.pong);
        break;
    }
    response.end();
};

HttpLimeServer.prototype._onNotification = function(request, response) {
    var envelope = request.body;
    switch(envelope.event) {
    case 'ping':
        this._queueEnvelope(request.headers.authorization, TestEnvelopes.Notifications.pong);
        break;
    }
    response.end();
};

HttpLimeServer.prototype._onCommand = function(request, response) {
    var envelope = request.body;
    switch(envelope.uri) {
    case '/ping':
        response.json(TestEnvelopes.Commands.pingResponse(envelope));
        response.end();
        break;
    }
};

HttpLimeServer.prototype._queueEnvelope = function(from, envelope) {
    if (Lime.Envelope.isMessage(envelope))
        this._nodes[from].messages.push(envelope);
    else if (Lime.Envelope.isNotification(envelope))
        this._nodes[from].notifications.push(envelope);
    else
        throw new Error('Can\'t queue envelope ' + envelope);
};

module.exports = HttpLimeServer;
