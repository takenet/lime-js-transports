/*eslint-env node, mocha */
var Lime = require('lime-js');
var HttpTransport = require('../HttpTransport');
var HttpLimeServer = require('./helpers/HttpLimeServer');

var NEW = Lime.SessionState.NEW;
var AUTHENTICATING = Lime.SessionState.AUTHENTICATING;
var ESTABLISHED = Lime.SessionState.ESTABLISHED;
var FINISHING = Lime.SessionState.FINISHING;
var FINISHED = Lime.SessionState.FINISHED;

require('chai').should();

describe('HttpTransport tests', function() {

    before(function(done) {
        this.server = new HttpLimeServer();
        this.server
            .listen(8124)
            .then(done);
    });

    beforeEach(function(done) {
        this.transport = new HttpTransport('remote@node.com', 'local@node.com', 500);
        this.transport
            .open('http://127.0.0.1:8124/')
            .then(done);
    });

    afterEach(function(done) {
        this.transport
            .close()
            .then(done);
    });

    it('should emulate sessions', function(done) {
        var transport = this.transport;

        this.transport.onEnvelope = function(envelope) {
            switch (envelope.state) {
            case AUTHENTICATING:
                transport.send({
                    state: AUTHENTICATING,
                    authentication: { key: 'MTIzNDU2' }
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

    it('should send and receive messages', function(done) {
        this.transport.onEnvelope = function(envelope) {
            if (envelope.content === 'pong')
                done();
        };
        authenticate(this.transport, 'MTIzNDU2');
        this.transport.send({ content: 'ping' });
    });

    it('should send and receive commands', function(done) {
        this.transport.onEnvelope = function(envelope) {
            if (envelope.content === 'pong') {
                done();
            }
        };
        authenticate(this.transport, 'MTIzNDU2');
        this.transport.send({ content: 'ping' });
    });

    it('should receive broadcast messages', function(done) {
        var server = this.server;
        var transport1Received = false;
        var transport2Received = false;

        var transport2 = new HttpTransport('remote@node.com', 'local2@node.com', 500);

        this.transport.onEnvelope = function(envelope) {
            if (envelope.content === 'test') transport1Received = true;
            if (transport1Received && transport2Received) done();
        };
        transport2.onEnvelope = function(envelope) {
            if (envelope.content === 'test') transport2Received = true;
            if (transport1Received && transport2Received) done();
        };

        transport2
            .open('http://127.0.0.1:8124/')
            .then(function() {
                authenticate(transport2, 'NjU0MzIx');
                transport2.send({ method: 'set' });
                setTimeout(function() {
                    server.broadcast({ type: 'text/plain', content: 'test' });
                }, 250);
            });

        authenticate(this.transport, 'MTIzNDU2');
        this.transport.send({ method: 'set' });
    });

    after(function() {
        this.server.close();
    });
});

function authenticate(transport, key) {
    transport.send({ state: NEW });
    transport.send({
        state: AUTHENTICATING,
        authentication: {
            key: key
        }
    });
}
