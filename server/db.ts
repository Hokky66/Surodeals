import dotenv from 'dotenv';
dotenv.config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

const localDbUrl = process.env.DATABASE_URL;
const supabaseDbUrl = process.env.SUPABASE_DATABASE_URL;

if (!localDbUrl && !supabaseDbUrl) {
  throw new Error(
    "At least one database URL must be set (DATABASE_URL or SUPABASE_DATABASE_URL)",
  );
}

export const localPool = localDbUrl ? new Pool({ connectionString: localDbUrl }) : null;
export const localDb = localPool ? drizzle({ client: localPool, schema }) : null;

export const supabasePool = supabaseDbUrl ? new Pool({ connectionString: supabaseDbUrl }) : null;
export const supabaseDb = supabasePool ? drizzle({ client: supabasePool, schema }) : null;

export const db = localDb || supabaseDb;
export const pool = localPool || supabasePool;

export function getDatabase(useSupabase: boolean = false) {
  if (useSupabase && supabaseDb) {
    return { db: supabaseDb, pool: supabasePool };
  }
  return { db: localDb || supabaseDb, pool: localPool || supabasePool };
}

export async function syncDatabases() {
  if (!localDb || !supabaseDb) {
    console.log("⚠️  Both databases not configured for sync");
    return;
  }
  
  console.log("🔄 Database sync functionality available");
  // Sync logic kan hier toegevoegd worden
}
