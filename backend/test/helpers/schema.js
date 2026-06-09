import pkg from 'pg';
const { Client } = pkg;

export async function ensureTestSchema() {
    if (process.env.PGSCHEMA !== 'forlp_test') {
        throw new Error(`ensureTestSchema: refusing to run with PGSCHEMA=${process.env.PGSCHEMA}`);
    }
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    await client.query(`CREATE SCHEMA IF NOT EXISTS forlp_test`);
    await client.end();
}
