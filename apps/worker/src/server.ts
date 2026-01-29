import { serve } from '@hono/node-server';
import { config as dotenvConfig } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenvConfig();

// Import database, app, and scheduler
import { initDatabase, getDatabase, closeDatabase } from './lib/database.js';
import app from './index.js';
import type { Env } from './types.js';
import { initializeScheduler, stopScheduler } from './services/scheduler.js';
import { runStaleRecovery } from './services/stale-recovery.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment configuration with defaults
const environment = process.env.ENVIRONMENT || 'development';
const env: Env = {
    DB: null as any, // Will be set after init
    AI: undefined, // Not used in Node.js version
    GCP_SERVICE_ACCOUNT: process.env.GCP_SERVICE_ACCOUNT || '',
    GOOGLE_VERTEX_LOCATION: process.env.GOOGLE_VERTEX_LOCATION || 'global',
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
    ENVIRONMENT: environment,
    ENABLE_FACT_CHECK: process.env.ENABLE_FACT_CHECK || '1',
    LLM_DEBUG: process.env.LLM_DEBUG || '0',
    LOCAL_LLM_DUMP_URL: process.env.LOCAL_LLM_DUMP_URL || (environment === 'development' ? 'http://127.0.0.1:8790/dump' : undefined),
    GENERATION_MODEL: process.env.GENERATION_MODEL || 'gemini-3-pro-preview',
    FACT_CHECK_MODEL: process.env.FACT_CHECK_MODEL || 'gemini-3-flash-preview',
    ENABLE_WEB_GROUNDING: process.env.ENABLE_WEB_GROUNDING,
    LLM_DUMP: process.env.LLM_DUMP,
    LLM_MAX_RETRIES: process.env.LLM_MAX_RETRIES,
    LLM_RETRY_DELAY_MS: process.env.LLM_RETRY_DELAY_MS,
};

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
    console.log('🚀 Starting UPSC MCQ API Server (Node.js)...\n');

    // Validate required env vars
    if (!env.GCP_SERVICE_ACCOUNT) {
        console.error('❌ GCP_SERVICE_ACCOUNT environment variable is required');
        process.exit(1);
    }

    // Initialize database with migrations
    // Prefer explicit MIGRATIONS_DIR, otherwise resolve from common layouts.
    const migrationCandidates = [
        process.env.MIGRATIONS_DIR,
        path.resolve(__dirname, '../../../packages/db/migrations'),
        path.resolve(process.cwd(), 'packages/db/migrations'),
    ].filter((candidate): candidate is string => Boolean(candidate));
    const migrationsDir = migrationCandidates.find((candidate) => fs.existsSync(candidate));
    if (!migrationsDir) {
        console.error('❌ Migrations directory not found. Checked:');
        for (const candidate of migrationCandidates) {
            console.error(`  - ${candidate}`);
        }
        process.exit(1);
    }
    try {
        env.DB = await initDatabase(migrationsDir);
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        process.exit(1);
    }

    // Initialize scheduler for quiz sets
    try {
        await initializeScheduler(env);
    } catch (error) {
        console.error('⚠️ Failed to initialize scheduler (non-fatal):', error);
    }

    // Recover any stale quizzes/runs from previous worker instances
    try {
        await runStaleRecovery(env);
    } catch (error) {
        console.error('⚠️ Failed to run stale recovery (non-fatal):', error);
    }

    // Create a modified Hono app that injects env
    const server = serve({
        fetch: (request: Request) => {
            // Inject environment into request context
            // @ts-ignore - Hono expects env in Bindings
            return app.fetch(request, env);
        },
        port: PORT,
        hostname: HOST,
    });

    console.log(`\n✅ Server running at http://${HOST}:${PORT}`);
    console.log(`📊 Environment: ${env.ENVIRONMENT}`);
    console.log(`🔑 Service Account: ${env.GCP_SERVICE_ACCOUNT ? '***configured***' : 'NOT SET'}`);
    console.log(`🤖 Generation Model: ${env.GENERATION_MODEL}`);
    console.log(`🔍 Fact Check Model: ${env.FACT_CHECK_MODEL}`);
    console.log(`🌐 CORS Origins: ${env.CORS_ORIGIN}\n`);

    // Graceful shutdown
    const shutdown = () => {
        console.log('\n🛑 Shutting down gracefully...');
        stopScheduler();
        closeDatabase();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});
