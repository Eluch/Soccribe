(function ($) {

    const SETTING_SUBSCRIBE_TIME = 'subscribe-time';

    let onlyAlert = false;
    let ws;
    let isPlayerSubscribed = false;

    //region HTML objects
    let dynFav;
    let dynFav16;
    let dynFav32;
    let playerName;
    let setName;
    let tescoRadios;
    let subscribe;
    let unsubscribe;
    let subscribedList;
    let availablePlayers;
    let currentGamePlayers;
    let countdownContainer;
    let challengersList;
    //endregion

    const entityMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;'
    };

    $(function () {
        // READY
        if (!Notification) {
            onlyAlert = true;
        } else if (Notification.permission !== "granted") {
            Notification.requestPermission();
        }

        dynFav = $('#dynamic-favicon');
        dynFav16 = $('#dynamic-favicon-16');
        dynFav32 = $('#dynamic-favicon-32');
        playerName = $('#player-name');
        setName = $('#set-name');
        subscribe = $('#subscribe');
        unsubscribe = $('#unsubscribe');
        subscribedList = $('#subscribed-list');
        availablePlayers = $('#available-players');
        tescoRadios = $('input[name=tesco-state]');
        currentGamePlayers = $('#latest-match-list .list-group-item .player');
        countdownContainer = $('#countdown-container');
        challengersList = $('#challengers-list');

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
            send({pid: 'subscribe'});
        });

        unsubscribe.click(function () {
            send({pid: 'unsubscribe'});
        });

        //websocket connect
        connect();
    });

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
        if (number < 0) number = 0;
        if (number > 4) number = 4;
        dynFav.attr('href', 'favicons/favicon-' + +number + '.ico');
        dynFav16.attr('href', 'favicons/favicon-' + +number + '-16x16.png');
        dynFav32.attr('href', 'favicons/favicon-' + +number + '-32x32.png');
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

    function handlePlayerConnected(data) {
        let player = $('.' + data.uuid);
        if (player.length) {
            let avatar = '<span class="avatar" style="background: ' + stringToColour(escapeHtml(data.name)) + ';">' + escapeHtml(data.name[0]) + '</span>';
            player.html(avatar + escapeHtml(data.name) + appendTescoStr(data.tesco));
        } else {
            let html = $('<li class="list-group-item"></li>');
            html.addClass(data.uuid);
            let avatar = '<span class="avatar" style="background: ' + stringToColour(escapeHtml(data.name)) + ';">' + escapeHtml(data.name[0]) + '</span>';
            html.html(avatar + escapeHtml(data.name) + appendTescoStr(data.tesco));
            html.appendTo(availablePlayers);
        }
    }

    function handlePlayerAccepted() {
        subscribe.removeClass('disabled');
    }

    function handlePlayerDisconnected(data) {
        $('.' + data.uuid).remove();
        changeFavicon(data.amount);
    }

    function handlePlayerSubscribed(data) {
        let player = subscribedList.find('.' + data.uuid);
        let player_online = availablePlayers.find('.' + data.uuid);
        if (player.length) {
            let avatar = '<span class="avatar" style="background: ' + stringToColour(escapeHtml(data.name)) + ';">' + escapeHtml(data.name[0]) + '</span>';
            player.html(avatar + escapeHtml(data.name) + appendTescoStr(data.tesco));
        } else {
            let html = $('<li class="list-group-item"></li>');
            html.addClass(data.uuid);
            let avatar = '<span class="avatar" style="background: ' + stringToColour(escapeHtml(data.name)) + ';">' + escapeHtml(data.name[0]) + '</span>';
            html.html(avatar + escapeHtml(data.name) + appendTescoStr(data.tesco));
            html.appendTo(subscribedList);
        }
        player_online.addClass('subbed');
        changeFavicon(data.amount);
    }

    function handleSubscribeAccepted() {
        subscribe.addClass('disabled');
        unsubscribe.removeClass('disabled');
        isPlayerSubscribed = true;
    }

    function handlePlayerUnsubscribed(data) {
        subscribedList.find('.' + data.uuid).remove();
        availablePlayers.find('.' + data.uuid).removeClass('subbed');
        changeFavicon(data.amount);
    }

    function handleUnsubscribeAccepted() {
        subscribe.removeClass('disabled');
        unsubscribe.addClass('disabled');
        isPlayerSubscribed = false;
    }

    function handleGame(data) {
        if (onlyAlert || Notification.permission !== "granted") {
            alert("GAME:\n" + data.notification);
        } else {
            let notification = new Notification("Game!", {
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
    }

    function handleChosenPlayers(data) {
        let names = data.names;
        currentGamePlayers.removeClass('show');
        setTimeout(function () {
            currentGamePlayers.each(function (i, e) {
                $(e).addClass('show');
                $(e).html(escapeHtml(names[i]));
            });

            let html = '';
            for (let i = 4; i < names.length; i++) {
                html += '<li class="list-group-item"><div class="player">' + escapeHtml(names[i]) + '</div></li>';
            }
            challengersList.html(html);
        }, 50);
    }

    function handleClearSubscribe() {
        subscribedList.find('li').remove();
        availablePlayers.find('li').removeClass('subbed');
        changeFavicon(0);
    }

    function handleServerUUID(data) {
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
    }

    function handleGameCountdown(data) {
        if (data.sec <= 0) {
            countdownContainer.addClass('d-none');
        } else {
            if (data.sec === 10) {
                countdownContainer.find('.alert').addClass('refresh');
                setTimeout(function () {
                    countdownContainer.find('.alert').removeClass('refresh');
                }, 50);
            }
            countdownContainer.removeClass('d-none');
            countdownContainer.find('.badge').text(data.sec);
        }
    }

    function onMessage(msg) {
        try {
            let data = JSON.parse(msg.data);
            switch (data.pid) {
                case 'player-connected':
                    return handlePlayerConnected(data);
                case 'player-accepted':
                    return handlePlayerAccepted();
                case 'player-disconnected':
                    return handlePlayerDisconnected(data);
                case 'player-subscribed':
                    return handlePlayerSubscribed(data);
                case 'subscribe-accepted':
                    return handleSubscribeAccepted();
                case 'player-unsubscribed':
                    return handlePlayerUnsubscribed(data);
                case 'unsubscribe-accepted':
                    return handleUnsubscribeAccepted();
                case 'game':
                    return handleGame(data);
                case 'chosen-players':
                    return handleChosenPlayers(data);
                case 'clear-subscribe':
                    return handleClearSubscribe();
                case 'server-uuid':
                    return handleServerUUID(data);
                case 'game-countdown':
                    return handleGameCountdown(data);
            }
            if (typeof data.pid === 'string') {
                console.log('Unhandled pid: ' + data.pid);
            }
        } catch (e) {
            console.error(e);
        }
    }

    function stringToColour(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        let colour = '#';
        for (let i = 0; i < 3; i++) {
            let value = (hash >> (i * 8)) & 0xFF;
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

})(jQuery);