import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
const db = new PrismaClient();
async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 10)
    throw new Error('Set SEED_PASSWORD to at least 10 characters');
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await db.user.upsert({
    where: { email: 'admin@shopstack.demo' },
    update: {},
    create: { name: 'Alex Morgan', email: 'admin@shopstack.demo', passwordHash, role: 'ADMIN' },
  });
  const customer = await db.user.upsert({
    where: { email: 'customer@shopstack.demo' },
    update: {},
    create: { name: 'Riya Shah', email: 'customer@shopstack.demo', passwordHash, role: 'CUSTOMER' },
  });
  const categories = [];
  for (const name of ['Audio', 'Workspace', 'Everyday', 'Photography'])
    categories.push(
      await db.category.upsert({
        where: { slug: name.toLowerCase() },
        update: {},
        create: { name, slug: name.toLowerCase() },
      }),
    );
  const products = [
    ['Studio Wireless', 'headphones', 1299000, 18, 0],
    ['Everyday Timepiece', 'watch', 849900, 8, 2],
    ['Quiet Mechanical', 'keyboard', 699900, 14, 1],
    ['Pocket Lens', 'camera', 2499900, 4, 3],
    ['Room Speaker', 'speaker', 999900, 3, 0],
    ['Travel Essentials', 'package', 349900, 32, 2],
    ['Focus Headphones', 'headphones', 1599900, 9, 0],
    ['Desk Companion', 'keyboard', 449900, 21, 1],
    ['Analog Weekender', 'watch', 599900, 12, 2],
  ] as const;
  for (const [i, [name, image, price, stock, cat]] of products.entries())
    await db.product.upsert({
      where: { id: 'demo-product-' + i },
      update: {},
      create: {
        id: 'demo-product-' + i,
        name,
        image,
        price,
        stock,
        categoryId: categories[cat].id,
        description:
          'Thoughtfully designed for your daily rhythm. Premium materials, considered details, and reliable performance make this an everyday essential you will reach for again and again.',
      },
    });
  await db.cart.upsert({
    where: { userId: customer.id },
    update: {},
    create: { userId: customer.id },
  });
  console.log(
    'ShopStack seeded. Accounts: admin / customer @shopstack.demo. Prices use integer paise.',
  );
}
main().finally(() => db.$disconnect());
