var timeoutNames = {};
var intervalNames = {};

module.exports = {

    clearNamedTimeout: function (name) {
        if (timeoutNames[name] === undefined) {
            timeoutNames[name] = null;
        }

        if (timeoutNames[name] !== null) {
            clearTimeout(timeoutNames[name]);
            timeoutNames[name] = null;
        }
    },

    setNamedTimeout: function (name, callback, delay) {
        this.clearNamedTimeout(name);
        timeoutNames[name] = setTimeout(callback, delay);
    },

    clearNamedInterval: function (name) {
        if (intervalNames[name] === undefined) {
            intervalNames[name] = null;
        }

        if (intervalNames[name] !== null) {
            clearInterval(intervalNames[name]);
            intervalNames[name] = null;
        }
    },

    setNamedInterval: function (name, callback, delay) {
        this.clearNamedInterval(name);
        intervalNames[name] = setInterval(callback, delay);
    },

};
