(function (root, factory) {
    if (typeof exports === 'object' && typeof module === 'object') {
        module.exports = factory(require('lime-js'), require('bluebird'), require('request-promise'));
    } else if (typeof define === 'function' && define.amd) {
        define(['Lime', 'Promise'], factory);
    } else if (typeof exports === 'object') {
        exports['HttpTransport'] = factory(require('lime-js'), require('bluebird'), require('request-promise'));
    } else {
        root['HttpTransport'] = factory(root['Lime'], root['Promise']);
    }
}(this, function (Lime, Promise, request) {

    var fvoid = function() {};
    var log = console
        ? (console.debug || console.log).bind(console)  // eslint-disable-line no-console
        : fvoid;

    Lime.AuthenticationScheme = Lime.AuthenticationScheme || {
        KEY: 'key',
        PLAIN: 'plain'
    };

    // request fallback on browser
    request = request || function(options) {
        if (!options.uri) throw new Error('Invalid URI for request: ' + options.method + ' ' + options.uri);
        return new Promise(function(resolve, reject) {
            var request = new XMLHttpRequest();
            request.onreadystatechange = function() {
                if (this.readyState !== 4) return;
                if (this.status >= 200 && this.status <= 206)
                    resolve(this.responseText);
                else
                    reject(this.response);
            };
            request.setRequestHeader('Content-Type', options.type || 'application.json');
            for (var header in options.headers) {
                request.setRequestHeader(header, options.headers[header]);
            }
            request.open(options.method || 'GET', options.uri, true);
            request.send(options.body || options.data || null);
        });
    };

    var defaultSettings = {
        remoteNode: undefined,
        localNode: undefined,
        pollingInterval: 5000,
        envelopeURIs: {
            messages: { send: '/messages', receive: '/messages/inbox?keepStorage=false' },
            notifications: { send: '/notifications', receive: '/notifications/inbox?keepStorage=false' },
            commands: { send: '/commands' }
        }
    };

    // class HttpTransport
    var HttpTransport = function(settings, traceEnabled) {
        this._remoteNode = settings.remoteNode || defaultSettings.remoteNode;
        this._localNode = settings.localNode || defaultSettings.localNode;
        this._pollingInterval = settings.pollingInterval || defaultSettings.pollingInterval;
        this._envelopeURIs = settings.envelopeURIs || defaultSettings.envelopeURIs;
        this._traceEnabled = traceEnabled || false;

        this._uri = null;
        this._session = null;
        this._authentication = null;
        this._closing = false;

        this.encryption = Lime.SessionEncryption.NONE;
        this.compression = Lime.SessionCompression.NONE;
    };

    HttpTransport.prototype.open = function(uri) {
        this._uri = uri;
        return Promise.resolve();
    };

    HttpTransport.prototype.poll = function() {
        var self = this;

        if (!this._session) throw new Error('Cannot fetch envelopes without an established session');
        if (this._session.state !== Lime.SessionState.ESTABLISHED) throw new Error('Cannot fetch envelopes in the ' + this._session.state + ' state');

        return Promise.all([
            fetchEnvelopes.call(this, this._uri + getEnvelopeURI.call(this, 'messages', 'receive')),
            fetchEnvelopes.call(this, this._uri + getEnvelopeURI.call(this, 'notifications', 'receive'))
        ])
            .finally(function() {
                clearTimeout(self._pollTimeout);
                if (!self._closing)
                    self._pollTimeout = setTimeout(self.poll.bind(self), self._pollingInterval);
            });
    };

    HttpTransport.prototype.close = function() {
        this._closing = true;
        clearTimeout(this._pollTimeout);
        return Promise.resolve();
    };

    HttpTransport.prototype.send = function(envelope) {
        var self = this;
        if (Lime.Envelope.isSession(envelope)) {
            sendSession.call(this, envelope);
        }
        else if (Lime.Envelope.isCommand(envelope)) {
            sendEnvelope.call(this, envelope, this._uri + getEnvelopeURI.call(this, 'commands', 'send'))
                .then(function(response) { receiveEnvelope.call(self, JSON.parse(response)); })
                .catch(function(error) { self.onError(error); });
        }
        else if (Lime.Envelope.isNotification(envelope)) {
            sendEnvelope.call(this, envelope, this._uri + getEnvelopeURI.call(this, 'notifications', 'send'));
        }
        else if (Lime.Envelope.isMessage(envelope)) {
            sendEnvelope.call(this, envelope, this._uri + getEnvelopeURI.call(this, 'messages', 'send'));
        }
        else {
            throw new Error('Invalid envelope type');
        }
    };

    HttpTransport.prototype.onEnvelope = fvoid;

    HttpTransport.prototype.getSupportedCompression = function() {
        return [Lime.SessionCompression.NONE];
    };
    HttpTransport.prototype.setCompression = fvoid;

    HttpTransport.prototype.getSupportedEncryption = function() {
        return [Lime.SessionEncryption.NONE];
    };
    HttpTransport.prototype.setEncryption = fvoid;

    HttpTransport.prototype.onOpen = fvoid;
    HttpTransport.prototype.onClose = fvoid;
    HttpTransport.prototype.onError = fvoid;

    function fetchEnvelopes(uri) {
        var self = this;
        return request({
            method: 'GET',
            uri: uri,
            headers: {
                'Authorization': this._authorization,
            }
        })
            .catch(function(error) { self.onError(error); })
            .then(function(response) {
                response = JSON.parse(response);
                if (response instanceof Array) {
                    response.forEach(receiveEnvelope.bind(self));
                }
                else {
                    receiveEnvelope.call(self, response);
                }
            });
    }

    function receiveEnvelope(envelope) {
        if (this._traceEnabled) {
            log('HTTP RECEIVE: ' + JSON.stringify(envelope));
        }
        this.onEnvelope(envelope);
    }

    function sendEnvelope(envelope, uri) {
        var self = this;
        var envelopeString = JSON.stringify(envelope);

        if (!this._session) throw new Error('Cannot send envelopes without an established session');
        if (this._session.state !== Lime.SessionState.ESTABLISHED) throw new Error('Cannot send envelopes in the ' + this._session.state + ' state');

        var promise = request({
            method: 'POST',
            uri: uri,
            body: envelopeString,
            headers: {
                'Authorization': this._authorization,
                'Content-Type': 'application/json'
            }
        })
            .catch(function(error) { self.onError(error); });

        if (this._traceEnabled) {
            log('HTTP SEND ' + uri + ' ' + envelopeString);
        }

        return promise;
    }

    function sendSession(envelope) {
        var schemeOptions = [Lime.AuthenticationScheme.PLAIN, Lime.AuthenticationScheme.KEY];

        switch (envelope.state) {
        case Lime.SessionState.NEW:
            this._session = {
                id: Lime.Guid(),
                from: this._remoteNode,
                state: Lime.SessionState.AUTHENTICATING,
                schemeOptions: schemeOptions
            };
            break;

        case Lime.SessionState.AUTHENTICATING:
            if (!envelope.authentication) throw new Error('Invalid authentication scheme');

            var hasValidScheme = schemeOptions.some(function(scheme) {
                return !!envelope.authentication[scheme];
            });

            if (!hasValidScheme) throw new Error('Invalid authentication scheme');

            this._authentication = envelope.authentication;
            this._authorization = this._authentication[Lime.AuthenticationScheme.KEY]
                ? 'Key ' + this._authentication[Lime.AuthenticationScheme.KEY]
                : 'Basic ' + this._authentication[Lime.AuthenticationScheme.PLAIN];

            this._session = {
                id: this._session.id,
                from: this._session.from,
                to: this._localNode,
                state: Lime.SessionState.ESTABLISHED
            };
            this._pollTimeout = setTimeout(this.poll.bind(this), this._pollingInterval);
            break;

        case Lime.SessionState.FINISHING:
            this._session = {
                state: Lime.SessionState.FINISHED
            };
            break;

        default:
            throw new Error('Invalid session envelope "' + envelope.state + '". A session is already open with the state ' + this._session.state);
        }

        if (this._traceEnabled) {
            log('HTTP SEND: ' + JSON.stringify(envelope));
        }

        receiveEnvelope.call(this, this._session);
    }

    function getEnvelopeURI(type, method) {
        return typeof this._envelopeURIs[type] === 'object'
            ? this._envelopeURIs[type][method]
            : this._envelopeURIs[type];
    }

    return HttpTransport;
}));
