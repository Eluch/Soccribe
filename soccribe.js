(function () {

    var onlyAlert = false;
    var ws;

    var playerName;
    var setName;
    var subscribe;
    var unsubscribe;
    var subscribedList;
    var availablePlayers;

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

    function changeFavicon(number) {
        $('#dynamic-favicon').attr('href', 'favicons/favicon-' + +number + '.ico');
        $('#dynamic-favicon-32').attr('href', 'favicons/favicon-' + +number + '-32x32.png');
        $('#dynamic-favicon-16').attr('href', 'favicons/favicon-' + +number + '-16x16.png');
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
        console.log('opened');
        playerName.prop('disabled', false);
        setName.removeClass('disabled');
        playerName.focus();
    }

    function onError() {
        console.log('error');
    }

    function onClose() {
        console.log('close');
        // reconnect?
        playerName.prop('disabled', true);
        setName.addClass('disabled');
        subscribe.addClass('disabled');
        unsubscribe.addClass('disabled');
        subscribedList.html('');
        availablePlayers.html('');
    }

    function onMessage(msg) {
        try {
            var data = JSON.parse(msg.data);
            console.log(data);
            if (data.pid == 'player-connected') {
                var player = $('.' + data.uuid);
                if (player.length) {
                    player.html(data.name);
                } else {
                    var html = $('<li class="list-group-item"></li>');
                    html.addClass(data.uuid);
                    html.html(escapeHtml(data.name));
                    html.appendTo(availablePlayers);
                }
            } else if (data.pid == 'player-accepted') {
                subscribe.removeClass('disabled');
            } else if (data.pid == 'player-disconnected') {
                $('.' + data.uuid).remove();
                changeFavicon(data.amount);
            } else if (data.pid == 'player-subscribed') {
                var player = subscribedList.find('.' + data.uuid);
                if (player.length) {
                    player.html(data.name);
                } else {
                    var html = $('<li class="list-group-item"></li>');
                    html.addClass(data.uuid);
                    html.html(escapeHtml(data.name));
                    html.appendTo(subscribedList);
                }
                changeFavicon(data.amount);
            } else if (data.pid == 'subscribe-accepted') {
                subscribe.addClass('disabled');
                unsubscribe.removeClass('disabled');
            } else if (data.pid == 'player-unsubscribed') {
                subscribedList.find('.' + data.uuid).remove();
                changeFavicon(data.amount);
            } else if (data.pid == 'unsubscribe-accepted') {
                subscribe.removeClass('disabled');
                unsubscribe.addClass('disabled');
            } else if (data.pid == 'game') {
                if (onlyAlert || Notification.permission !== "granted") {
                    alert("GAME: " + data.notification);
                } else {
                    var notification = new Notification("Game!", {
                        body: data.notification,
                        icon: window.location.href + 'soccer-court.png'
                    });
                    notification.onclick = function() {
                        window.focus();
                        notification.close();
                    };
                }
                subscribe.removeClass('disabled');
                unsubscribe.addClass('disabled');
            } else if (data.pid == 'clear-subscribe') {
                subscribedList.find('li').remove();
                changeFavicon(0);
            }
        } catch (e) {}
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

        playerName.keyup(function(e) {
            if ((e.keyCode | e.which) === 13 ) {
                setName.click();
            }
        });

        setName.click(function() {
            var name = playerName.val().trim();
            if (name.length === 0) return;
            send({
                pid: 'name',
                name: name
            });
        });

        subscribe.click(function() {
            send({
                pid: 'subscribe'
            });
        });

        unsubscribe.click(function() {
            send({
                pid: 'unsubscribe'
            });
        });

        //websocket connect
        connect();
    });
})();