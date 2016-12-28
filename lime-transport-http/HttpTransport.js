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
                if (this.status >= 200 && this.status <= 203)
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

    // class HttpTransport
    var HttpTransport = function(remoteNode, localNode, pollingInterval, traceEnabled) {
        this._remoteNode = remoteNode;
        this._localNode = localNode;
        this._pollingInterval = pollingInterval || 5000;
        this._traceEnabled = traceEnabled || false;

        this._uri = null;
        this._session = null;
        this._authentication = null;

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

        return request({
            method: 'GET',
            uri: this._uri + '?from=' + this._localNode,
            headers: {
                'Authorization': this._authorization,
            }
        })
            .then(function(response) {
                response = JSON.parse(response);
                if (response instanceof Array) {
                    response.forEach(receiveEnvelope.bind(self));
                }
                else {
                    receiveEnvelope.call(self, response);
                }
            })
            .catch(function(error) {
                self.onError(error);
            })
            .finally(function() {
                clearTimeout(self._pollTimeout);
                self._pollTimeout = setTimeout(self.poll.bind(self), self._pollingInterval);
            });
    };

    HttpTransport.prototype.close = function() {
        clearTimeout(this._pollTimeout);
        return Promise.resolve();
    };

    HttpTransport.prototype.send = function(envelope) {
        if (Lime.Envelope.isSession(envelope)) {
            return sendSession.call(this, envelope);
        }
        else if (Lime.Envelope.isCommand(envelope)) {
            return sendCommand.call(this, envelope);
        }

        return sendEnvelope.call(this, envelope);
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

    function receiveEnvelope(envelope) {
        if (this._traceEnabled) {
            log('HTTP RECEIVE: ' + JSON.stringify(envelope));
        }
        this.onEnvelope(envelope);
    }

    function sendEnvelope(envelope) {
        var envelopeString = JSON.stringify(envelope);

        if (!this._session) throw new Error('Cannot send envelopes without an established session');
        if (this._session.state !== Lime.SessionState.ESTABLISHED) throw new Error('Cannot send envelopes in the ' + this._session.state + ' state');

        var promise = request({
            method: 'POST',
            uri: this._uri,
            body: envelopeString,
            headers: {
                'Authorization': this._authorization,
            }
        });

        if (this._traceEnabled) {
            log('HTTP SEND: ' + envelopeString);
        }

        return promise;
    }

    function sendCommand(envelope) {
        var self = this;
        sendEnvelope.call(this, envelope)
            .then(function(response) {
                receiveEnvelope.call(self, response);
            })
            .catch(function(error) {
                self.onError(error);
            });
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
            var hasValidScheme = schemeOptions.some(function(scheme) {
                return !!envelope.authentication[scheme];
            });

            if (!envelope.authentication || !hasValidScheme)
                throw new Error('Invalid authentication scheme');

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

        default:
            throw new Error('Cannot send a session envelope when a session is already open in the state ' + this._session.state);
        }

        if (this._traceEnabled) {
            log('HTTP SEND: ' + JSON.stringify(envelope));
        }

        this.onEnvelope(this._session);
    }

    return HttpTransport;
}));
