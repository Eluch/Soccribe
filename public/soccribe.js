(function ($) {

    const SETTING_SUBSCRIBE_TIME = 'subscribe-time';
    const SETTING_SOUNDS_ENABLED = 'sounds-enabled';

    let onlyAlert = false;
    let ws;
    let isPlayerSubscribed = false;
    let tenAlertAudio = new Audio('sounds/tizes.mp3');
    let gameCdStartAudio = new Audio('sounds/8bit_laser_rico_17.mp3');

    //region HTML objects
    let dynFav;
    let dynFav16;
    let dynFav32;
    let playerName;
    let setName;
    let gameTypeRadios;
    let subscribe;
    let unsubscribe;
    let subscribedList;
    let availablePlayers;
    let lastMatchGameType;
    let lastMatchTimestamp;
    let currentGamePlayers;
    let countdownContainer;
    let challengersList;
    let tenAlert;
    let enableSounds;
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
        lastMatchGameType = $('#last-match-game-type');
        lastMatchTimestamp = $('#last-match-timestamp');
        gameTypeRadios = $('input[name=game-type]');
        currentGamePlayers = $('#latest-match-list .list-group-item .player');
        countdownContainer = $('#countdown-container');
        challengersList = $('#challengers-list');
        tenAlert = $('#ten-alert');
        enableSounds = $('#enable-sounds');

        playerName.val(getSetting('name'));
        let gameType = getSetting('gameType');
        if (gameType.length > 0) {
            $('input[name=game-type][value=' + gameType + ']').prop('checked', true);
        }

        playerName.keyup(function (e) {
            if ((e.keyCode | e.which) === 13) {
                setName.click();
            }
        });

        setName.click(function () {
            let name = playerName.val().trim();
            let gameType = +$('input[name=game-type]:checked').val();
            saveSetting('name', name);
            saveSetting('gameType', gameType);
            if (name.length === 0) return;
            send({
                pid: 'name',
                name: name,
                gameType: gameType
            });
        });

        gameTypeRadios.change(function () {
            setName.click();
        });

        subscribe.click(function () {
            send({pid: 'subscribe'});
        });

        unsubscribe.click(function () {
            send({pid: 'unsubscribe'});
        });

        tenAlert.click(function () {
            send({pid: 'ten-alert'});
        });

        enableSounds.change(function () {
            saveSetting(SETTING_SOUNDS_ENABLED, +isSoundEnabled());
        });

        if (!!+getSetting(SETTING_SOUNDS_ENABLED)) {
            enableSounds.prop('checked', true);
        }

        //websocket connect
        connect();
    });

    function isSoundEnabled() {
        return enableSounds.is(':checked');
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"'`=\/]/g, function (s) {
            return entityMap[s];
        });
    }

    function appendGameTypeStr(gameType) {
        switch (gameType) {
            case 1:
                return ' <span class="nope">🂠</span>';
            case 2:
                return ' <span class="nope">10 🂠</span>';
            default: // 0
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
        gameTypeRadios.prop('disabled', false);
        playerName.focus();
        setName.click();
        send({
            pid: 'get-server-uuid'
        });
    }

    function disableFields() {
        playerName.prop('disabled', true);
        setName.addClass('disabled');
        gameTypeRadios.prop('disabled', true);
        subscribe.addClass('disabled');
        unsubscribe.addClass('disabled');
        tenAlert.prop('disabled', true);
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
            player.html(avatar + escapeHtml(data.name) + appendGameTypeStr(data.gameType));
        } else {
            let html = $('<li class="list-group-item"></li>');
            html.addClass(data.uuid);
            let avatar = '<span class="avatar" style="background: ' + stringToColour(escapeHtml(data.name)) + ';">' + escapeHtml(data.name[0]) + '</span>';
            html.html(avatar + escapeHtml(data.name) + appendGameTypeStr(data.gameType));
            html.appendTo(availablePlayers);
        }
    }

    function handlePlayerAccepted(data) {
        subscribe.removeClass('disabled');
        tenAlert.prop('disabled', !data.tenAlertAvailable);
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
            player.html(avatar + escapeHtml(data.name) + appendGameTypeStr(data.gameType));
        } else {
            let html = $('<li class="list-group-item"></li>');
            html.addClass(data.uuid);
            let avatar = '<span class="avatar" style="background: ' + stringToColour(escapeHtml(data.name)) + ';">' + escapeHtml(data.name[0]) + '</span>';
            html.html(avatar + escapeHtml(data.name) + appendGameTypeStr(data.gameType));
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

    function handleUnsubscribeAll() {
        subscribedList.find('li').remove();
        availablePlayers.find('li').removeClass('subbed');
        changeFavicon(0);
    }

    function handleGame(data) {
        tenAlertAudio.play();
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
        lastMatchGameType.html($('label[for=game-type-' + data.gameType + ']').html());
        lastMatchTimestamp.html(new Date(data.date).toLocaleString());
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
            if (isSoundEnabled() && data.sec === 10) {
                gameCdStartAudio.play();
            }
        }
    }

    function handleTenAlertSound() {
        tenAlertAudio.play();
        tenAlert.prop('disabled', true);
    }

    function handleTenAlertAvailable() {
        tenAlert.prop('disabled', false);
    }

    function onMessage(msg) {
        try {
            let data = JSON.parse(msg.data);
            switch (data.pid) {
                case 'player-connected':
                    return handlePlayerConnected(data);
                case 'player-accepted':
                    return handlePlayerAccepted(data);
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
                case 'unsubscribe-all':
                    return handleUnsubscribeAll();
                case 'game':
                    return handleGame(data);
                case 'chosen-players':
                    return handleChosenPlayers(data);
                case 'server-uuid':
                    return handleServerUUID(data);
                case 'game-countdown':
                    return handleGameCountdown(data);
                case 'ten-alert-sound':
                    return handleTenAlertSound();
                case 'ten-alert-available':
                    return handleTenAlertAvailable();
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