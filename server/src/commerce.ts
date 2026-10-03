import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db.js';
import { fail, transaction } from './lib.js';
export const addressSchema = z
  .object({
    name: z.string().min(2).max(100),
    line1: z.string().min(5).max(200),
    city: z.string().min(2).max(100),
    postalCode: z.string().min(4).max(12),
    country: z.string().length(2).default('IN'),
  })
  .strict();
export const checkoutSchema = z
  .object({ shippingAddress: addressSchema, idempotencyKey: z.string().min(8).max(100) })
  .strict();
export async function createOrder(userId: string, data: z.infer<typeof checkoutSchema>) {
  return transaction(async (tx) => {
    const existing = await tx.order.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: data.idempotencyKey } },
      include: { items: true, payment: true },
    });
    if (existing) return existing;
    const cart = await tx.cart.findUnique({
      where: { userId },
      include: { items: { include: { product: true } } },
    });
    if (!cart?.items.length) fail(400, 'Your cart is empty');
    let total = 0;
    for (const item of [...cart.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
      const updated = await tx.product.updateMany({
        where: { id: item.productId, active: true, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      });
      if (updated.count !== 1) fail(409, 'Insufficient inventory for ' + item.product.name);
      total += item.product.price * item.quantity;
      if (total > 2000000000) fail(400, 'Order exceeds supported total');
    }
    return tx.order.create({
      data: {
        userId,
        total,
        shippingAddress: data.shippingAddress,
        idempotencyKey: data.idempotencyKey,
        expiresAt: new Date(Date.now() + 31 * 60000),
        items: {
          create: cart.items.map((i) => ({
            productId: i.productId,
            productName: i.product.name,
            quantity: i.quantity,
            priceAtPurchase: i.product.price,
          })),
        },
        payment: {
          create: {
            provider: process.env.PAYMENT_MODE === 'stripe' ? 'stripe' : 'demo',
            amount: total,
          },
        },
      },
      include: { items: true, payment: true },
    });
  });
}
export async function confirmPayment(
  orderId: string,
  amount: number,
  providerId: string,
  eventId?: string,
) {
  return transaction(async (tx) => {
    if (eventId) {
      const done = await tx.webhookEvent.findUnique({ where: { id: eventId } });
      if (done) return { duplicate: true };
    }
    const o = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true, payment: true },
    });
    if (!o) fail(404, 'Order not found');
    if (o.total !== amount) fail(400, 'Payment amount does not match order');
    if (o.paymentStatus === 'PAID') return { duplicate: true };
    if (o.status !== 'PENDING')
      fail(409, 'Order is no longer payable; reconcile/refund at provider');
    await tx.order.update({
      where: { id: o.id },
      data: { status: 'CONFIRMED', paymentStatus: 'PAID' },
    });
    await tx.payment.update({
      where: { orderId: o.id },
      data: { status: 'PAID', providerPaymentId: providerId },
    });
    // Remove only purchased quantities; preserve additions made after checkout.
    const cart = await tx.cart.findUnique({ where: { userId: o.userId } });
    if (cart)
      for (const i of o.items) {
        const c = await tx.cartItem.findUnique({
          where: { cartId_productId: { cartId: cart.id, productId: i.productId } },
        });
        if (c) {
          if (c.quantity <= i.quantity) await tx.cartItem.delete({ where: { id: c.id } });
          else
            await tx.cartItem.update({
              where: { id: c.id },
              data: { quantity: { decrement: i.quantity } },
            });
        }
      }
    if (eventId) await tx.webhookEvent.create({ data: { id: eventId } });
    return { confirmed: true };
  });
}
export async function expireOrder(orderId: string) {
  return transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!o || o.status !== 'PENDING') return;
    await tx.order.update({
      where: { id: o.id },
      data: { status: 'CANCELLED', paymentStatus: 'EXPIRED' },
    });
    await tx.payment.update({ where: { orderId: o.id }, data: { status: 'EXPIRED' } });
    for (const i of [...o.items].sort((a, b) => a.productId.localeCompare(b.productId)))
      await tx.product.update({
        where: { id: i.productId },
        data: { stock: { increment: i.quantity } },
      });
  });
}
// Stripe reservations are released only on checkout.session.expired, never by a local clock.
// This avoids accepting a paid Stripe session after its inventory has been released.
export async function releaseExpiredDemoOrders() {
  const orders = await db.order.findMany({
    where: { status: 'PENDING', expiresAt: { lt: new Date() }, payment: { provider: 'demo' } },
    select: { id: true },
    take: 100,
  });
  for (const o of orders) await expireOrder(o.id);
}
export const orderInclude = {
  items: { include: { product: true } },
  payment: true,
} satisfies Prisma.OrderInclude;
