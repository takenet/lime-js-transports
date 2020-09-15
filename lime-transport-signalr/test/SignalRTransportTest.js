/*eslint-env node, mocha */
var signalR = require('@microsoft/signalr');
var SignalRTransport = require('../SignalRTransport');
var sinon = require('sinon');

require('chai').should();

const serverUrl = 'http://localhost:57813/';

describe('SignalRTransport tests', function () {
    beforeEach(() => {
        var testSelf = this;
        class MockHubConnection {
            constructor(url, reconnect) {
                this.url = url;
                this.reconnect = reconnect;
                this.callbacks = {};
                this.sentMessages = {};
            }
            start() {
                this._state = signalR.HubConnectionState.Connected;
                return Promise.resolve();
            }
            on(methodName, f) {
                this.callbacks[methodName] = f;
            }
            stop() {
                this._state = signalR.HubConnectionState.Disconnected;
                return Promise.resolve();
            }
            invoke(methodName, ...args) {
                if (!this.sentMessages[methodName]) {
                    this.sentMessages[methodName] = [];
                }

                this.sentMessages[methodName].push(args);
            }
            get state() {
                return this._state;
            }
        }

        class MockHubConnectionBuilder {
            constructor(params) { }
            withUrl(url) {
                this.url = url;
                return this;
            }
            withAutomaticReconnect() {
                this.reconnect = true;
                return this;
            }
            build() {
                var conn = new MockHubConnection(this.url, this.reconnect);
                testSelf.hubConnection = conn;
                return conn;
            };
        }

        sinon.stub(signalR, 'HubConnectionBuilder').callsFake((args) => {
            return new MockHubConnectionBuilder(args);
        });

        this.transport = new SignalRTransport();
    });

    it('should stop the signalR connection when closed is called', async () => {
        await this.transport.open(serverUrl);
        
        await this.transport.close();
        
        this.hubConnection.state.should.be.equal(signalR.HubConnectionState.Disconnected);
    });

    it('should start a signalR connection when open is called with the provided url', async () => {
        await this.transport.open(serverUrl);

        this.hubConnection.state.should.be.equal(signalR.HubConnectionState.Connected);
        this.hubConnection.url.should.be.equal(serverUrl);
    });

    it('should invoke onEnvelope with the provided message when a message arrives', async () => {
        const expectedEnvelope = JSON.stringify({ foo: Math.random() });
        let actualEnvelope = '';
        this.transport.onEnvelope = e => actualEnvelope = JSON.stringify(e);
        await this.transport.open(serverUrl);
        
        let fromServerCallback = this.hubConnection.callbacks['FromServer'](expectedEnvelope);
        if (typeof fromServerCallback !== "undefined" && typeof fromServerCallback['then'] !== "undefined") {
            await fromServerCallback;
        }

        actualEnvelope.should.be.equal(expectedEnvelope);
    });

    it('should invoke signalR FromClient when send is called with the provided message', async () => {
        const envelope = { bar: Math.random() };
        await this.transport.open(serverUrl);

        await this.transport.send(envelope);

        let expectedEnvelope = JSON.stringify(envelope);
        let sentMessages = this.hubConnection.sentMessages['FromClient'];
        sentMessages.should.have.lengthOf(1);
        let args = sentMessages[0];
        args.should.have.lengthOf(1);
        let actualEnvelope = args[0];
        actualEnvelope.should.be.equal(expectedEnvelope);
    });

    afterEach(() => {
        sinon.restore();
        this.transport.close();
    });
});
