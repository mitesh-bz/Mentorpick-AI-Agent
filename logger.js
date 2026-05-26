const log4js = require('log4js');

log4js.configure({
    appenders: {
        console: { 
            type: 'console',
            layout: { type: 'pattern', pattern: '%[%d{hh:mm:ss.SSS} [%p]%] %m' }
        }
    },
    categories: {
        default: { appenders: ['console'], level: 'info' }
    }
});

module.exports = log4js.getLogger();