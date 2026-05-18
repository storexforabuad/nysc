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
  'MONNIFY_API_KEY',
  'MONNIFY_SECRET_KEY',
  'MONNIFY_CONTRACT_CODE',
  'PAYFLEX_API_KEY',
  'PAYFLEX_SECRET_KEY'
];

const config = {
  port: process.env.PORT || 3000,
  mockMode: process.env.MOCK_MODE === 'true',
  monnify: {
    apiKey: process.env.MONNIFY_API_KEY,
    secretKey: process.env.MONNIFY_SECRET_KEY,
    contractCode: process.env.MONNIFY_CONTRACT_CODE,
    baseUrl: process.env.MONNIFY_BASE_URL || 'https://api.monnify.com'
  },
  payflex: {
    apiKey: process.env.PAYFLEX_API_KEY,
    secretKey: process.env.PAYFLEX_SECRET_KEY,
    baseUrl: process.env.PAYFLEX_BASE_URL || 'https://api.payflex.ng'
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
