#!/usr/bin/env node
// Seeds the LOCAL e2e database (default mongodb://127.0.0.1:27027/tt-e2e) with:
//   - one adoptable cat for GET /shelter/agent/cat-card: a `blessings` row with status WAITING and
//     kind `rescue`, its required `images` row, and a `shelters` row (Pink Paw, testnet wallet), so
//     ShelterX402Service.pickCard's $lookup fills imageUrl and shelterName;
//   - the registered e2e user (uid e2e-tester) and one saved game, so POST /shelter/donate passes
//     the instant-treat policy (see lib.mjs ensureE2eUser).
// Re-running replaces the earlier e2e rows (all tagged `e2e: 'tt-e2e'`). Refuses a non-localhost URI.
//
// Usage: node funding/e2e/seed.mjs [--uri mongodb://127.0.0.1:27027/tt-e2e]
import { DEFAULT_MONGO_URI, E2E_TAG, WALLETS, assertLocalMongoUri, ensureE2eUser, errMsg, withLocalDb } from './lib.mjs';

const argv = process.argv.slice(2);
const uriFlag = argv.indexOf('--uri');
const uri = uriFlag >= 0 ? argv[uriFlag + 1] : process.env.E2E_MONGODB_URI || DEFAULT_MONGO_URI;

async function main() {
  assertLocalMongoUri(uri);
  const now = new Date();
  await withLocalDb(uri, async (db) => {
    const images = db.collection('images');
    const shelters = db.collection('shelters');
    const blessings = db.collection('blessings');

    await blessings.deleteMany({ e2e: E2E_TAG });
    await shelters.deleteMany({ e2e: E2E_TAG });
    await images.deleteMany({ e2e: E2E_TAG });

    // Image: `url` is the only required field (image.schema.ts).
    const shelterImage = await images.insertOne({
      title: 'E2E shelter', name: 'e2e-shelter', caption: 'e2e', isTemporary: false,
      url: 'https://example.com/e2e/shelter.png', e2e: E2E_TAG, createdAt: now, updatedAt: now,
    });
    const catImage = await images.insertOne({
      title: 'E2E Whiskers', name: 'e2e-whiskers', caption: 'e2e', isTemporary: false,
      url: 'https://example.com/e2e/whiskers.png', e2e: E2E_TAG, createdAt: now, updatedAt: now,
    });

    // Shelter: required name, slug, description, address, foundedAt, image (shelter.schema.ts).
    const shelter = await shelters.insertOne({
      name: 'Pink Paw (testnet e2e)',
      slug: 'pink-paw-e2e',
      country: 'Lithuania',
      countryCode: 'LT',
      description: 'Local e2e fixture shelter. Not a real record.',
      address: 'Testnet',
      foundedAt: new Date('2020-01-01T00:00:00Z'),
      image: shelterImage.insertedId,
      publicWallet: WALLETS.pinkpaw,
      blessing: [],
      users: [],
      e2e: E2E_TAG,
      createdAt: now,
      updatedAt: now,
    });

    // Blessing: required name, description, status, image (blessing.schema.ts). WAITING = adoptable.
    const blessing = await blessings.insertOne({
      name: 'E2E Whiskers',
      description: 'An adoptable test cat for the x402 cat-card endpoint.',
      status: 'WAITING',
      kind: 'rescue',
      image: catImage.insertedId,
      shelter: shelter.insertedId,
      e2e: E2E_TAG,
      createdAt: now,
      updatedAt: now,
    });
    await shelters.updateOne({ _id: shelter.insertedId }, { $set: { blessing: [blessing.insertedId] } });

    const userId = await ensureE2eUser(db, now);

    const waiting = await blessings.countDocuments({ status: 'WAITING' });
    console.log(`seeded blessing ${blessing.insertedId} (WAITING; ${waiting} adoptable in total), shelter ${shelter.insertedId}, e2e user ${userId}`);
  });
}

main().catch((e) => {
  console.error(`seed failed: ${errMsg(e)}`);
  process.exit(1);
});
