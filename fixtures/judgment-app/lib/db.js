// A stand-in database client for the fixture.
export const db = { notes: { findMany: async () => [] }, users: { findUnique: async () => null } };
