import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from project root before any test runs
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
