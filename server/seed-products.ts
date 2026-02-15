import { getUncachableStripeClient } from './stripeClient';

interface ProductDef {
  name: string;
  description: string;
  metadata: Record<string, string>;
  priceAmountCents: number;
  recurring: { interval: 'month' } | null;
}

const PRODUCTS: ProductDef[] = [
  {
    name: 'Curbside Trash Service',
    description: 'Weekly curbside trash collection base fee. Equipment must be added separately.',
    metadata: { category: 'base_fee', icon_name: 'TruckIcon' },
    priceAmountCents: 2900,
    recurring: { interval: 'month' },
  },
  {
    name: 'Small Trash Can (32G)',
    description: 'Weekly curbside trash collection service with one 32-gallon can. Ideal for single residents or small households.',
    metadata: { category: 'base_service', icon_name: 'TrashIcon', setup_fee: '4500', sticker_fee: '0' },
    priceAmountCents: 2000,
    recurring: { interval: 'month' },
  },
  {
    name: 'Medium Trash Can (64G)',
    description: 'Weekly curbside trash collection service with one 64-gallon can. Our most popular size, perfect for growing families.',
    metadata: { category: 'base_service', icon_name: 'TrashIcon', setup_fee: '6500', sticker_fee: '0' },
    priceAmountCents: 2500,
    recurring: { interval: 'month' },
  },
  {
    name: 'Large Trash Can (96G)',
    description: 'Weekly curbside trash collection service with one 96-gallon can. Best value for large households.',
    metadata: { category: 'base_service', icon_name: 'TrashIcon', setup_fee: '8500', sticker_fee: '0' },
    priceAmountCents: 3000,
    recurring: { interval: 'month' },
  },
  {
    name: 'Recycling Service',
    description: 'OPTIONAL ADD-ON: Weekly curbside recycling service for all approved materials. (One 32G recycling can included).',
    metadata: { category: 'base_service', icon_name: 'ArrowPathIcon', setup_fee: '2500', sticker_fee: '0' },
    priceAmountCents: 1200,
    recurring: { interval: 'month' },
  },
  {
    name: 'At House (Backdoor) Service',
    description: "PREMIUM ADD-ON: We'll retrieve your can(s) directly from your house (e.g., garage, porch) and return them.",
    metadata: { category: 'upgrade', icon_name: 'BuildingOffice2Icon' },
    priceAmountCents: 2000,
    recurring: { interval: 'month' },
  },
  {
    name: 'Trash Can Liner Service',
    description: 'Our crew installs a fresh, heavy-duty liner in your can after every weekly collection.',
    metadata: { category: 'upgrade', icon_name: 'SunIcon' },
    priceAmountCents: 600,
    recurring: { interval: 'month' },
  },
  {
    name: 'Handyman Services',
    description: 'On-demand handyman services for your residential property.',
    metadata: { category: 'standalone', icon_name: 'WrenchScrewdriverIcon' },
    priceAmountCents: 22500,
    recurring: null,
  },
];

async function seedProducts() {
  const stripe = await getUncachableStripeClient();
  console.log('Seeding Stripe products...\n');

  for (const def of PRODUCTS) {
    const existing = await stripe.products.search({
      query: `name:'${def.name}'`,
    });

    if (existing.data.length > 0) {
      console.log(`  [SKIP] "${def.name}" already exists (${existing.data[0].id})`);
      continue;
    }

    const product = await stripe.products.create({
      name: def.name,
      description: def.description,
      metadata: def.metadata,
    });

    const priceParams: any = {
      product: product.id,
      unit_amount: def.priceAmountCents,
      currency: 'usd',
    };
    if (def.recurring) {
      priceParams.recurring = def.recurring;
    }

    const price = await stripe.prices.create(priceParams);

    await stripe.products.update(product.id, {
      default_price: price.id,
    });

    console.log(`  [CREATED] "${def.name}" => product: ${product.id}, price: ${price.id} ($${(def.priceAmountCents / 100).toFixed(2)})`);
  }

  console.log('\nDone seeding products!');
}

seedProducts().catch(console.error);
