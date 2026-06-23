import dotenv from 'dotenv';
import pino from 'pino';

dotenv.config();

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty'
  }
});

const requiredEnv = [
  'SQUAD_SECRET_KEY',
  'PAYFLEX_TOKEN'
];

const config = {
  port: process.env.PORT || 3000,
  mockMode: process.env.MOCK_MODE === 'true',
  squad: {
    secretKey: process.env.SQUAD_SECRET_KEY,
    baseUrl: process.env.SQUAD_BASE_URL || 'https://sandbox-api-d.squadco.com'
  },
  payflex: {
    token: process.env.PAYFLEX_TOKEN,
    baseUrl: process.env.PAYFLEX_BASE_URL || 'https://client.peyflex.com.ng'
  },
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  firebaseCredentials: process.env.FIREBASE_CREDENTIALS_JSON
};

if (!config.mockMode) {
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      logger.error(`CRITICAL ERROR: Missing required environment variable ${key}. Set MOCK_MODE=true to bypass.`);
      process.exit(1);
    }
  }
} else {
  logger.info('⚠️ RUNNING IN MOCK MODE - Real API keys are not required.');
}

export { config, logger };
