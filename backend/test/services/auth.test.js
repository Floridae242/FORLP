import { describe, it, expect } from 'vitest';
import {
    upsertUser,
    createSession,
    verifySession,
    logoutUser,
    getUserById,
} from '../../src/services/authService.js';

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
