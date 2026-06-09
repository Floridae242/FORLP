import { describe, it, expect } from 'vitest';
import {
    upsertUser,
    createSession,
    verifySession,
    logoutUser,
    getUserById,
    updateUserRole,
} from '../../src/services/authService.js';
import { getPool } from '../../src/db/index.js';

describe('auth session lifecycle', () => {
    it('upsert → create session → verify → logout → verify fails', async () => {
        // 1. Upsert
        const user = await upsertUser('U_test_001', 'Test User', null);
        expect(user.line_user_id).toBe('U_test_001');

        // 2. Create session
        const { sessionToken } = await createSession(user.id);
        expect(typeof sessionToken).toBe('string');
        expect(sessionToken.length).toBeGreaterThan(20);

        // 3. Verify
        const valid = await verifySession(sessionToken);
        expect(valid.valid).toBe(true);
        expect(valid.user.lineUserId).toBe('U_test_001');

        // 4. Logout
        await logoutUser(sessionToken);

        // 5. Verify after logout
        const invalid = await verifySession(sessionToken);
        expect(invalid.valid).toBe(false);
    });

    it('getUserById returns null for a missing id', async () => {
        const u = await getUserById(99999);
        expect(u).toBeNull();
    });
});

describe('officer token consumption', () => {
    it('consumes the token on first success and rejects reuse', async () => {
        // Seed: one user + one usable officer token
        const user = await upsertUser('U_officer', 'Officer A', null);
        await getPool().query(
            `INSERT INTO officer_tokens (token, description) VALUES ('TESTOFC01', 'test')`
        );

        // First use — succeeds, marks token used
        const r1 = await updateUserRole(user.id, 'officer', 'TESTOFC01');
        expect(r1.success).toBe(true);

        // Second use — same token, different user, must fail
        const user2 = await upsertUser('U_officer2', 'Officer B', null);
        const r2 = await updateUserRole(user2.id, 'officer', 'TESTOFC01');
        expect(r2.success).toBe(false);
        expect(r2.error).toMatch(/ใช้งานแล้ว|หมดอายุ|ไม่ถูกต้อง/);
    });
});
