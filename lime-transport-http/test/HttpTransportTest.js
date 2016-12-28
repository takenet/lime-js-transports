/*eslint-env node, mocha */
var HttpTransport = require('../HttpTransport');
var HttpLimeServer = require('./helpers/HttpLimeServer');

require('chai').should();

describe('HttpTransport tests', function() {

    before(function(done) {
        this.server = new HttpLimeServer();
        this.server
            .listen(8124)
            .then(done);
    });

    it('should return a promise when opening a connection', function(done) {
        this.transport = new HttpTransport('remote@node.com', 'local@node.com', 500);
        this.transport
            .open('http://127.0.0.1:8124/')
            .then(function() {
                done();
            });
    });

    it('should close connections without errors', function(done) {
        var transport = new HttpTransport('remote@node.com', 'local@node.com', 500);
        transport
            .open('http://127.0.0.1:8124/')
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
        this.transport.send({ state: 'new' });
        this.transport.send({
            state: 'authenticating',
            authentication: { key: 'MTIzNDU2' }
        });
        this.transport.send({ content: 'ping' });
    });

    it('should receive broadcast messages', function(done) {
        var self = this;
        var server = this.server;
        var transport1Received = false;
        var transport2Received = false;

        this.transport2 = new HttpTransport('remote@node.com', 'local2@node.com', 500);
        this.transport2
            .open('http://127.0.0.1:8124/')
            .then(function() {
                self.transport2.send({ state: 'new' });
                self.transport2.send({
                    state: 'authenticating',
                    authentication: { key: 'NjU0MzIx' }
                });
                self.transport2.send({ method: 'set' });

                setTimeout(function() {
                    server.broadcast({ type: 'text/plain', content: 'test' });
                }, 500);
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
