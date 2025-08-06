const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.startCleanupInterval();
  }

  createSession(userId, data = {}) {
    this.cleanupSession(userId);
    const session = {
      ...data,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      timeout: setTimeout(() => this.cleanupSession(userId), SESSION_TIMEOUT)
    };
    this.sessions.set(userId, session);
    return session;
  }

  getSession(userId) {
    const session = this.sessions.get(userId);
    if (session) {
      session.lastActivity = Date.now();
      // Reset timeout
      clearTimeout(session.timeout);
      session.timeout = setTimeout(() => this.cleanupSession(userId), SESSION_TIMEOUT);
    }
    return session;
  }

  updateSession(userId, data) {
    const session = this.getSession(userId);
    if (session) {
      Object.assign(session, data);
      return session;
    }
    return null;
  }

  cleanupSession(userId) {
    const session = this.sessions.get(userId);
    if (session) {
      clearTimeout(session.timeout);
      this.sessions.delete(userId);
      console.log(`Session cleaned up for user: ${userId}`);
    }
  }

  startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      for (const [userId, session] of this.sessions.entries()) {
        if (now - session.lastActivity > SESSION_TIMEOUT) {
          this.cleanupSession(userId);
        }
      }
    }, CLEANUP_INTERVAL);
  }

  getActiveSessionCount() {
    return this.sessions.size;
  }
}

module.exports = new SessionManager();