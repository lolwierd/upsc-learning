// Shim for Cloudflare types in Node.js environment
declare global {
    type D1Database = import("./types.js").DatabaseLike;
    type Ai = any;
}

export { };
