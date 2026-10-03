import express, { Express } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { authenticate, roles, asyncRoute, fail, param, pagination, userSelect } from './lib.js';
import {
  checkoutSchema,
  createOrder,
  confirmPayment,
  expireOrder,
  releaseExpiredDemoOrders,
  orderInclude,
} from './commerce.js';
const productSchema = z
  .object({
    name: z.string().min(2).max(150),
    description: z.string().min(10).max(5000),
    price: z.number().int().min(1).max(100000000),
    stock: z.number().int().min(0).max(100000),
    categoryId: z.string(),
    image: z
      .enum(['headphones', 'watch', 'keyboard', 'camera', 'speaker', 'package'])
      .default('package'),
    active: z.boolean().optional(),
  })
  .strict();
function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith('sk_test_')) fail(503, 'Configure a Stripe test secret key');
  return new Stripe(key);
}
export function installRoutes(app: Express) {
  app.post(
    '/api/payments/webhook',
    express.raw({ type: 'application/json', limit: '1mb' }),
    asyncRoute(async (req, res) => {
      if (process.env.PAYMENT_MODE !== 'stripe') fail(404, 'Stripe is not enabled');
      const s = stripe();
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) fail(503, 'Configure webhook secret');
      let event: Stripe.Event;
      try {
        event = s.webhooks.constructEvent(
          req.body,
          String(req.headers['stripe-signature'] || ''),
          secret,
        );
      } catch {
        fail(400, 'Invalid webhook signature');
      }
      if (
        event.type === 'checkout.session.completed' ||
        event.type === 'checkout.session.async_payment_succeeded'
      ) {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status === 'paid') {
          if (session.currency !== 'inr') fail(400, 'Unexpected currency');
          await confirmPayment(
            session.metadata?.orderId || '',
            session.amount_total || 0,
            String(session.payment_intent || session.id),
            event.id,
          );
        }
      } else if (event.type === 'checkout.session.expired') {
        const session = event.data.object as Stripe.Checkout.Session;
        await expireOrder(session.metadata?.orderId || '');
      }
      res.json({ received: true });
    }),
  );
  const router = express.Router();
  router.get(
    '/products',
    asyncRoute(async (req, res) => {
      const p = pagination(req);
      const q = z
        .object({
          search: z.string().optional(),
          categoryId: z.string().optional(),
          sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
        })
        .parse(req.query);
      const where: Prisma.ProductWhereInput = {
        active: true,
        ...(q.categoryId ? { categoryId: q.categoryId } : {}),
        ...(q.search
          ? {
              OR: [
                { name: { contains: q.search, mode: 'insensitive' } },
                { description: { contains: q.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        db.product.findMany({
          where,
          include: { category: true },
          skip: p.skip,
          take: p.limit,
          orderBy:
            q.sort === 'newest'
              ? { createdAt: 'desc' }
              : { price: q.sort === 'price_asc' ? 'asc' : 'desc' },
        }),
        db.product.count({ where }),
      ]);
      res.json({ items, total, ...p });
    }),
  );
  router.get(
    '/products/:id',
    asyncRoute(async (req, res) => {
      const p = await db.product.findFirst({
        where: { id: param(req), active: true },
        include: { category: true },
      });
      if (!p) fail(404, 'Product not found');
      res.json(p);
    }),
  );
  router.get(
    '/categories',
    asyncRoute(async (_req, res) =>
      res.json(await db.category.findMany({ orderBy: { name: 'asc' } })),
    ),
  );
  router.use(authenticate);
  router.post(
    '/products',
    roles('ADMIN'),
    asyncRoute(async (req, res) =>
      res.status(201).json(await db.product.create({ data: productSchema.parse(req.body) })),
    ),
  );
  router.patch(
    '/products/:id',
    roles('ADMIN'),
    asyncRoute(async (req, res) =>
      res.json(
        await db.product.update({
          where: { id: param(req) },
          data: productSchema.partial().parse(req.body),
        }),
      ),
    ),
  );
  router.delete(
    '/products/:id',
    roles('ADMIN'),
    asyncRoute(async (req, res) => {
      await db.product.update({ where: { id: param(req) }, data: { active: false } });
      res.status(204).end();
    }),
  );
  router.post(
    '/categories',
    roles('ADMIN'),
    asyncRoute(async (req, res) =>
      res.status(201).json(
        await db.category.create({
          data: z
            .object({ name: z.string().min(2), slug: z.string().regex(/^[a-z0-9-]+$/) })
            .strict()
            .parse(req.body),
        }),
      ),
    ),
  );
  router.get(
    '/cart',
    asyncRoute(async (_req, res) =>
      res.json(
        await db.cart.upsert({
          where: { userId: res.locals.user.id },
          create: { userId: res.locals.user.id },
          update: {},
          include: { items: { include: { product: { include: { category: true } } } } },
        }),
      ),
    ),
  );
  router.post(
    '/cart/items',
    asyncRoute(async (req, res) => {
      const data = z
        .object({ productId: z.string(), quantity: z.number().int().min(1).max(100) })
        .strict()
        .parse(req.body);
      const p = await db.product.findUnique({ where: { id: data.productId } });
      if (!p?.active) fail(404, 'Product not found');
      const cart = await db.cart.upsert({
        where: { userId: res.locals.user.id },
        create: { userId: res.locals.user.id },
        update: {},
      });
      const existing = await db.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId: p.id } },
      });
      if ((existing?.quantity || 0) + data.quantity > p.stock) fail(409, 'Quantity exceeds stock');
      res
        .status(201)
        .json(
          await db.cartItem.upsert({
            where: { cartId_productId: { cartId: cart.id, productId: p.id } },
            create: { cartId: cart.id, ...data },
            update: { quantity: { increment: data.quantity } },
          }),
        );
    }),
  );
  router.patch(
    '/cart/items/:id',
    asyncRoute(async (req, res) => {
      const { quantity } = z
        .object({ quantity: z.number().int().min(1).max(100) })
        .strict()
        .parse(req.body);
      const c = await db.cartItem.findFirst({
        where: { id: param(req), cart: { userId: res.locals.user.id } },
        include: { product: true },
      });
      if (!c) fail(404, 'Cart item not found');
      if (quantity > c.product.stock) fail(409, 'Quantity exceeds stock');
      res.json(await db.cartItem.update({ where: { id: c.id }, data: { quantity } }));
    }),
  );
  router.delete(
    '/cart/items/:id',
    asyncRoute(async (req, res) => {
      const c = await db.cartItem.findFirst({
        where: { id: param(req), cart: { userId: res.locals.user.id } },
      });
      if (!c) fail(404, 'Cart item not found');
      await db.cartItem.delete({ where: { id: c.id } });
      res.status(204).end();
    }),
  );
  router.get(
    '/wishlist',
    asyncRoute(async (_req, res) =>
      res.json(
        await db.wishlist.findMany({
          where: { userId: res.locals.user.id },
          include: { product: { include: { category: true } } },
        }),
      ),
    ),
  );
  router.post(
    '/wishlist',
    asyncRoute(async (req, res) => {
      const { productId } = z.object({ productId: z.string() }).strict().parse(req.body);
      res
        .status(201)
        .json(
          await db.wishlist.upsert({
            where: { userId_productId: { userId: res.locals.user.id, productId } },
            create: { userId: res.locals.user.id, productId },
            update: {},
          }),
        );
    }),
  );
  router.delete(
    '/wishlist/:id',
    asyncRoute(async (req, res) => {
      await db.wishlist.deleteMany({
        where: { productId: param(req), userId: res.locals.user.id },
      });
      res.status(204).end();
    }),
  );
  router.post(
    '/orders',
    asyncRoute(async (req, res) => {
      await releaseExpiredDemoOrders();
      res.status(201).json(await createOrder(res.locals.user.id, checkoutSchema.parse(req.body)));
    }),
  );
  router.get(
    '/orders',
    asyncRoute(async (req, res) => {
      const p = pagination(req);
      const where = { userId: res.locals.user.id };
      res.json({
        items: await db.order.findMany({
          where,
          include: orderInclude,
          orderBy: { createdAt: 'desc' },
          take: p.limit,
          skip: p.skip,
        }),
        total: await db.order.count({ where }),
        ...p,
      });
    }),
  );
  router.get(
    '/orders/:id',
    asyncRoute(async (req, res) => {
      const o = await db.order.findFirst({
        where: { id: param(req), userId: res.locals.user.id },
        include: orderInclude,
      });
      if (!o) fail(404, 'Order not found');
      res.json(o);
    }),
  );
  router.post(
    '/orders/:id/cancel',
    asyncRoute(async (req, res) => {
      const o = await db.order.findFirst({
        where: { id: param(req), userId: res.locals.user.id },
        include: { payment: true },
      });
      if (!o) fail(404, 'Order not found');
      if (o.status !== 'PENDING') fail(409, 'Only unpaid orders can be cancelled');
      if (o.payment?.provider === 'stripe' && o.payment.providerPaymentId) {
        await stripe().checkout.sessions.expire(o.payment.providerPaymentId);
      }
      await expireOrder(o.id);
      res.status(204).end();
    }),
  );
  router.post(
    '/payments/create',
    asyncRoute(async (req, res) => {
      const { orderId } = z.object({ orderId: z.string() }).strict().parse(req.body);
      const o = await db.order.findFirst({
        where: { id: orderId, userId: res.locals.user.id },
        include: orderInclude,
      });
      if (!o) fail(404, 'Order not found');
      if (o.status !== 'PENDING') fail(409, 'Order is no longer payable');
      if (o.payment?.provider === 'demo') return res.json({ mode: 'demo', orderId: o.id });
      const s = stripe();
      const session = await s.checkout.sessions.create(
        {
          mode: 'payment',
          payment_method_types: ['card'],
          line_items: o.items.map((i) => ({
            price_data: {
              currency: 'inr',
              unit_amount: i.priceAtPurchase,
              product_data: { name: i.productName },
            },
            quantity: i.quantity,
          })),
          metadata: { orderId: o.id },
          client_reference_id: o.id,
          expires_at: Math.floor(o.expiresAt.getTime() / 1000),
          success_url: process.env.CLIENT_URL + '/orders?payment=success',
          cancel_url: process.env.CLIENT_URL + '/checkout?orderId=' + o.id,
        },
        { idempotencyKey: o.id },
      );
      await db.payment.update({
        where: { orderId: o.id },
        data: { providerPaymentId: session.id },
      });
      res.json({ mode: 'stripe', url: session.url });
    }),
  );
  router.post(
    '/payments/demo-confirm',
    asyncRoute(async (req, res) => {
      if (process.env.PAYMENT_MODE !== 'demo') fail(404, 'Demo payments disabled');
      const { orderId } = z.object({ orderId: z.string() }).strict().parse(req.body);
      const o = await db.order.findFirst({
        where: { id: orderId, userId: res.locals.user.id },
        include: { payment: true },
      });
      if (!o || o.payment?.provider !== 'demo') fail(404, 'Demo order not found');
      if (o.expiresAt < new Date()) fail(409, 'Reservation expired');
      res.json(await confirmPayment(o.id, o.total, 'demo_' + randomUUID()));
    }),
  );
  router.get(
    '/admin/products',
    roles('ADMIN'),
    asyncRoute(async (req, res) => {
      const p = pagination(req);
      res.json({
        items: await db.product.findMany({
          include: { category: true },
          orderBy: { createdAt: 'desc' },
          skip: p.skip,
          take: p.limit,
        }),
        total: await db.product.count(),
        ...p,
      });
    }),
  );
  router.get(
    '/admin/orders',
    roles('ADMIN'),
    asyncRoute(async (req, res) => {
      const p = pagination(req);
      res.json({
        items: await db.order.findMany({
          include: { ...orderInclude, user: { select: userSelect } },
          orderBy: { createdAt: 'desc' },
          skip: p.skip,
          take: p.limit,
        }),
        total: await db.order.count(),
        ...p,
      });
    }),
  );
  router.patch(
    '/admin/orders/:id/status',
    roles('ADMIN'),
    asyncRoute(async (req, res) => {
      const { status } = z
        .object({ status: z.enum(['PROCESSING', 'SHIPPED', 'DELIVERED']) })
        .strict()
        .parse(req.body);
      const o = await db.order.findUnique({ where: { id: param(req) } });
      if (!o || o.paymentStatus !== 'PAID') fail(409, 'Only paid orders can be fulfilled');
      const next: Record<string, string> = {
        CONFIRMED: 'PROCESSING',
        PROCESSING: 'SHIPPED',
        SHIPPED: 'DELIVERED',
      };
      if (next[o.status] !== status) fail(409, 'Invalid fulfillment transition');
      res.json(await db.order.update({ where: { id: o.id }, data: { status } }));
    }),
  );
  router.get(
    '/admin/customers',
    roles('ADMIN'),
    asyncRoute(async (req, res) => {
      const p = pagination(req);
      res.json({
        items: await db.user.findMany({
          where: { role: 'CUSTOMER' },
          select: { ...userSelect, _count: { select: { orders: true } } },
          skip: p.skip,
          take: p.limit,
        }),
        total: await db.user.count({ where: { role: 'CUSTOMER' } }),
        ...p,
      });
    }),
  );
  router.get(
    '/admin/analytics',
    roles('ADMIN'),
    asyncRoute(async (_req, res) => {
      const [revenue, orders, customers, products, lowStock, statuses, paid] = await Promise.all([
        db.order.aggregate({ where: { paymentStatus: 'PAID' }, _sum: { total: true } }),
        db.order.count(),
        db.user.count({ where: { role: 'CUSTOMER' } }),
        db.product.count({ where: { active: true } }),
        db.product.findMany({ where: { active: true, stock: { lte: 5 } }, take: 20 }),
        db.order.groupBy({ by: ['status'], _count: { _all: true } }),
        db.order.findMany({
          where: {
            paymentStatus: 'PAID',
            createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
          },
          include: { items: true },
          take: 5000,
        }),
      ]);
      const days: Record<string, number> = {},
        top: Record<string, { name: string; quantity: number }> = {};
      for (const o of paid) {
        const day = o.createdAt.toISOString().slice(0, 10);
        days[day] = (days[day] || 0) + o.total;
        for (const i of o.items) {
          top[i.productId] ??= { name: i.productName, quantity: 0 };
          top[i.productId].quantity += i.quantity;
        }
      }
      res.json({
        revenue: revenue._sum.total || 0,
        orders,
        customers,
        products,
        lowStock,
        statuses,
        days,
        topProducts: Object.values(top)
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5),
      });
    }),
  );
  app.use('/api', router);
}
