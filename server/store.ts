// Saved player profiles: level, stats (and soon rank). With MONGODB_URI set they live in
// MongoDB (a free Atlas cluster in production); without it, in data/profiles.json, so the game
// runs locally with nothing to set up. A profile is found by a hash of the player's secret
// profile key (kept in their browser); the key itself is never stored.

import { createHash } from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';

export interface SavedProfile {
  _id: string;
  name: string;
  /** Matches finished, matches won (top of the final scoreboard), points scored in all. */
  matches: number;
  wins: number;
  points: number;
  /** Ranked REP (src/data/ranks.ts), and whether the demotion shield has been used. */
  rep: number;
  shield: boolean;
  stats: { banked: number; contracts: number; revenges: number };
  createdAt: number;
  seenAt: number;
}

export interface Store {
  kind: 'mongo' | 'file';
  get(id: string): Promise<SavedProfile | null>;
  put(profile: SavedProfile): Promise<void>;
  /** The top `n` by REP (more wins first on a tie), and the place this REP/wins would have. */
  top(n: number): Promise<SavedProfile[]>;
  placeOf(rep: number, wins: number): Promise<number>;
}

/** The profile's id: a hash of its secret key (so a leaked database can't be used to log in). */
export const profileId = (key: string) => createHash('sha256').update(`vault-breakers:${key}`).digest('hex');

export function newProfile(id: string, name: string): SavedProfile {
  const now = Date.now();
  return { _id: id, name, matches: 0, wins: 0, points: 0, rep: 0, shield: false, stats: { banked: 0, contracts: 0, revenges: 0 }, createdAt: now, seenAt: now };
}

/** Old saves get any field added since. */
export const upgrade = (p: SavedProfile): SavedProfile => ({ ...newProfile(p._id, p.name), ...p, stats: { ...newProfile(p._id, p.name).stats, ...p.stats } });

/** An Atlas address (mongodb+srv://) is looked up through DNS. Some machines hand Node a DNS
 *  server that won't answer (127.0.0.1 on some Windows setups): then public DNS is used. */
async function checkDns(uri: string) {
  const host = /^mongodb\+srv:\/\/(?:[^@/]*@)?([^/?]+)/.exec(uri)?.[1];
  if (!host) return;
  try {
    await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
  } catch {
    dns.setServers(['1.1.1.1', '8.8.8.8']);
    console.log("profiles: this machine's DNS did not answer; using public DNS for the database");
  }
}

async function mongoStore(uri: string): Promise<Store> {
  await checkDns(uri);
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  const profiles = client.db('vault-breakers').collection<SavedProfile>('profiles');
  await profiles.createIndex({ rep: -1, wins: -1 }).catch(() => {});
  return {
    kind: 'mongo',
    async get(id) {
      const p = await profiles.findOne({ _id: id });
      return p ? upgrade(p) : null;
    },
    async put(profile) {
      await profiles.replaceOne({ _id: profile._id }, profile, { upsert: true });
    },
    async top(n) {
      // Only players who have finished a match.
      return (await profiles.find({ matches: { $gt: 0 } }).sort({ rep: -1, wins: -1, _id: 1 }).limit(n).toArray()).map(upgrade);
    },
    async placeOf(rep, wins) {
      return 1 + (await profiles.countDocuments({ matches: { $gt: 0 }, $or: [{ rep: { $gt: rep } }, { rep, wins: { $gt: wins } }] }));
    },
  };
}

function fileStore(file: string): Store {
  let all: Record<string, SavedProfile> = {};
  try {
    all = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    // No saves yet.
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(all));
  };
  return {
    kind: 'file',
    async get(id) {
      return all[id] ? upgrade(all[id]) : null;
    },
    async put(profile) {
      all[profile._id] = profile;
      timer ??= setTimeout(flush, 500);
    },
    async top(n) {
      return Object.values(all).map(upgrade).filter((p) => p.matches > 0).sort((a, b) => b.rep - a.rep || b.wins - a.wins || a._id.localeCompare(b._id)).slice(0, n);
    },
    async placeOf(rep, wins) {
      return 1 + Object.values(all).map(upgrade).filter((p) => p.matches > 0 && (p.rep > rep || (p.rep === rep && p.wins > wins))).length;
    },
  };
}

/** The database if there is one (and it answers), else the local file. */
export async function openStore(root: string): Promise<Store> {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    try {
      const store = await mongoStore(uri);
      console.log('profiles: saved in MongoDB');
      return store;
    } catch (err) {
      console.error(`profiles: MongoDB didn't connect (${(err as Error).message}); saving to a local file instead`);
    }
  }
  const file = path.join(root, 'data', 'profiles.json');
  console.log(`profiles: saved in ${path.relative(root, file)}`);
  return fileStore(file);
}
