var WebSocketServer = require('websocket').server;
var http = require('http');
var nStatic = require('node-static');
const uuid = require('uuid/v4');

const SERVER_PORT = 80;
const SERVER_UUID = uuid();
const DEBUG_MODE = !!+process.env.DEBUG_MODE;

var fileServer = new nStatic.Server('./public');

var server = http.createServer(function (request, response) {

    fileServer.serve(request, response);

});

server.listen(SERVER_PORT, function () {
    console.log('Server listening on port: ' + SERVER_PORT);
});

var wsServer = new WebSocketServer({
    httpServer: server
});

var clients = {};
var subscribers = [];

function sendToAll(obj) {
    var msg = JSON.stringify(obj);
    for (var key in clients) {
        if (!clients.hasOwnProperty(key)) continue;
        var client = clients[key];
        client.connection.sendUTF(msg);
    }
}

function sendToConnection(connection, obj) {
    connection.sendUTF(JSON.stringify(obj));
}

function shuffleArray(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

wsServer.on('request', function (request) {
    let connection = request.accept(null, request.origin);
    connection.uuid = uuid();
    clients[connection.uuid] = {
        connection: connection,
        name: null,
        tesco: 0
    };
    console.log('Client connected with uuid: ' + connection.uuid + ' (' + connection.remoteAddress + ')');

    for (var key in clients) {
        if (!clients.hasOwnProperty(key)) continue;
        if (key === connection.uuid) continue;
        if (clients[key].name === null) continue;
        let client = clients[key];
        sendToConnection(connection, {
            pid: 'player-connected',
            uuid: client.connection.uuid,
            name: client.name,
            tesco: client.tesco
        });
    }
    for (var i = 0; i < subscribers.length; i++) {
        let client = clients[subscribers[i]];
        sendToAll({
            pid: 'player-subscribed',
            uuid: client.connection.uuid,
            name: client.name,
            tesco: client.tesco,
            amount: subscribers.length
        });
    }

    function handleName(connection, obj) {
        if (clients[connection.uuid].name === null) {
            sendToConnection(connection, {
                pid: 'player-accepted'
            });
        }
        if (obj.name.length > 10) obj.name = obj.name.substr(0, 10);
        clients[connection.uuid].name = obj.name;
        clients[connection.uuid].tesco = +obj.tesco;
        sendToAll({
            pid: 'player-connected',
            uuid: connection.uuid,
            name: obj.name,
            tesco: +obj.tesco
        });
    }

    function handleSubscribe(connection) {
        if (clients[connection.uuid].name === null) return;
        if (!DEBUG_MODE && subscribers.indexOf(connection.uuid) !== -1) return;

        subscribers.push(connection.uuid);
        if (subscribers.length < 4) {
            sendToConnection(connection, {
                pid: 'subscribe-accepted'
            });
            sendToAll({
                pid: 'player-subscribed',
                uuid: connection.uuid,
                name: clients[connection.uuid].name,
                tesco: clients[connection.uuid].tesco,
                amount: subscribers.length
            });
        } else {
            // GAME START
            var names = [];
            var names_str;
            var i;
            for (i = 0; i < subscribers.length; i++) {
                names.push(clients[subscribers[i]].name);
            }
            shuffleArray(names);
            if (names.length === 4) {
                names_str = `Red: ${names[0]}, ${names[1]}\nBlue: ${names[2]}, ${names[3]}`
            } else {
                names_str = names.join(', ');
            }
            for (i = 0; i < subscribers.length; i++) {
                sendToConnection(clients[subscribers[i]].connection, {
                    pid: 'game',
                    notification: names_str
                });
            }
            sendToAll({
                pid: 'clear-subscribe'
            });
            sendToAll({
                pid: 'chosen-players',
                names: names
            });
            subscribers = [];
        }
    }

    function handleUnsubscribe(connection) {
        var index = subscribers.indexOf(connection.uuid);
        if (index === -1) return;
        subscribers.splice(index, 1);
        sendToConnection(connection, {
            pid: 'unsubscribe-accepted'
        });
        sendToAll({
            pid: 'player-unsubscribed',
            uuid: connection.uuid,
            amount: subscribers.length
        });
    }

    function handleGetServerUUID(connection) {
        sendToConnection(connection, {
            pid: 'server-uuid',
            debug: DEBUG_MODE,
            uuid: SERVER_UUID
        });
    }

    connection.on('message', function (message) {
        if (message.type === 'utf8') {
            try {
                var obj = JSON.parse(message.utf8Data);
                if (obj.pid === undefined) return;
                switch (obj.pid) {
                    case 'name':
                        return handleName(connection, obj);
                    case 'subscribe':
                        return handleSubscribe(connection);
                    case 'unsubscribe':
                        return handleUnsubscribe(connection);
                    case 'get-server-uuid':
                        return handleGetServerUUID(connection);
                    default:
                        console.error(`Unhandled pid: ${obj.pid}`);
                }
            } catch (e) {
                console.error(e);
            }
        }
    });

    connection.on('close', function () {
        // close user connection
        let i = subscribers.indexOf(connection.uuid);
        if (i !== -1)
            subscribers.splice(i, 1);
        delete clients[connection.uuid];
        console.log('Client disconnected with uuid: ' + connection.uuid);
        sendToAll({
            pid: 'player-disconnected',
            uuid: connection.uuid,
            amount: subscribers.length
        });
    });
});
