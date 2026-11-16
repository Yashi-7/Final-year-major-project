/**
 * Development seed: DEMO / ILLUSTRATIVE FRA claims. Never official data. Never run in production.
 *
 *   npm run seed:demo-fra                                     create 2 demo farmers, 5 demo officials + 10 demo claims
 *   npm run seed:demo-fra -- --farmer-email=you@example.com   give the first set (4 claims) to YOUR farmer account
 *   npm run seed:demo-fra -- --official-email=you@example.com give YOUR government account the area 'Madhya Pradesh'
 *        (optionally with --official-state=Odisha --official-district=Koraput to pick another area)
 *   npm run seed:demo-fra -- --remove                         delete every DEMO claim and the demo users
 *   npm run seed:demo-fra -- --remove --official-email=you@example.com   ...and clear the area given to your official
 *
 * Safe to re-run: existing DEMO claims are replaced. Only records with dataSource 'DEMO' and users whose
 * email ends in @demo.invalid are ever deleted; real claims and real users are never touched.
 */
import dotenv from 'dotenv';

dotenv.config();

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run: demo data must never be seeded in production.');
  process.exit(1);
}

const { default: connectDB } = await import('../src/config/db.js');
const { default: mongoose } = await import('mongoose');
const { default: User } = await import('../src/models/User.js');
const { default: Claim } = await import('../src/models/Claim.js');
const { buildDemoClaims, DEMO_EMAIL_DOMAIN, DEMO_FARMER_ONE, DEMO_FARMER_TWO, DEMO_OFFICIALS } = await import('../src/seed/demoFraClaims.js');
const { buildAreaFromInput, describeArea } = await import('../src/utils/jurisdiction.js');

const PASSWORD = process.env.DEMO_SEED_PASSWORD || 'DemoFarmer#2025';

const ensureDemoFarmer = async ({ fullName, email }) => {
  const existing = await User.findOne({ email });
  if (existing) return existing;
  return User.create({ fullName, email, password: PASSWORD, role: 'FARMER' });
};

const ensureDemoOfficial = async ({ fullName, email, areas }) => {
  const existing = await User.findOne({ email });
  if (existing) {
    existing.jurisdiction = { areas };
    return existing.save();
  }
  return User.create({ fullName, email, password: PASSWORD, role: 'GOVERNMENT_OFFICIAL', jurisdiction: { areas } });
};

const run = async () => {
  await connectDB();
  const officialEmail = option('official-email')?.toLowerCase();

  if (flag('remove')) {
    const claims = await Claim.deleteMany({ dataSource: 'DEMO' });
    const users = await User.deleteMany({ email: { $regex: `@${DEMO_EMAIL_DOMAIN.replace('.', '\\.')}$` } });
    console.log(`Removed ${claims.deletedCount} demo claim(s) and ${users.deletedCount} demo user(s).`);
    if (officialEmail) {
      const official = await User.findOne({ email: officialEmail, role: 'GOVERNMENT_OFFICIAL' });
      if (official) { official.jurisdiction = { areas: [] }; await official.save(); console.log(`Cleared the area of ${officialEmail}.`); }
    }
    return;
  }

  let farmerOne;
  const linkEmail = option('farmer-email');
  if (linkEmail) {
    farmerOne = await User.findOne({ email: linkEmail.toLowerCase() });
    if (!farmerOne || farmerOne.role !== 'FARMER') {
      console.error(`No FARMER account found with email ${linkEmail}. Register it in the app first.`);
      process.exitCode = 1;
      return;
    }
  } else {
    farmerOne = await ensureDemoFarmer(DEMO_FARMER_ONE);
  }
  const farmerTwo = await ensureDemoFarmer(DEMO_FARMER_TWO);

  for (const official of DEMO_OFFICIALS) await ensureDemoOfficial(official);

  let assigned = null;
  if (officialEmail) {
    const official = await User.findOne({ email: officialEmail });
    if (!official || official.role !== 'GOVERNMENT_OFFICIAL') {
      console.error(`No GOVERNMENT_OFFICIAL account found with email ${officialEmail}. Register it in the app first.`);
      process.exitCode = 1;
      return;
    }
    const { area, error } = buildAreaFromInput({
      state: option('official-state') || 'Madhya Pradesh',
      district: option('official-district'),
    });
    if (error) { console.error(error); process.exitCode = 1; return; }
    official.jurisdiction = { areas: [area] };
    await official.save();
    assigned = `${officialEmail} -> ${describeArea(area)}`;
  }

  await Claim.deleteMany({ dataSource: 'DEMO' });
  const docs = buildDemoClaims({ farmerOneId: farmerOne._id, farmerTwoId: farmerTwo._id });
  for (const doc of docs) await Claim.create(doc); // create() runs full validation, including the consistency rules

  const owner = (id) => (String(id) === String(farmerOne._id) ? farmerOne.email : farmerTwo.email);
  console.log('\nDEMO / ILLUSTRATIVE data seeded (not official):\n');
  console.table(docs.map((d) => ({ claimId: d.claimId, status: d.status, geometry: d.geometry?.type || 'none', owner: owner(d.farmer) })));
  console.log('\nDemo government officials (log in to test the dashboard scope):');
  console.table(DEMO_OFFICIALS.map((o) => ({ email: o.email, area: o.areas.map(describeArea).join('; ') || '(none assigned)' })));
  if (assigned) console.log(`Your official account: ${assigned}`);
  console.log(`Demo login password (demo users): ${PASSWORD}`);
  console.log('Privacy test: log in as the owner of a claim and enter its ID; then try an ID owned by the other user -> "not found".');
  console.log('Remove everything later with: npm run seed:demo-fra -- --remove');
};

try {
  await run();
} catch (error) {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
