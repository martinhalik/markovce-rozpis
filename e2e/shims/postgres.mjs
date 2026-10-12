// Stand-in for @vercel/postgres (whose driver only speaks to Neon over
// websockets): the same `sql` tagged template and `db.connect()`, on plain pg
// against E2E_SERVER_DATABASE_URL.
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.E2E_SERVER_DATABASE_URL });

export const sql = (strings, ...values) =>
    pool.query(strings.slice(1).reduce((text, s, i) => `${text}$${i + 1}${s}`, strings[0]), values);

export const db = { connect: () => pool.connect() };
