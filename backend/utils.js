// backend/utils.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "change-me";

/** Middleware auth (JWT Bearer) — ESM friendly */
export function auth(required = true) {
  return (req, res, next) => {
    try {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token) {
        return required ? res.status(401).json({ error: "no token" }) : next();
      }
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload; // { id, role, username, iat, exp }
      next();
    } catch (e) {
      return res.status(401).json({ error: "invalid token" });
    }
  };
}

/** Role guard opțional (dacă vrei să-l folosești în alte rute) */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };
}

/** Util: format bani 1.000.000$ */
export function formatMoneyUSD(n) {
  if (typeof n !== "number") return "0$";
  return n.toLocaleString("ro-RO") + "$";
}
