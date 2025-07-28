require('dotenv').config();

console.log('DATABASE_URL:', process.env.DATABASE_URL); // debug

/** @type {import('drizzle-kit').Config} */
module.exports = {
  schema: './shared/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
};





