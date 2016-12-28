'use strict';

var http = require('http');
var Promise = require('bluebird');
var Lime = require('lime-js');
var TestEnvelopes = require('./TestEnvelopes');

var HttpLimeServer = function() {
    this._httpServer = http.createServer(this._onRequest.bind(this));
    this._envelopes = {};

    this.listen = Promise.promisify(this._httpServer.listen, { context: this._httpServer });
    this.close = Promise.promisify(this._httpServer.close, { context: this._httpServer });
};

HttpLimeServer.prototype.broadcast = function(envelope) {
    for (var from in this._envelopes) {
        this._answer(from, envelope);
    }
};

HttpLimeServer.prototype._onRequest = function(request, response) {
    var self = this;
    var body = [];

    switch (request.method) {
    case 'GET':
        return this._sendQueuedEnvelopes(response, request.headers.authorization);
    case 'POST':
        request
            .on('data', function(chunk) { body.push(chunk); })
            .on('end', function() {
                body = Buffer.concat(body).toString();
                self._onEnvelope(request.headers.authorization, JSON.parse(body));
            });
    }
};

HttpLimeServer.prototype._sendQueuedEnvelopes = function(response, from) {
    if (!this._envelopes[from]) {
        response.writeHead(404);
        response.end();
    }
    else {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(this._envelopes[from]));
        this._envelopes[from] = [];
    }
};

HttpLimeServer.prototype._onEnvelope = function(from, envelope) {
    if (!this._envelopes[from])
        this._envelopes[from] = [];

    // Command
    if (Lime.Envelope.isCommand(envelope)) {
        switch(envelope.uri) {
        case '/ping':
            this._answer(from, TestEnvelopes.Commands.pingResponse(envelope));
            break;
        }
    }

    // Message
    else if (Lime.Envelope.isMessage(envelope)) {
        switch(envelope.content) {
        case 'ping':
            this._answer(from, TestEnvelopes.Messages.pong);
            break;
        }
    }

    // Notification
    else if (Lime.Envelope.isNotification(envelope)) {
        switch(envelope.event) {
        case 'ping':
            this._answer(from, TestEnvelopes.Notifications.pong);
            break;
        }
    }
};

HttpLimeServer.prototype._answer = function(from, envelope) {
    this._envelopes[from].push(envelope);
};

module.exports = HttpLimeServer;
