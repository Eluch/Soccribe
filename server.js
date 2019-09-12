let WebSocketServer = require('websocket').server;
let http = require('http');
let fs = require('fs');
let nStatic = require('node-static');
let nf = require('./named_functions');
const uuid = require('uuid/v4');

let hash = 'no-hash-found';
try {
    hash = fs.readFileSync('hash', 'utf8').trim();
} catch (e) {
    hash = uuid();
}

const SERVER_PORT = 80;
const SERVER_UUID = hash;
const DEBUG_MODE = !!+process.env.DEBUG_MODE;
const PATH_LAST_CHOSEN_PLAYERS = './storage/lastChosenPlayers.json';

let fileServer = new nStatic.Server('./public');

let server = http.createServer(function (request, response) {
    let filePath = '.' + request.url;
    if (filePath === './') {
        filePath = './public/index.html';
        fs.readFile(filePath, function (error, content) {
            if (error) {
                response.writeHead(500);
                response.end();
            } else {
                let versionedContent = content.toString().replace(/\[SERVER-UUID]/g, SERVER_UUID);
                response.writeHead(200, {'Content-Type': 'text/html'});
                response.end(versionedContent, 'utf-8');
            }
        });
    } else {
        if (request.url === '/favicon.ico') request.url = '/favicons/favicon-0.ico';
        fileServer.serve(request, response);
    }
});

server.listen(SERVER_PORT, function () {
    console.log('Server listening on port: ' + SERVER_PORT);
});

let wsServer = new WebSocketServer({
    httpServer: server
});

let clients = {};
let subscribers = [];
let lastChosenPlayers = null;

const GAME_PREP_COUNTDOWN_NAME = 'before-game';
const GAME_PREP_COUNTDOWN_SEC_BEFORE_START = 10;
let gamePrepSeconds = 0;

const TEN_ALERT_COUNTDOWN_NAME = 'ten-alert-countdown';
const TEN_ALERT_TIMEOUT_SECONDS = +process.env.TEN_ALERT_TIMEOUT_SECONDS || 300;
let tenAlertTimeLeft = 0;

// loading lastChosenPlayers from file
if (fs.existsSync(PATH_LAST_CHOSEN_PLAYERS)) {
    let contents = fs.readFileSync(PATH_LAST_CHOSEN_PLAYERS, 'utf8');
    lastChosenPlayers = JSON.parse(contents);
}

function sendToAll(obj) {
    let msg = JSON.stringify(obj);
    for (let key in clients) {
        if (!clients.hasOwnProperty(key)) continue;
        let client = clients[key];
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
        gameType: 0
    };
    console.log('Client connected with uuid: ' + connection.uuid + ' (' + connection.remoteAddress + ')');

    for (let key in clients) {
        if (!clients.hasOwnProperty(key)) continue;
        if (key === connection.uuid) continue;
        if (clients[key].name === null) continue;
        let client = clients[key];
        sendToConnection(connection, {
            pid: 'player-connected',
            uuid: client.connection.uuid,
            name: client.name,
            gameType: client.gameType
        });
    }
    for (let i = 0; i < subscribers.length; i++) {
        let client = clients[subscribers[i]];
        sendToConnection(connection, {
            pid: 'player-subscribed',
            uuid: client.connection.uuid,
            name: client.name,
            gameType: client.gameType,
            amount: subscribers.length
        });
    }
    if (lastChosenPlayers !== null) {
        sendToConnection(connection, lastChosenPlayers);
    }

    function handleName(connection, obj) {
        if (clients[connection.uuid].name === null) {
            sendToConnection(connection, {
                pid: 'player-accepted',
                tenAlertAvailable: tenAlertTimeLeft === 0
            });
        }
        if (obj.name.length > 10) obj.name = obj.name.substr(0, 10);
        clients[connection.uuid].name = obj.name;
        clients[connection.uuid].gameType = +obj.gameType;
        sendToAll({
            pid: 'player-connected',
            uuid: connection.uuid,
            name: obj.name,
            gameType: +obj.gameType
        });
        triggerGamePrepCountdown();
    }

    function triggerGamePrepCountdown() {
        nf.clearNamedInterval(GAME_PREP_COUNTDOWN_NAME);
        let selectedSubscribers = getSubscribersWeightedByGameType();
        if (selectedSubscribers.length < 4) {
            sendToAll({
                pid: 'game-countdown',
                sec: -1,
            });
            return;
        }
        gamePrepSeconds = GAME_PREP_COUNTDOWN_SEC_BEFORE_START;
        sendToAll({
            pid: 'game-countdown',
            sec: gamePrepSeconds,
        });

        nf.setNamedInterval(GAME_PREP_COUNTDOWN_NAME, function () {
            gamePrepSeconds--;
            sendToAll({
                pid: 'game-countdown',
                sec: gamePrepSeconds,
            });
            if (gamePrepSeconds === 0) {
                nf.clearNamedInterval(GAME_PREP_COUNTDOWN_NAME);
                scrambleSubscribersAndStartGame();
            }
        }, 1000);
    }

    function getSubscribersWeightedByGameType() {
        let categories = {};
        let player;
        for (let i = 0; i < subscribers.length; i++) {
            player = clients[subscribers[i]];
            if (categories[player.gameType] === undefined) {
                categories[player.gameType] = [];
            }
            categories[player.gameType].push(subscribers[i]);
        }
        for (let key in categories) {
            if (!categories.hasOwnProperty(key)) continue;
            if (categories[key].length >= 4) return categories[key];
        }
        return [];
    }

    function handleSubscribe(connection) {
        if (clients[connection.uuid].name === null) return;
        if (!DEBUG_MODE && subscribers.indexOf(connection.uuid) !== -1) return;

        subscribers.push(connection.uuid);
        sendToConnection(connection, {
            pid: 'subscribe-accepted'
        });
        sendToAll({
            pid: 'player-subscribed',
            uuid: connection.uuid,
            name: clients[connection.uuid].name,
            gameType: clients[connection.uuid].gameType,
            amount: subscribers.length
        });
        triggerGamePrepCountdown();
    }

    function scrambleSubscribersAndStartGame() {
        // GAME START
        let selectedSubscribers = getSubscribersWeightedByGameType();
        shuffleArray(selectedSubscribers);
        let oddSubscriber = null;
        if (selectedSubscribers.length % 2 === 1) oddSubscriber = selectedSubscribers.splice(-1, 1);
        let names = [];
        let names_str;
        let i;
        for (i = 0; i < selectedSubscribers.length; i++) {
            names.push(clients[selectedSubscribers[i]].name);
        }
        if (names.length >= 4) {
            names_str = `Red: ${names[0]}, ${names[1]}\nBlue: ${names[2]}, ${names[3]}`;
            for (i = 5; i < selectedSubscribers.length; i += 2) {
                names_str += `\nChallenger: ${names[i - 1]}, ${names[i]}`;
            }
        } else {
            names_str = names.join(', ');
        }
        console.log('Game started: ' + names_str.replace(/\n/gm, '; '));
        for (i = 0; i < selectedSubscribers.length; i++) {
            sendToConnection(clients[selectedSubscribers[i]].connection, {
                pid: 'game',
                notification: names_str
            });
        }
        sendToAll(lastChosenPlayers = {
            pid: 'chosen-players',
            date: new Date().getTime(),
            gameType: clients[selectedSubscribers[0]].gameType,
            names: names
        });
        sendToAll({pid: 'unsubscribe-all'});
        subscribers = [];
        if (oddSubscriber !== null) {
            sendToConnection(clients[oddSubscriber[0]].connection, {pid: 'unsubscribe-accepted'});
        }
        fs.writeFile(PATH_LAST_CHOSEN_PLAYERS, JSON.stringify(lastChosenPlayers), err => {
            if (err) console.error(err);
        });
    }

    function handleUnsubscribe(connection) {
        let index = subscribers.indexOf(connection.uuid);
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
        triggerGamePrepCountdown();
    }

    function handleGetServerUUID(connection) {
        sendToConnection(connection, {
            pid: 'server-uuid',
            debug: DEBUG_MODE,
            uuid: SERVER_UUID
        });
    }

    function handleTenAlert() {
        if (tenAlertTimeLeft > 0) return;
        sendToAll({pid: 'ten-alert-sound'});
        tenAlertTimeLeft = TEN_ALERT_TIMEOUT_SECONDS;

        nf.setNamedInterval(TEN_ALERT_COUNTDOWN_NAME, function () {
            tenAlertTimeLeft--;
            if (tenAlertTimeLeft === 0) {
                nf.clearNamedInterval(TEN_ALERT_COUNTDOWN_NAME);
                sendToAll({pid: 'ten-alert-available'});
            }
        }, 1000);
    }

    connection.on('message', function (message) {
        if (message.type === 'utf8') {
            try {
                let obj = JSON.parse(message.utf8Data);
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
                    case 'ten-alert':
                        return handleTenAlert();
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
        handleUnsubscribe(connection);
        delete clients[connection.uuid];
        console.log('Client disconnected with uuid: ' + connection.uuid);
        sendToAll({
            pid: 'player-disconnected',
            uuid: connection.uuid,
            amount: subscribers.length
        });
    });
});
