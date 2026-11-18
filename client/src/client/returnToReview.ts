// Remembers that the client jumped from "Check and submit" into a chapter, so every screen can offer the way back.
const KEY = 'rishari.returnToReview';
export const returnToReview = {
  start(pid: string) { try { sessionStorage.setItem(KEY, pid); } catch { /* storage unavailable */ } },
  clear() { try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ } },
  active(pid: string) { try { return sessionStorage.getItem(KEY) === pid; } catch { return false; } },
};
