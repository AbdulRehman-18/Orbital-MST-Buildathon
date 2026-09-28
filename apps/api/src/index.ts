import app from "./app";
import { config } from "./config";
import { logger } from "./lib/logger";

const server = app.listen(config.port, "0.0.0.0", () => {
  logger.info(
    { port: config.port, chain: config.network.name, chainId: config.network.id, demoMode: config.demoMode },
    "Namma Seva API listening",
  );
});

function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down");
  server.close(() => process.exit(0));
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
