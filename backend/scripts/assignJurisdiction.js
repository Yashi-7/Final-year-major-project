/**
 * Operator tool: give a GOVERNMENT_OFFICIAL an area of responsibility (jurisdiction). There is no admin role or
 * admin screen in this system; this script is how an operator with database access assigns areas.
 *
 *   npm run assign-jurisdiction -- --email=official@example.com --state="Madhya Pradesh"
 *   npm run assign-jurisdiction -- --email=official@example.com --state="Madhya Pradesh" --district=Balaghat
 *   npm run assign-jurisdiction -- --email=official@example.com --state="Odisha" --add      (adds another area)
 *   npm run assign-jurisdiction -- --email=official@example.com --clear                     (removes all areas)
 *
 * Without --add the given area REPLACES the official's current areas. Matching is exact: names must be written
 * the same way as in the claims' location fields (e.g. "Madhya Pradesh").
 */
import dotenv from 'dotenv';

dotenv.config();

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const option = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');

const email = option('email')?.trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run assign-jurisdiction -- --email=<official email> (--state=<state> [--district=<district> [--tehsil=<tehsil>]] [--add] | --clear)');
  process.exit(1);
}

const { default: connectDB } = await import('../src/config/db.js');
const { default: mongoose } = await import('mongoose');
const { default: User } = await import('../src/models/User.js');
const { buildAreaFromInput, describeArea, normalizeAreas } = await import('../src/utils/jurisdiction.js');

try {
  await connectDB();
  const user = await User.findOne({ email });
  if (!user) throw new Error(`No user with email ${email}.`);
  if (user.role !== 'GOVERNMENT_OFFICIAL') throw new Error(`${email} is a ${user.role}. Only GOVERNMENT_OFFICIAL users can have a jurisdiction.`);

  if (flag('clear')) {
    user.jurisdiction = { areas: [] };
  } else {
    const { area, error } = buildAreaFromInput({ state: option('state'), district: option('district'), tehsil: option('tehsil') });
    if (error) throw new Error(error);
    const current = flag('add') ? normalizeAreas(user.jurisdiction?.areas) : [];
    user.jurisdiction = { areas: normalizeAreas([...current, area]) };
  }
  await user.save();

  const areas = normalizeAreas(user.jurisdiction.areas);
  console.log(areas.length ? `${email} can now see claims in: ${areas.map(describeArea).join('; ')}` : `${email} has no assigned area (sees no claims).`);
} catch (error) {
  console.error('Failed:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
