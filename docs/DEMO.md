# Five-minute interview walkthrough

1. Browse products, save a wishlist item and add products to the bag.
2. Checkout with fictional address details. Show the explicit demo-payment label.
3. Confirm the simulated payment and inspect priceAtPurchase in order details.
4. Sign in as admin, update catalog price, then return to the old order: its price remains unchanged.
5. Show fulfillment progression and analytics.
6. Open tests for concurrent last-unit purchases, duplicate confirmation and forged Stripe signatures.

Discuss: integer money, transactions, reservation timing, idempotency and reconciliation. No real payments are required for this demo.
