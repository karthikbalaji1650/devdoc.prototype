import { createApp } from './app.js';
import { createPool } from './db.js';

const PORT = Number(process.env.PORT) || 4000;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const corsOrigins = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const app = createApp(createPool(DATABASE_URL), { corsOrigins });

app.listen(PORT, () => {
  console.log(`devdoc-studio-api listening on :${PORT}`);
});
