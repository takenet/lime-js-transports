var Lime = require('lime-js');
var signalR = require('@microsoft/signalr');

var fvoid = function () { };
var log = console
    ? (console.debug || console.log).bind(console)
    : fvoid;

const FromServerMethod = 'FromServer';
const FromClientMethod = 'FromClient';

module.exports = class SignalRTransport {
    
    onEnvelope = fvoid;
    /** 
     * @type { signalR.HubConnection } 
     */
    _hubConnection;

    constructor(settings, traceEnabled) {
        this._traceEnabled = traceEnabled || false;
        this._hubConnection = null;
        this.encryption = Lime.SessionEncryption.none;
        this.compression = Lime.SessionCompression.none;
    }

    get supportedCompression() {
        return this.getSupportedCompression();
    }

    get supportedEncryption() {
        return this.getSupportedEncryption();
    }

    async open(uri) {
        if (uri.indexOf('https://') > -1) {
            this.encryption = Lime.SessionEncryption.tls;
        }
        else {
            this.encryption = Lime.SessionEncryption.none;
        }
        this.compression = Lime.SessionCompression.none;
        this._hubConnection = new signalR.HubConnectionBuilder()
            .withUrl(uri)
            .withAutomaticReconnect()
            .build();

        this._hubConnection.on(FromServerMethod, envelope => {
            if (this._traceEnabled) {
                log(`SignalR ${FromServerMethod}: ${envelope}`);
            }
            
            this.onEnvelope(JSON.parse(envelope));
        });

        await this._hubConnection.start();
    }

    async close() {
        this.ensureOpen(this._hubConnection);

        await this._hubConnection.stop();
    }

    async send(envelope) {
        this.ensureOpen(this._hubConnection);

        var envelopeString = JSON.stringify(envelope);
        await this._hubConnection.invoke(FromClientMethod, envelopeString);

        if (this._traceEnabled) {
            log(`SignalR ${FromClientMethod}: ${envelopeString}`);
        }
    }

    ensureOpen() {
        if (!this._hubConnection || (this._hubConnection.state !== signalR.HubConnectionState.Connected && this._hubConnection.state !== signalR.HubConnectionState.Reconnecting)) {
            throw new Error('The connection is not open');
        }
    }
}