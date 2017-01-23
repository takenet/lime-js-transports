(function(root, factory) {
    if (typeof exports === 'object' && typeof module === 'object') {
        module.exports = factory(require('lime-transport-http'), require('lime-transport-websocket'));
    } else if (typeof define === 'function' && define.amd) {
        define(['HttpTransport', 'WebSocketTransport'], factory);
    } else if (typeof exports === 'object') {
        exports['WebSocketHttpTransport'] = factory(require('lime-transport-http'), require('lime-transport-websocket'));
    } else {
        root['WebSocketHttpTransport'] = factory(root['HttpTransport'], root['WebSocketTransport']);
    }
}(this, function(HttpTransport, WebSocketTransport) {

    var root;
    if (typeof exports === 'object' && typeof module === 'object') {
        root = global;
    } else if (typeof define === 'function' && define.amd) {
        root = this;
    } else if (typeof exports === 'object') {
        root = global;
    } else {
        root = window;
    }

    // class WebSocketHttpTransport
    var WebSocketHttpTransport = function() {
        if (root.WebSocket && typeof root.WebSocket === 'function') {
            return new (Function.prototype.bind.apply(WebSocketTransport, [this].concat(Array.prototype.slice.call(arguments))))();
        }
        return new (Function.prototype.bind.apply(HttpTransport, [this].concat(Array.prototype.slice.call(arguments))))();
    };

    return WebSocketHttpTransport;
}));
