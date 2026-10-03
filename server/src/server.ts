import { releaseExpiredDemoOrders } from './commerce.js';
import { app } from './app.js';
import { db } from './db.js';
import { createServer } from 'node:http';
const server = createServer(app);
const port = Number(process.env.PORT || 5002);
server.listen(port, () => console.log('shopstack API on ' + port));
const cleanup = setInterval(() => releaseExpiredDemoOrders().catch(console.error), 60000);
cleanup.unref();
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    clearInterval(cleanup);
    server.close(async () => {
      await db.$disconnect();
      process.exit(0);
    });
  });
