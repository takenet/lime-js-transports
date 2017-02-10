/*eslint-env node, mocha */
var Lime = require('lime-js');
var HttpTransport = require('../HttpTransport');
var HttpLimeServer = require('./helpers/HttpLimeServer');

var NEW = Lime.SessionState.NEW;
var AUTHENTICATING = Lime.SessionState.AUTHENTICATING;
var ESTABLISHED = Lime.SessionState.ESTABLISHED;
var FINISHING = Lime.SessionState.FINISHING;
var FINISHED = Lime.SessionState.FINISHED;

var PLAIN = Lime.AuthenticationScheme.PLAIN;
var KEY = Lime.AuthenticationScheme.KEY;

require('chai').should();

describe('HttpTransport tests', function() {

    before(function(done) {
        this.server = new HttpLimeServer();
        this.server
            .listen(8124)
            .then(done);
    });

    beforeEach(function(done) {
        this.transport = buildHttpTransport('local@test.com');
        this.transport
            .open('http://127.0.0.1:8124')
            .then(done);
    });

    afterEach(function(done) {
        this.transport
            .close()
            .then(function() {
                setTimeout(done, 500);
            });
    });

    it('should emulate sessions', function(done) {
        var transport = this.transport;

        this.transport.onEnvelope = function(envelope) {
            switch (envelope.state) {
            case AUTHENTICATING:
                transport.send({
                    state: AUTHENTICATING,
                    authentication: { key: 'MTIzNDU2' },
                    scheme: KEY
                });
                break;
            case ESTABLISHED:
                transport.send({ state: FINISHING });
                break;
            case FINISHED:
                done();
                break;
            }
        };

        this.transport.send({ state: NEW });
    });

    it('should send and receive notifications', function(done) {
        authenticate(this.transport);
        this.transport.onEnvelope = function(envelope) {
            if (envelope.event === 'pong')
                done();
        };
        this.transport.send({ event: 'ping' });
    });

    it('should send and receive messages', function(done) {
        authenticate(this.transport);
        this.transport.onEnvelope = function(envelope) {
            if (envelope.content === 'pong')
                done();
        };
        this.transport.send({ content: 'ping' });
    });

    it('should send and receive commands', function(done) {
        this.transport.onEnvelope = function(envelope) {
            if (envelope.status === 'success')
                done();
        };
        authenticate(this.transport);
        this.transport.send({ method: 'get', uri: '/ping' });
    });

    it('should handle transport errors', function(done) {
        this.transport.onError = function() {
            done();
        };
        authenticate(this.transport);
        this.transport.send({ method: 'get', uri: '/error' });
    });

    it('should handle HTTP authorization errors', function(done) {
        authenticate(this.transport, '1nv@l1dP@55w0rd');
        this.transport.onEnvelope = function(envelope) {
            if (!Lime.Envelope.isSession(envelope))
                return;

            envelope.state.should.equal(Lime.SessionState.FAILED);
            envelope.reason.code.should.equal(13);
            done();
        };
        this.transport.send({ content: 'ping' });
    });

    it('should receive broadcast messages', function(done) {
        var server = this.server;
        var transport1Received = false;
        var transport2Received = false;

        var transport2 = buildHttpTransport('local2@test.com');

        this.transport.onEnvelope = function(envelope) {
            if (envelope.content === 'test') transport1Received = true;
            if (transport1Received && transport2Received) done();
        };
        transport2.onEnvelope = function(envelope) {
            if (envelope.content === 'test') transport2Received = true;
            if (transport1Received && transport2Received) done();
        };

        transport2
            .open('http://127.0.0.1:8124')
            .then(function() {
                authenticate(transport2);
                transport2.send({ method: 'set' });
                setTimeout(function() {
                    server.broadcast({ type: 'text/plain', content: 'test' });
                }, 250);
            });

        authenticate(this.transport);
        this.transport.send({ method: 'set' });
    });

    after(function() {
        this.server.close();
    });
});

function buildHttpTransport(localNode) {
    return new HttpTransport({
        remoteNode: 'remote@test.com',
        localNode: localNode,
        pollingInterval: 500
    });
}

function authenticate(transport, password) {
    password = password || 'MTIzNDU2';
    transport.send({ state: NEW });
    transport.send({
        state: AUTHENTICATING,
        authentication: {
            password: password
        },
        scheme: PLAIN
    });
}
