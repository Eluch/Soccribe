var WebSocketServer = require('websocket').server;
var http = require('http');
var fs = require('fs');
var path = require('path');
const uuid = require('uuid/v4');

const SERVER_PORT = 80;

var server = http.createServer(function (request, response) {
    var filePath = '.' + request.url;
    if (filePath == './')
        filePath = './index.html';

    if (filePath == './favicon.ico')
        filePath = './favicons/favicon-0.ico';

    if (filePath == './server.js') {
        response.writeHead(403);
        response.end('Noope');
        return;
    }

    var extname = path.extname(filePath);
    var contentType = 'text/html';
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
        case '.png':
            contentType = 'image/png';
            break;
        case '.jpg':
            contentType = 'image/jpg';
            break;
        case '.ico':
            contentType = 'image/x-icon';
            break;
    }

    fs.readFile(filePath, function (error, content) {
        if (error) {
            if (error.code == 'ENOENT') {
                fs.readFile('./404.html', function (error, content) {
                    response.writeHead(200, {'Content-Type': contentType});
                    response.end(content, 'utf-8');
                });
            }
            else {
                response.writeHead(500);
                response.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
                response.end();
            }
        }
        else {
            response.writeHead(200, {'Content-Type': contentType});
            response.end(content, 'utf-8');
        }
    });

});

server.listen(SERVER_PORT, function() {
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

wsServer.on('request', function(request) {
    var connection = request.accept(null, request.origin);
    connection.uuid = uuid();
    clients[connection.uuid] = {
        connection: connection,
        name: null,
        tesco: 0
    };
    console.log('Client connected with uuid: ' + connection.uuid);

    for (var key in clients) {
        if (!clients.hasOwnProperty(key)) continue;
        if (key == connection.uuid) continue;
        if (clients[key].name === null) continue;
        var client = clients[key];
        sendToConnection(connection, {
            pid: 'player-connected',
            uuid: client.connection.uuid,
            name: client.name,
            tesco: client.tesco
        });
    }
    for (var i = 0; i < subscribers.length; i++) {
        var client = clients[subscribers[i]];
        sendToAll({
            pid: 'player-subscribed',
            uuid: client.connection.uuid,
            name: client.name,
            tesco: client.tesco,
            amount: subscribers.length
        });
    }

    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            try {
                var obj = JSON.parse(message.utf8Data);
                if (obj.pid === undefined) return;
                if (obj.pid == 'name') {
                    if (clients[connection.uuid].name === null) {
                        sendToConnection(connection, {
                            pid: 'player-accepted'
                        });
                    }
                    if (obj.name.length > 30) obj.name = obj.name.substr(0, 30);
                    clients[connection.uuid].name = obj.name;
                    clients[connection.uuid].tesco = +obj.tesco;
                    sendToAll({
                        pid: 'player-connected',
                        uuid: connection.uuid,
                        name: obj.name,
                        tesco: +obj.tesco
                    });
                } else if (obj.pid == 'subscribe') {
                    if (clients[connection.uuid].name === null) return;
                    if (subscribers.indexOf(connection.uuid) !== -1) return;

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
                        var i;
                        for (i = 0; i < subscribers.length; i++) {
                            names.push(clients[subscribers[i]].name);
                        }
                        names = names.join(', ');
                        for (i = 0; i < subscribers.length; i++) {
                            sendToConnection(clients[subscribers[i]].connection, {
                                pid: 'game',
                                notification: names
                            });
                        }
                        sendToAll({
                            pid: 'clear-subscribe'
                        });
                        subscribers = [];
                    }
                } else if (obj.pid == 'unsubscribe') {
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
            } catch (e) {}
        }
    });

    connection.on('close', function() {
        // close user connection
        var i = subscribers.indexOf(connection.uuid);
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