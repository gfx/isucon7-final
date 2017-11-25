import * as path from 'path'
import * as http from 'http'
import * as bigint from 'bigint'
import * as Koa from 'koa'
import * as router from 'koa-route'
import * as websockify from 'koa-websocket'
import * as serve from 'koa-static'
import * as mysql from 'mysql2/promise'
import  Game from './Game'
import * as mmh3 from 'murmurhash3'
import * as cluster from 'cluster';
import * as os from 'os';

const numCPUs = os.cpus().length;

import 'source-map-support'

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
  });
} else {

  const app = websockify(new Koa())
  const pool = mysql.createPool({
    connectionLimit: 20,
    host: '127.0.0.1',
    port: process.env.ISU_DB_PORT || '3306',
    user: process.env.ISU_DB_USER || 'root',
    password: process.env.ISU_DB_PASSWORD || '',
    database: 'isudb',
    charset: 'utf8mb4',
  });

  const servers = process.env.NODE_ENV === 'production' ?
    ['app0021', 'app0022', 'app0023', 'app0024'] : ['127.0.0.1']
  const endpoints = process.env.NODE_ENV === 'production' ?
    ['app0021.isu7f.k0y.org:5000', 'app0022.isu7f.k0y.org:5000', 'app0023.isu7f.k0y.org:5000', 'app0024.isu7f.k0y.org:5000'] : ['']

  const getInitializeHandler = async (ctx) => {
    for (let srv of servers) {
      const initDB = mysql.createPool({
        connectionLimit: 20,
        host: srv,
        port: process.env.ISU_DB_PORT || '3306',
        user: process.env.ISU_DB_USER || 'root',
        password: process.env.ISU_DB_PASSWORD || '',
        database: 'isudb',
        charset: 'utf8mb4',
      })
      await initDB.query('TRUNCATE TABLE adding')
      await initDB.query('TRUNCATE TABLE buying')
      await initDB.query('TRUNCATE TABLE room_time')
    }
    ctx.status = 204
  }

  const getRoomHandler = async (ctx, roomName) => {
    roomName = typeof roomName !== 'string' ? '' : roomName

    const roomHash = mmh3.murmur32Sync(roomName);
    const roomServer = endpoints[roomHash % endpoints.length];

    ctx.body = {
      host: `${roomServer}`,
      path: `/ws/${roomName}`
    }
  }

  const wsGameHandler = async (ctx, roomName) => {
    roomName = typeof roomName !== 'string' ? '' : roomName

    ctx.websocket.on('message', async (message) => {
      try {
        const { request_id, action, time, isu, item_id, count_bought } = JSON.parse(message)
        let is_success = false
        switch (action) {
          case 'addIsu':
            is_success = await game.addIsu(bigint(isu), time)
            break;
          case 'buyItem':
            is_success = await game.buyItem(item_id, count_bought || 0, time)
            break;
          default:
            console.error('Invalid Action')
        }

        if (is_success) {
          // GameResponse を返却する前に 反映済みの GameStatus を返す
          await send(ctx.websocket, await game.getStatus())
        }

        await send(ctx.websocket, { request_id, is_success })
      } catch (e) {
        console.error(e)
        ctx.app.emit('error', e, ctx)
        ctx.throw(e)
      }
    })

    ctx.websocket.on('close', async () => {
      clearTimeout(tid)
    })

    const send = (ws, messageObj) => {
      if (ws.readyState === ws.constructor.OPEN) {
        return new Promise((resolve, reject) => {
          ws.send(JSON.stringify(messageObj), (e) => {
            e ? reject(e) : resolve()
          })
        })
      }
      console.log('Connection already closed')
      return Promise.resolve()
    }
    const loop = async () => {
      if (ctx.websocket.readyState === ctx.websocket.constructor.OPEN) {
        await send(ctx.websocket, await game.getStatus())
      }

      if (![ctx.websocket.constructor.CLOSING, ctx.websocket.constructor.CLOSED].includes(ctx.websocket.readyState)) {
        tid = setTimeout(loop, 500)
      }
    }
    const game = new Game(roomName, pool)
    let tid = setTimeout(loop, 500)

    await send(ctx.websocket, await game.getStatus())
  }

  app
    .use(serve(path.resolve(__dirname, '..', 'public')))
    .use(router.get('/initialize', getInitializeHandler))
    .use(router.get('/room', getRoomHandler))
    .use(router.get('/room/:room_name', getRoomHandler))

  app.ws
    .use(router.all('/ws', wsGameHandler))
    .use(router.all('/ws/:room_name', wsGameHandler))

  // const server = http.createServer(app.callback()).listen(5000)
  app.listen(5000)

  console.log(`Worker ${process.pid} started`);
}
