const express = require('express');
const cors = require('cors');
const http = require('http');
const app = express();
const server = http.createServer(app);
const io = require('socket.io').listen(server);

const routes = require('./src/app');

const PARAMS = process.env;
const PORT = PARAMS.port || 3000;

app.use(cors({
  origin: 'http://localhost:3002',
  optionsSuccessStatus: 200,
  credentials: true
}));

server.listen(PORT, function() {
  console.log('Server running on port ' + PORT);

  require('./src/app')(app, io);
});