const _ = require('lodash');

let helpers = {
  doesClientExist: function(io, clientId) {
    return _.keys(io.sockets.sockets).indexOf(clientId) > -1;
  },
  getPartnerIdOfClient: (redisClient, clientId, cb) => {
    redisClient.get('pairs', function(err, pairs) {
      if (err) return cb (false);

      pairs = JSON.parse(pairs);

      for (let i in pairs) {
        let indexOfClient = pairs[i].indexOf(clientId);

        if (indexOfClient > -1) {
          return cb(pairs[i][+!indexOfClient]);
        }
      }

      return cb(false);
    });
  }
};

module.exports = helpers;