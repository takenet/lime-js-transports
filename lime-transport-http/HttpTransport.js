(function (root, factory) {
    if (typeof exports === 'object' && typeof module === 'object') {
        module.exports = factory(require('lime-js'), require('bluebird'), require('node-fetch'));
    } else if (typeof define === 'function' && define.amd) {
        define(['Lime', 'Promise', 'fetch'], factory);
    } else if (typeof exports === 'object') {
        exports['HttpTransport'] = factory(require('lime-js'), require('bluebird'), require('node-fetch'));
    } else {
        root['HttpTransport'] = factory(root['Lime'], root['Promise'], root['fetch']);
    }
}(this, function (Lime, Promise, fetch) {

    var fvoid = function() {};
    var log = console
        ? (console.debug || console.log).bind(console)  // eslint-disable-line no-console
        : fvoid;

    Lime.AuthenticationScheme = Lime.AuthenticationScheme || {
        KEY: 'key',
        PLAIN: 'plain'
    };

    // Create Base64 Object
    var Base64={_keyStr:'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=',encode:function(e){var t='';var n,r,i,s,o,u,a;var f=0;e=Base64._utf8_encode(e);while(f<e.length){n=e.charCodeAt(f++);r=e.charCodeAt(f++);i=e.charCodeAt(f++);s=n>>2;o=(n&3)<<4|r>>4;u=(r&15)<<2|i>>6;a=i&63;if(isNaN(r)){u=a=64}else if(isNaN(i)){a=64}t=t+this._keyStr.charAt(s)+this._keyStr.charAt(o)+this._keyStr.charAt(u)+this._keyStr.charAt(a)}return t},decode:function(e){var t="";var n,r,i;var s,o,u,a;var f=0;e=e.replace(/[^A-Za-z0-9+/=]/g,"");while(f<e.length){s=this._keyStr.indexOf(e.charAt(f++));o=this._keyStr.indexOf(e.charAt(f++));u=this._keyStr.indexOf(e.charAt(f++));a=this._keyStr.indexOf(e.charAt(f++));n=s<<2|o>>4;r=(o&15)<<4|u>>2;i=(u&3)<<6|a;t=t+String.fromCharCode(n);if(u!=64){t=t+String.fromCharCode(r)}if(a!=64){t=t+String.fromCharCode(i)}}t=Base64._utf8_decode(t);return t},_utf8_encode:function(e){e=e.replace(/rn/g,"n");var t="";for(var n=0;n<e.length;n++){var r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r)}else if(r>127&&r<2048){t+=String.fromCharCode(r>>6|192);t+=String.fromCharCode(r&63|128)}else{t+=String.fromCharCode(r>>12|224);t+=String.fromCharCode(r>>6&63|128);t+=String.fromCharCode(r&63|128)}}return t},_utf8_decode:function(e){var t="";var n=0;var r=c1=c2=0;while(n<e.length){r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r);n++}else if(r>191&&r<224){c2=e.charCodeAt(n+1);t+=String.fromCharCode((r&31)<<6|c2&63);n+=2}else{c2=e.charCodeAt(n+1);c3=e.charCodeAt(n+2);t+=String.fromCharCode((r&15)<<12|(c2&63)<<6|c3&63);n+=3}}return t}} // eslint-disable-line

    var defaultSettings = {
        remoteNode: undefined,
        localNode: undefined,
        pollingInterval: 5000,
        envelopeURIs: {
            messages: { send: '/messages', receive: '/messages/inbox?keepStored=false' },
            notifications: { send: '/notifications', receive: '/notifications/inbox?keepStored=false' },
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
                .then(function(response) { return response.json(); })
                .then(function(body) { receiveEnvelope.call(self, body); })
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
        return fetch(uri, {
            method: 'GET',
            headers: {
                'Authorization': this._authorization,
            }
        })
            .catch(function(error) { self.onError(error); })
            .then(function(response) {
                if (response.status !== 200)
                    return;

                return response.json();
            })
            .then(function(body) {
                if (!body) {
                    return;
                }
                else if (body instanceof Array) {
                    body.forEach(receiveEnvelope.bind(self));
                }
                else {
                    receiveEnvelope.call(self, body);
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
        var interceptedEnvelope = interceptEnvelope(envelope);
        if (interceptedEnvelope)
            return Promise.resolve({ json: function() { return interceptedEnvelope; } });

        var self = this;
        var envelopeString = JSON.stringify(envelope);

        if (!this._session) throw new Error('Cannot send envelopes without an established session');
        if (this._session.state !== Lime.SessionState.ESTABLISHED) throw new Error('Cannot send envelopes in the ' + this._session.state + ' state');

        var promise = fetch(uri, {
            method: 'POST',
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

    function interceptEnvelope(envelope) {
        if (Lime.Envelope.isCommand(envelope)) {
            switch (envelope.uri) {
            case '/presence':
            case '/receipt':
                return {
                    id: envelope.id,
                    method: 'set',
                    status: 'success'
                };
            }
        }
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
                return envelope.scheme === scheme;
            });

            if (!hasValidScheme) throw new Error('Invalid authentication scheme');

            this._authentication = envelope.authentication;
            this._authentication.scheme = envelope.scheme;
            this._authorization = this._authentication.scheme === Lime.AuthenticationScheme.KEY
                ? 'Key ' + this._authentication.key
                : 'Basic ' + Base64.encode(this._localNode + ':' + Base64.decode(this._authentication.password));

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
