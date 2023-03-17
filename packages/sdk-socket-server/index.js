/* eslint-disable node/no-process-env */
require('dotenv').config();
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');

const isDevelopment = process.env.NODE_ENV === 'development';

const app = express();

const server = http.createServer(app);
const { Server } = require('socket.io');
const { RateLimiterMemory } = require('rate-limiter-flexible');

const rateLimiter = new RateLimiterMemory({
  points: 5, // 5 points
  duration: 1, // per second
});

const rateLimiterMesssage = new RateLimiterMemory({
  points: 50, // 5 points
  duration: 1, // per second
});

const io = new Server(server, {
  cors: {
    origin: '*',
  },
});
const cors = require('cors');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());
app.options('*', cors());

const uuid = require('uuid');

const helmet = require('helmet');

const Analytics = require('analytics-node');

console.log('isDevelopment?', isDevelopment);

const analytics = new Analytics(
  isDevelopment
    ? process.env.SEGMENT_API_KEY_DEBUG
    : process.env.SEGMENT_API_KEY_PRODUCTION,
  {
    flushAt: isDevelopment ? 1 : 20,
    errorHandler: (err) => {
      console.error('Analytics-node flush failed.');
      console.error(err);
    },
  },
);

app.use(helmet());
app.disable('x-powered-by');

app.get('/', (_req, res) => {
  res.json({ success: true });
});

// flushes all Segment events when Node process is interrupted for any reason
// https://segment.com/docs/connections/sources/catalog/libraries/server/node/#long-running-process
const exitGracefully = async (code) => {
  console.log('Flushing events');
  await analytics.flush(function (err) {
    console.log('Flushed, and now this program can exit!');

    if (err) {
      console.log(err);
    }
    // eslint-disable-next-line node/no-process-exit
    process.exit(code);
  });
};

[
  'beforeExit',
  'uncaughtException',
  'unhandledRejection',
  'SIGHUP',
  'SIGINT',
  'SIGQUIT',
  'SIGILL',
  'SIGTRAP',
  'SIGABRT',
  'SIGBUS',
  'SIGFPE',
  'SIGUSR1',
  'SIGSEGV',
  'SIGUSR2',
  'SIGTERM',
].forEach((evt) => process.on(evt, exitGracefully));

app.post('/debug', (_req, res) => {
  try {
    const { body } = _req;

    if (!body.event) {
      return res.status(400).json({ error: 'event is required' });
    }

    const id = body.id || 'socket.io-server';
    const userIdHash = crypto.createHash('sha1').update(id).digest('hex');

    analytics.track(
      {
        userId: userIdHash,
        event: body.event,
        ...(body.url && { url: body.url }),
        ...(body.title && { title: body.title }),
        ...(body.platform && { platform: body.platform }),
        ...(body.commLayer && { commLayer: body.commLayer }),
        ...(body.sdkVersion && { sdkVersion: body.sdkVersion }),
      },
      function (err, batch) {
        if (isDevelopment) {
          console.log(batch);
        }

        if (err) {
          console.log(err);
        }
      },
    );

    return res.json({ success: true });
  } catch (error) {
    return res.json({ error });
  }
});

io.on('connection', (socket) => {
  const socketId = socket.id;
  const clientIp = socket.request.socket.remoteAddress;
  console.log('a user connected');
  if (isDevelopment) {
    console.log(`socketId=${socketId} clientIp=${clientIp}`);
  }

  socket.on('create_channel', async (id) => {
    await rateLimiter.consume(socket.handshake.address);

    if (isDevelopment) {
      console.log('create channel', id);
    }

    if (!uuid.validate(id)) {
      return socket.emit(`message-${id}`, { error: 'must specify a valid id' });
    }

    const room = io.sockets.adapter.rooms.get(id);
    if (!id) {
      return socket.emit(`message-${id}`, { error: 'must specify an id' });
    }

    if (room) {
      return socket.emit(`message-${id}`, { error: 'room already created' });
    }
    socket.join(id);
    return socket.emit(`channel_created-${id}`, id);
  });

  socket.on('message', async ({ id, message, context, plaintext }) => {
    try {
      await rateLimiterMesssage.consume(socket.handshake.address);
    } catch (e) {
      return;
    }

    if (isDevelopment) {
      // Minify encrypted message for easier readibility
      let displayMessage = message;
      if (plaintext) {
        displayMessage = 'AAAAAA_ENCRYPTED_AAAAAA';
      }

      if (context === 'mm-mobile') {
        console.log(`\x1b[33m message-${id} -> \x1b[0m`, {
          id,
          context,
          displayMessage,
          plaintext,
        });
      } else {
        console.log(`message-${id} -> `, {
          id,
          context,
          displayMessage,
          plaintext,
        });
      }
    }
    socket.to(id).emit(`message-${id}`, { id, message });
  });

  socket.on('ping', async ({ id, message, context }) => {
    try {
      await rateLimiterMesssage.consume(socket.handshake.address);
    } catch (e) {
      return;
    }

    if (isDevelopment) {
      console.log(`ping-${id} -> `, { id, context, message });
    }
    socket.to(id).emit(`ping-${id}`, { id, message });
  });

  socket.on('join_channel', async (id, test) => {
    try {
      await rateLimiter.consume(socket.handshake.address);
    } catch (e) {
      return;
    }

    if (isDevelopment) {
      console.log(`join_channel ${id} ${test}`);
    }

    if (!uuid.validate(id)) {
      socket.emit(`message-${id}`, { error: 'must specify a valid id' });
      return;
    }

    const room = io.sockets.adapter.rooms.get(id);
    if (isDevelopment) {
      console.log(`join_channel ${id} room.size=${room && room.size}`);
    }

    if (room && room.size > 2) {
      if (isDevelopment) {
        console.log(`join_channel ${id} room already full`);
      }
      socket.emit(`message-${id}`, { error: 'room already full' });
      io.sockets.in(id).socketsLeave(id);
      return;
    }

    socket.join(id);

    if (!room || room.size < 2) {
      socket.emit(`clients_waiting_to_join-${id}`, room ? room.size : 1);
    }

    socket.on('disconnect', function (error) {
      if (isDevelopment) {
        console.log(`disconnect event channel=${id}: `, error);
      }
      io.sockets.in(id).emit(`clients_disconnected-${id}`, error);
      // io.sockets.in(id).socketsLeave(id);
    });

    if (room && room.size === 2) {
      io.sockets.in(id).emit(`clients_connected-${id}`, id);
    }
  });

  socket.on('leave_channel', (id) => {
    if (isDevelopment) {
      console.log(`leave_channel id=${id}`);
    }

    socket.leave(id);
    io.sockets.in(id).emit(`clients_disconnected-${id}`);
  });
});

// eslint-disable-next-line node/no-process-env
const port = process.env.port || 4000;
server.listen(port, () => {
  console.log(`listening on *:${port}`);
});
