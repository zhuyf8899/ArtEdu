export const canEnterAdmin = (account) => (account?.roles ?? [account?.role]).some((role) => ["admin", "teacher", "operator"].includes(role));
