import 'dotenv/config';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app.js';
import { db } from '../src/db.js';
import { token } from '../src/lib.js';
import Stripe from 'stripe';
import { createOrder, confirmPayment, expireOrder } from '../src/commerce.js';
const tag = Date.now().toString();
let admin: any, customer: any, other: any, product: any, category: any, order: any;
const users: string[] = [];
const as = (u: any) => ({ Authorization: 'Bearer ' + token(u), 'X-App-Request': '1' });
const address = {
  name: 'Test Customer',
  line1: '123 Test Street',
  city: 'Vadodara',
  postalCode: '390007',
  country: 'IN',
};
beforeAll(async () => {
  process.env.PAYMENT_MODE = 'demo';
  const hash = await bcrypt.hash('test-password-123', 4);
  for (const [email, role] of [
    ['admin', 'ADMIN'],
    ['customer', 'CUSTOMER'],
    ['other', 'CUSTOMER'],
  ]) {
    const u = await db.user.create({
      data: {
        name: email,
        email: email + '-' + tag + '@example.com',
        passwordHash: hash,
        role: role as any,
      },
    });
    users.push(u.id);
    if (email === 'admin') admin = u;
    if (email === 'customer') customer = u;
    if (email === 'other') other = u;
  }
  category = await db.category.create({ data: { name: 'Test category', slug: 'test-' + tag } });
});
afterAll(async () => {
  await db.webhookEvent.deleteMany({ where: { id: { contains: tag } } });
  await db.payment.deleteMany({ where: { order: { userId: { in: users } } } });
  await db.order.deleteMany({ where: { userId: { in: users } } });
  await db.wishlist.deleteMany({ where: { userId: { in: users } } });
  await db.cart.deleteMany({ where: { userId: { in: users } } });
  await db.product.deleteMany({ where: { categoryId: category.id } });
  await db.category.delete({ where: { id: category.id } });
  await db.user.deleteMany({
    where: { OR: [{ id: { in: users } }, { email: { contains: tag } }] },
  });
  await db.$disconnect();
});
describe('ShopStack database and business logic', () => {
  it('defaults registration to customer and rejects admin injection', async () => {
    const body = {
      name: 'Customer',
      email: 'registered-' + tag + '@example.com',
      password: 'test-password-123',
    };
    expect(
      (
        await request(app)
          .post('/api/auth/register')
          .set('X-App-Request', '1')
          .send({ ...body, role: 'ADMIN' })
      ).status,
    ).toBe(400);
    expect(
      (await request(app).post('/api/auth/register').set('X-App-Request', '1').send(body)).body.user
        .role,
    ).toBe('CUSTOMER');
  });
  it('supports login and protects private APIs', async () => {
    expect((await request(app).get('/api/cart')).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .set('X-App-Request', '1')
          .send({ email: customer.email, password: 'test-password-123' })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .set('X-App-Request', '1')
          .send({ email: customer.email, password: 'incorrect-password' })
      ).status,
    ).toBe(401);
  });
  it('only admin creates products and prices must be integer paise', async () => {
    const body = {
      name: 'Test Headphones',
      description: 'A useful test product for integration tests.',
      price: 123450,
      stock: 3,
      categoryId: category.id,
    };
    expect((await request(app).post('/api/products').set(as(customer)).send(body)).status).toBe(
      403,
    );
    expect(
      (
        await request(app)
          .post('/api/products')
          .set(as(admin))
          .send({ ...body, price: 1.5 })
      ).status,
    ).toBe(400);
    const r = await request(app).post('/api/products').set(as(admin)).send(body);
    expect(r.status).toBe(201);
    product = r.body;
  });
  it('supports search and bounded pagination', async () => {
    const r = await request(app).get('/api/products?search=Test&limit=1');
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBe(1);
    expect((await request(app).get('/api/products?limit=1000')).status).toBe(400);
  });
  it('enforces cart ownership and stock limits', async () => {
    const r = await request(app)
      .post('/api/cart/items')
      .set(as(customer))
      .send({ productId: product.id, quantity: 2 });
    expect(r.status).toBe(201);
    expect(
      (
        await request(app)
          .patch('/api/cart/items/' + r.body.id)
          .set(as(other))
          .send({ quantity: 1 })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post('/api/cart/items')
          .set(as(customer))
          .send({ productId: product.id, quantity: 5 })
      ).status,
    ).toBe(409);
  });
  it('saves and removes wishlist entries', async () => {
    expect(
      (await request(app).post('/api/wishlist').set(as(customer)).send({ productId: product.id }))
        .status,
    ).toBe(201);
    expect((await request(app).get('/api/wishlist').set(as(customer))).body).toHaveLength(1);
    expect(
      (
        await request(app)
          .delete('/api/wishlist/' + product.id)
          .set(as(customer))
      ).status,
    ).toBe(204);
  });
  it('rejects frontend totals and calculates from database prices', async () => {
    const body = { shippingAddress: address, idempotencyKey: 'test-checkout-' + tag };
    expect(
      (
        await request(app)
          .post('/api/orders')
          .set(as(customer))
          .send({ ...body, total: 1 })
      ).status,
    ).toBe(400);
    const r = await request(app).post('/api/orders').set(as(customer)).send(body);
    expect(r.status).toBe(201);
    order = r.body;
    expect(order.total).toBe(246900);
    expect((await db.product.findUnique({ where: { id: product.id } }))?.stock).toBe(1);
    const again = await request(app).post('/api/orders').set(as(customer)).send(body);
    expect(again.body.id).toBe(order.id);
    expect((await db.product.findUnique({ where: { id: product.id } }))?.stock).toBe(1);
  });
  it('prevents cross-customer order and payment access', async () => {
    expect(
      (
        await request(app)
          .get('/api/orders/' + order.id)
          .set(as(other))
      ).status,
    ).toBe(404);
    expect(
      (await request(app).post('/api/payments/create').set(as(other)).send({ orderId: order.id }))
        .status,
    ).toBe(404);
  });
  it('verifies amount and handles repeated confirmations exactly once', async () => {
    await expect(confirmPayment(order.id, 1, 'bad')).rejects.toThrow('amount');
    await confirmPayment(order.id, order.total, 'test-' + tag, 'event-' + tag);
    await confirmPayment(order.id, order.total, 'test-' + tag, 'event-' + tag);
    expect((await db.order.findUnique({ where: { id: order.id } }))?.paymentStatus).toBe('PAID');
    expect((await db.product.findUnique({ where: { id: product.id } }))?.stock).toBe(1);
    expect((await request(app).get('/api/cart').set(as(customer))).body.items).toHaveLength(0);
  });
  it('preserves price at purchase after catalog edits', async () => {
    await request(app)
      .patch('/api/products/' + product.id)
      .set(as(admin))
      .send({ price: 999999 });
    const r = await request(app)
      .get('/api/orders/' + order.id)
      .set(as(customer));
    expect(r.body.items[0].priceAtPurchase).toBe(123450);
    expect(r.body.total).toBe(246900);
  });
  it('serializes concurrent claims on the last unit', async () => {
    for (const u of [customer, other])
      await request(app)
        .post('/api/cart/items')
        .set(as(u))
        .send({ productId: product.id, quantity: 1 });
    const results = await Promise.allSettled([
      createOrder(customer.id, { shippingAddress: address, idempotencyKey: 'concurrent-a-' + tag }),
      createOrder(other.id, { shippingAddress: address, idempotencyKey: 'concurrent-b-' + tag }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await db.product.findUnique({ where: { id: product.id } }))?.stock).toBe(0);
    const winner = results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>;
    await expireOrder(winner.value.id);
    await expireOrder(winner.value.id);
    expect((await db.product.findUnique({ where: { id: product.id } }))?.stock).toBe(1);
  });
  it('blocks invalid fulfillment transitions', async () => {
    expect(
      (
        await request(app)
          .patch('/api/admin/orders/' + order.id + '/status')
          .set(as(customer))
          .send({ status: 'SHIPPED' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch('/api/admin/orders/' + order.id + '/status')
          .set(as(admin))
          .send({ status: 'DELIVERED' })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .patch('/api/admin/orders/' + order.id + '/status')
          .set(as(admin))
          .send({ status: 'PROCESSING' })
      ).status,
    ).toBe(200);
  });
  it('verifies raw-body Stripe signatures and handles duplicate webhook delivery', async () => {
    const o = await createOrder(other.id, {
      shippingAddress: address,
      idempotencyKey: 'webhook-' + tag,
    });
    process.env.PAYMENT_MODE = 'stripe';
    process.env.STRIPE_SECRET_KEY = 'sk_test_fixture_not_a_real_key';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fixture_for_tests';
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const payload = JSON.stringify({
      id: 'stripe-event-' + tag,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_fixture',
          payment_status: 'paid',
          currency: 'inr',
          amount_total: o.total,
          payment_intent: 'pi_fixture_' + tag,
          metadata: { orderId: o.id },
        },
      },
    });
    expect(
      (
        await request(app)
          .post('/api/payments/webhook')
          .set('Content-Type', 'application/json')
          .set('stripe-signature', 'forged')
          .send(payload)
      ).status,
    ).toBe(400);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    for (let i = 0; i < 2; i++)
      expect(
        (
          await request(app)
            .post('/api/payments/webhook')
            .set('Content-Type', 'application/json')
            .set('stripe-signature', signature)
            .send(payload)
        ).status,
      ).toBe(200);
    expect((await db.order.findUnique({ where: { id: o.id } }))?.paymentStatus).toBe('PAID');
    process.env.PAYMENT_MODE = 'demo';
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });
  it('computes revenue from paid orders and archives without corrupting history', async () => {
    const r = await request(app).get('/api/admin/analytics').set(as(admin));
    expect(r.status).toBe(200);
    expect(r.body.revenue).toBeGreaterThanOrEqual(order.total);
    expect(
      (
        await request(app)
          .delete('/api/products/' + product.id)
          .set(as(admin))
      ).status,
    ).toBe(204);
    expect((await request(app).get('/api/products/' + product.id)).status).toBe(404);
    expect(
      (
        await request(app)
          .get('/api/orders/' + order.id)
          .set(as(customer))
      ).body.items[0].productName,
    ).toBe('Test Headphones');
  });
  it('disables simulator outside explicit demo mode', async () => {
    process.env.PAYMENT_MODE = 'stripe';
    expect(
      (
        await request(app)
          .post('/api/payments/demo-confirm')
          .set(as(customer))
          .send({ orderId: order.id })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post('/api/payments/webhook')
          .send('{}')
          .set('Content-Type', 'application/json')
      ).status,
    ).toBe(503);
    process.env.PAYMENT_MODE = 'demo';
  });
});
