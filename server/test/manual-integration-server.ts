// Standalone runner (not part of `npm test`): starts the real Express
// app on an in-memory Postgres, for the frontend integration check in
// e2e/backend-login.spec.ts. Started and killed by that spec.
import { createApp } from '../src/app.js';
import { createTestDb, TEST_USERS } from './helpers.js';

const db = await createTestDb();
const app = createApp(db, { corsOrigins: [process.env.FRONTEND_ORIGIN ?? 'http://localhost:5199'] });
const port = Number(process.env.PORT) || 4111;
app.listen(port, () => {
  console.log(`test-api listening on :${port}`);
  console.log(`READY ${JSON.stringify(TEST_USERS.map((u) => ({ email: u.email, password: u.password, name: u.name })))}`);
});
