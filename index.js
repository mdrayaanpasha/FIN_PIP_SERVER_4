import { createClient } from 'redis';
import { Kafka } from 'kafkajs';
import { OHLVCData, Indicators } from './services/store_data.js';
import fs from "fs";
import dotenv from 'dotenv';
dotenv.config();

// Write certs from env to /tmp at startup
fs.writeFileSync('/tmp/service.cert', Buffer.from(process.env.SERVICE_CERT, 'base64'));
fs.writeFileSync('/tmp/service.key', Buffer.from(process.env.SERVICE_KEY, 'base64'));

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();

const kafka = new Kafka({
  brokers: [process.env.KAFKA_URL],
  ssl: {
    ca: [fs.readFileSync('./ca.pem', 'utf-8')],
    cert: fs.readFileSync('/tmp/service.cert', 'utf-8'),
    key: fs.readFileSync('/tmp/service.key', 'utf-8'),
  }
});
const consumer = kafka.consumer({ groupId: 'persistence-group' });

await consumer.connect();
await consumer.subscribe({ topic: 'persistence', fromBeginning: false });

await consumer.run({
  eachMessage: async ({ message }) => {
    
    // 1. Pull OHLCV from Redis → store to DB
    const batch = JSON.parse(await client.get('latest_ohlcv'));
    if (!batch) return console.log('No OHLCV data in Redis yet');

    for (const row of batch) {
      try {
        await OHLVCData(
          row.ticker,
          new Date(row.date),
          row.open,
          row.high,
          row.low,
          row.volume,
          row.close
        );
      } catch (e) {
        // unique constraint — row already persisted, skip
        if (!e.message.includes('Unique constraint')) console.error(`OHLCV insert failed [${row.ticker}]:`, e.message);
      }
    }
    console.log(`Persisted ${batch.length} OHLCV rows`);

    // 2. Pull indicators from Redis → store to DB
    const tickers = [...new Set(batch.map(d => d.ticker))];

    for (const ticker of tickers) {
      const raw = await client.get(`indicators:${ticker}`);
      if (!raw) {
        console.log(`[${ticker}] No indicators in Redis yet, skipping`);
        continue;
      }

      const ind = JSON.parse(raw);

      try {
        await Indicators(
          ind.ticker,
          new Date(ind.updatedAt),
          ind.RSI_14,
          ind.EMA_14,
          ind.SMA_14
        );
      } catch (e) {
        if (!e.message.includes('Unique constraint')) console.error(`Indicators insert failed [${ticker}]:`, e.message);
      }

      console.log(`[${ticker}] indicators persisted`);
    }
  }
});