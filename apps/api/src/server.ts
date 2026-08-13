import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { assertDatabaseConnection, closePool } from './db/pool';
import { logger } from './lib/logger/logger';
import { closeSocketServer, initSocketServer } from './realtime/socket-server';

// The database is checked before the port opens, so a misconfigured deployment never reaches a
// health check in a state where it accepts traffic it cannot serve.

async function bootstrap(): Promise<void> {
  await assertDatabaseConnection();

  const app = createApp();
  const httpServer = createServer(app);

  initSocketServer(httpServer);

  httpServer.listen(env.port, () => {
    logger.info(
      {
        port: env.port,
        env: env.nodeEnv,
        aiEnabled: env.ai.isConfigured,
        allowedOrigins: env.webOrigins,
      },
      `Appointly API listening on http://localhost:${env.port}`,
    );

    if (!env.ai.isConfigured) {
      logger.warn(
        'MISTRAL_API_KEY is not set — the booking assistant will run in deterministic fallback mode',
      );
    }
  });

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    // A second SIGTERM during shutdown must not restart the sequence.
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Shutting down');

    // If a connection refuses to drain, the platform's kill timer should not be what ends the process.
    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    try {
      await closeSocketServer();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
      await closePool();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  // An unhandled rejection leaves an unknown state; log it and let the supervisor restart a clean process.
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    void shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    void shutdown('uncaughtException');
  });
}

bootstrap().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Failed to start the API');
  process.exit(1);
});
