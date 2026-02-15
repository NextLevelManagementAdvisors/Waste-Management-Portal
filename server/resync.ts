import { getStripeSync } from './stripeClient';

async function resync() {
  console.log('Starting manual backfill...');
  const sync = await getStripeSync();
  await sync.syncBackfill();
  console.log('Backfill complete!');
  process.exit(0);
}

resync().catch(err => {
  console.error('Resync failed:', err);
  process.exit(1);
});
