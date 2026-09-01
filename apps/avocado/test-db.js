import { db } from './src/lib/storage.js';

async function test() {
  try {
     const user = await db.substack.user.get();
     if (!user) { console.log("no user"); return; }
     console.log("User:", user.id);
     
     const cached = await db.substack.subscribers.getAll(user.id);
     console.log("Cached lengths:", cached.length);
  } catch (e) {
     console.error(e);
  }
}
test();
