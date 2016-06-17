/*eslint-env node, mocha */
var WebSocketTransport = require('../WebSocketTransport');
var WebSocketLimeServer = require('./helpers/WebSocketLimeServer');

require('chai').should();

describe('WebSocketTransport tests', function() {

    var fvoid = function() { return undefined; };
    var fid = function(x) { return x; };

    before(function(done) {
        this.server = new WebSocketLimeServer();
        this.server
            .listen(8124)
            .then(done);
    });

    it('should return a promise when opening a connection', function(done) {
        this.transport = new WebSocketTransport();
        this.transport
            .open('ws://127.0.0.1:8124/')
            .then(function() {
                done();
            });
    });

    it('should close connections without errors', function(done) {
        var transport = new WebSocketTransport();
        transport
            .open('ws://127.0.0.1:8124/')
            .then(function() {
                return transport.close();
            })
            .then(function() {
                done();
            });
    });

    it('should send and receive messages', function(done) {
        this.transport.onEnvelope = function(envelope) {
            if (envelope.content === 'pong') {
                done();
            }
        };
        this.transport.send({ content: 'ping' });
    });

    it('should receive broadcast messages', function(done) {
        var server = this.server;
        var transport1Received = false;
        var transport2Received = false;

        this.transport2 = new WebSocketTransport();
        this.transport2
            .open('ws://127.0.0.1:8124/')
            .then(function() {
                server.broadcast({ type: 'text/plain', content: 'test' });
            });

        this.transport.onEnvelope = function(envelope) {
            if (envelope.content === 'test') {
                transport1Received = true;
            }
            if (transport1Received && transport2Received) {
                done();
            }
        };
        this.transport2.onEnvelope = function(envelope) {
            if (envelope.content === 'test') {
                transport2Received = true;
            }
            if (transport1Received && transport2Received) {
                done();
            }
        };
    });

    after(function() {
        this.server.close();
    });
});
