const randomString = require('randomstring');
const _ = require('lodash');
const youtubeInfo = require('youtube-info');
const urlParser = require('js-video-url-parser');
const redis = require('redis');
const redisClient =  redis.createClient();

const helpers = require('./helpers');

module.exports = function(app, io) {
  // initialize pairs array in redis
  redisClient.set('pairs', '[]');

  io.on('connection', (socket) => {
    socket.on('requestConnectionKey', function() {
      // generate a random uppercase string as a key
      let sessionKey = randomString.generate(5).toUpperCase();

      //save the key so the partner can join
      redisClient.set('session-' + sessionKey, socket.id);

      // send the key to client
      socket.emit('connectionKeyReceive', sessionKey);
    });

    socket.on('revokeMyConnectionKey', function(key) {
      redisClient.exists('session-' + key, function(err, exists) {
        if (err) throw err;

        if (exists) {
          redisClient.del('session-' + key);
        }
      });
    });

    socket.on('joinSession', function(key) {
      if (!key) {
        return socket.emit('joinSessionReply', false);
      }

      redisClient.exists('session-' + key.toUpperCase(), function(err, exists) {
        if (err) throw err;

        // check if the key is provided and exists in redis
        if (!exists) {
          return socket.emit('joinSessionReply', false);
        }

        redisClient.get('session-' + key, function(err, partnerId) {
          if (err) throw err;
          
          redisClient.get('pairs', function(err, pairs) {
            if (err) throw err;

            // get old pairs value from redis, and push the new pair into it
            let newPairs = JSON.parse(pairs);
            newPairs.push([socket.id, partnerId]);
            redisClient.set('pairs', JSON.stringify(newPairs));

            // let both users know that connection has been established
            socket.emit('joinSessionReply', true);
            socket.emit('connectionWithPartnerResolve');
            socket.broadcast.to(partnerId).emit('connectionWithPartnerResolve');
          });
        });
      });
    });

    socket.on('videoProposal', function(link) {
      if (!link || link.length < 5) {
        return socket.emit('videoProposalResolve', 'link_wrong');
      }

      helpers.getPartnerIdOfClient(redisClient, socket.id, (partnerId) => {
        if (!partnerId || !helpers.doesClientExist(io, partnerId)) {
          return socket.emit('videoProposalResolve', 'partner_not_found');
        }

        let linkInfo = urlParser.parse(link);

        // check if it's a link to youtube
        if (!linkInfo || (linkInfo && linkInfo.provider !== 'youtube')) {
          return socket.emit('videoProposalResolve', 'link_wrong');
        }

        // parse youtube video metadata
        return youtubeInfo(linkInfo.id, function(err, data) {
          if (err) {
            return socket.emit('videoProposalResolve', 'not_youtube_link');
          }

          // send the proposal to the partner
          socket.broadcast.to(partnerId).emit('videoProposalReceive', {
            url: data.url,
            id: data.videoId,
            owner: data.owner,
            thumbnailUrl: data.thumbnailUrl,
            duration: data.duration,
            views: data.views,
            title: data.title
          });

          // inform that the proposal has been successfully sent
          return socket.emit('videoProposalResolve', true);
        });
      });
    });

    socket.on('videoProposalAccept', function(videoProposal) {
      helpers.getPartnerIdOfClient(redisClient, socket.id, (partnerId) => {
        if (!partnerId || !helpers.doesClientExist(io, partnerId)) {
          return socket.emit('videoProposalAcceptResolve', 'partner_not_found');
        }

        // inform that the proposal has been accepted
        // and start the video on both clients
        socket.emit('videoProposalAcceptResolve', true);
        socket.emit('videoStart', videoProposal);

        return socket.broadcast.to(partnerId).emit('videoStart', videoProposal);
      });
    });

    socket.on('videoReady', function() {
      // send play event once both clients have loaded the video
      helpers.getPartnerIdOfClient(redisClient, socket.id, (partnerId) => {
        redisClient.exists('play-' + partnerId, function(err, exists) {
          if (err) throw err;

          if (exists) {
            redisClient.del('play-' + partnerId);
            socket.emit('videoPlay');
            return socket.broadcast.to(partnerId).emit('videoPlay');
          }

          redisClient.set('play-' + socket.id, true);
        });
      });
    });

    socket.on('videoPlay', function() {
      helpers.getPartnerIdOfClient(redisClient, socket.id, (partnerId) => {
        return socket.broadcast.to(partnerId).emit('videoPlay');
      });
    });

    socket.on('videoSeek', function(timestamp) {
      // send the new time to the partner
      helpers.getPartnerIdOfClient(redisClient, socket.id, (partnerId) => {
        socket.broadcast.to(partnerId).emit('videoSeek', timestamp);

        helpers.getPartnerIdOfClient(redisClient, socket.id, (partnerId) => {
          redisClient.exists('play-' + partnerId, function(err, exists) {
            if (err) throw err;
  
            if (exists) {
              redisClient.del('play-' + partnerId);
              socket.emit('videoPlay');
              return socket.broadcast.to(partnerId).emit('videoPlay');
            }
  
            redisClient.set('play-' + socket.id, true);
          });
        });
      });
    });

    socket.on('videoPause', function() {
      helpers.getPartnerIdOfClient(redisClient, socket.id, (partnerId) => {
        socket.broadcast.to(partnerId).emit('videoPause');
      });
    });
  });
};