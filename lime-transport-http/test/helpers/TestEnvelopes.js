exports.Sessions = {
    authenticating: {
        id: '0',
        from: '127.0.0.1:8124',
        state: 'authenticating'
    },
    established: {
        id: '0',
        from: '127.0.0.1:8124',
        state: 'established'
    }
};
exports.Commands = {
    pingResponse: function(envelope) {
        return {
            id: envelope.id,
            method: 'get',
            status: 'success'
        };
    }
};
exports.Messages = {
    pong: {
        type: 'text/plain',
        content: 'pong'
    }
};
exports.Notifications = {
    pong: {
        event: 'pong'
    }
};
