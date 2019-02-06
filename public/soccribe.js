(function () {

    const SETTING_SUBSCRIBE_TIME = 'subscribe-time';

    var onlyAlert = false;
    var ws;
    var isPlayerSubscribed = false;

    //region HTML objects
    var playerName;
    var setName;
    var tescoRadios;
    var subscribe;
    var unsubscribe;
    var subscribedList;
    var availablePlayers;
    var currentGamePlayers;
    //endregion

    var entityMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;'
    };

    function escapeHtml(str) {
        return String(str).replace(/[&<>"'`=\/]/g, function (s) {
            return entityMap[s];
        });
    }

    function appendTescoStr(tesco) {
        switch (tesco) {
            case 1:
                return ' <span class="tesco-green">+</span>';
            case -1:
                return ' <span class="tesco-red">-</span>';
            default:
                return '';
        }
    }

    function changeFavicon(number) {
        $('#dynamic-favicon').attr('href', 'favicons/favicon-' + +number + '.ico');
        $('#dynamic-favicon-32').attr('href', 'favicons/favicon-' + +number + '-32x32.png');
        $('#dynamic-favicon-16').attr('href', 'favicons/favicon-' + +number + '-16x16.png');
    }

    function getSetting(key) {
        if (typeof (Storage) !== "undefined") {
            let item = localStorage.getItem(key);
            if (item !== null) return item;
        }
        return '';
    }

    function saveSetting(key, value) {
        if (typeof (Storage) !== "undefined") {
            localStorage.setItem(key, value);
        }
    }

    function connect() {
        ws = new WebSocket(window.location.href.replace('http', 'ws'));
        ws.onopen = onOpen;
        ws.onerror = onError;
        ws.onclose = onClose;
        ws.onmessage = onMessage;
    }

    function send(obj) {
        ws.send(JSON.stringify(obj));
    }

    function onOpen() {
        playerName.prop('disabled', false);
        setName.removeClass('disabled');
        tescoRadios.prop('disabled', false);
        playerName.focus();
        setName.click();
        send({
            pid: 'get-server-uuid'
        });
    }

    function disableFields() {
        playerName.prop('disabled', true);
        setName.addClass('disabled');
        tescoRadios.prop('disabled', true);
        subscribe.addClass('disabled');
        unsubscribe.addClass('disabled');
        subscribedList.html('');
        availablePlayers.html('');
    }

    function onError() {
        if (ws.readyState !== ws.OPEN) {
            disableFields();
            setTimeout(connect, 1000);
        }
    }

    function onClose() {
        disableFields();

        if (ws.readyState === ws.CLOSED) {
            setTimeout(connect, 1000);
        }

        if (isPlayerSubscribed) {
            saveSetting(SETTING_SUBSCRIBE_TIME, getCurrentTimeMs());
        }
    }

    function onMessage(msg) {
        try {
            var data = JSON.parse(msg.data);
            if (data.pid === 'player-connected') {
                var player = $('.' + data.uuid);
                if (player.length) {
                    var avatar = '<span class="avatar" style="background: ' + stringToColour(escapeHtml(data.name)) +';">' + escapeHtml(data.name[0]) + '</span>';
                    player.html(avatar + escapeHtml(data.name) + appendTescoStr(data.tesco));
                } else {
                    var html = $('<li class="list-group-item"></li>');
                    html.addClass(data.uuid);
                    var avatar = '<span class="avatar" style="background: ' + stringToColour(escapeHtml(data.name)) +';">' + escapeHtml(data.name[0]) + '</span>';
                    html.html(avatar + escapeHtml(data.name) + appendTescoStr(data.tesco));
                    html.appendTo(availablePlayers);
                }
            } else if (data.pid === 'player-accepted') {
                subscribe.removeClass('disabled');
            } else if (data.pid === 'player-disconnected') {
                $('.' + data.uuid).remove();
                changeFavicon(data.amount);
            } else if (data.pid === 'player-subscribed') {
                var player = subscribedList.find('.' + data.uuid);
                if (player.length) {
                    var avatar = '<span class="avatar" style="background: ' + stringToColour(escapeHtml(data.name)) +';">' + escapeHtml(data.name[0]) + '</span>';
                    player.html(avatar + escapeHtml(data.name) + appendTescoStr(data.tesco));
                } else {
                    var html = $('<li class="list-group-item"></li>');
                    html.addClass(data.uuid);
                    var avatar = '<span class="avatar" style="background: ' + stringToColour(escapeHtml(data.name)) +';">' + escapeHtml(data.name[0]) + '</span>';
                    html.html(avatar + escapeHtml(data.name) + appendTescoStr(data.tesco));
                    html.appendTo(subscribedList);
                }
                changeFavicon(data.amount);
            } else if (data.pid === 'subscribe-accepted') {
                subscribe.addClass('disabled');
                unsubscribe.removeClass('disabled');
                isPlayerSubscribed = true;
            } else if (data.pid === 'player-unsubscribed') {
                subscribedList.find('.' + data.uuid).remove();
                changeFavicon(data.amount);
            } else if (data.pid === 'unsubscribe-accepted') {
                subscribe.removeClass('disabled');
                unsubscribe.addClass('disabled');
                isPlayerSubscribed = false;
            } else if (data.pid === 'game') {
                if (onlyAlert || Notification.permission !== "granted") {
                    alert("GAME:\n" + data.notification);
                } else {
                    var notification = new Notification("Game!", {
                        body: data.notification,
                        icon: window.location.href + 'soccer-court.png'
                    });
                    notification.onclick = function () {
                        window.focus();
                        notification.close();
                    };
                }
                subscribe.removeClass('disabled');
                unsubscribe.addClass('disabled');
                isPlayerSubscribed = false;
            } else if (data.pid === 'chosen-players') {
                var names = data.names;
                currentGamePlayers.removeClass('show');
                setTimeout(function() {
                    currentGamePlayers.each(function(i, e) {
                        $(e).addClass('show');
                        $(e).html(names[i]);
                    });
                }, 250);
            } else if (data.pid === 'clear-subscribe') {
                subscribedList.find('li').remove();
                changeFavicon(0);
            } else if (data.pid === 'server-uuid') {
                let serverUUID = data.uuid;
                let local = getSetting('server-uuid');
                if (local !== serverUUID) {
                    saveSetting('server-uuid', serverUUID);
                    if (local.length > 0) {
                        window.location.reload(true);
                    }
                } else {
                    let subscribedAt = +getSetting(SETTING_SUBSCRIBE_TIME) || 0;
                    // re-subscribe to game if less than N milliseconds elapsed since the disconnect
                    if (subscribedAt !== 0 && (subscribedAt - new Date()) <= 5000) {
                        saveSetting(SETTING_SUBSCRIBE_TIME, 0);
                        subscribe.click();
                    }
                }
                if (data.debug) enableDebugFunctions();
            } else if (typeof data.pid === 'string') {
                console.log('Unhandled pid: ' + data.pid);
            }
        } catch (e) {
        }
    }

    function stringToColour(str) {
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        var colour = '#';
        for (var i = 0; i < 3; i++) {
            var value = (hash >> (i * 8)) & 0xFF;
            colour += ('00' + value.toString(16)).substr(-2);
        }
        return colour;
    }

    function enableDebugFunctions() {
        $('#debug-functions').removeClass('d-none');
        $('#debug-functions button').click(function () {
            let pid = $(this).data('pid');
            if (typeof pid === 'string' && pid.length > 0) {
                send({pid: pid});
            }
        });
    }

    function getCurrentTimeMs() {
        return +(new Date());
    }

    $(function () {
        // READY
        if (!Notification) {
            onlyAlert = true;
        } else if (Notification.permission !== "granted") {
            Notification.requestPermission();
        }

        playerName = $('#player-name');
        setName = $('#set-name');
        subscribe = $('#subscribe');
        unsubscribe = $('#unsubscribe');
        subscribedList = $('#subscribed-list');
        availablePlayers = $('#available-players');
        tescoRadios = $('input[name=tesco-state]');
        currentGamePlayers = $('#latest-match-list .list-group-item .player');

        playerName.val(getSetting('name'));
        let tesco = getSetting('tesco');
        if (tesco.length > 0) {
            $('input[name=tesco-state][value=' + tesco + ']').prop('checked', true);
        }

        playerName.keyup(function (e) {
            if ((e.keyCode | e.which) === 13) {
                setName.click();
            }
        });

        setName.click(function () {
            let name = playerName.val().trim();
            let tesco = +$('input[name=tesco-state]:checked').val();
            saveSetting('name', name);
            saveSetting('tesco', tesco);
            if (name.length === 0) return;
            send({
                pid: 'name',
                name: name,
                tesco: tesco
            });
        });

        tescoRadios.change(function () {
            setName.click();
        });

        subscribe.click(function () {
            send({
                pid: 'subscribe'
            });
        });

        unsubscribe.click(function () {
            send({
                pid: 'unsubscribe'
            });
        });

        //websocket connect
        connect();
    });
})();