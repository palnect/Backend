import Redis from 'ioredis';
import { config } from '../../config';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('redis');

let _client: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (!_client) {
    _client = new Redis(config.redis.url, {
      password: config.redis.password || undefined,
      retryStrategy: (times) => {
        if (times > 10) return null;
        return Math.min(times * 100, 3000);
      },
      enableOfflineQueue: true,
      lazyConnect: false,
    });

    _client.on('connect', () => log.info('Redis connected'));
    _client.on('ready', () => log.info('Redis ready'));
    _client.on('error', (err) => log.error('Redis error', { err: err.message }));
    _client.on('close', () => log.warn('Redis connection closed'));
    _client.on('reconnecting', () => log.info('Redis reconnecting'));
  }
  return _client;
};

export const closeRedis = async (): Promise<void> => {
  if (_client) {
    await _client.quit();
    _client = null;
    log.info('Redis disconnected');
  }
};