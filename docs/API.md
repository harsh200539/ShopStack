# ShopStack API

Base: `/api`. Login via cookie jar or send `Authorization: Bearer <JWT>` for CLI/test clients. Send `X-App-Request: 1` on writes except Stripe webhooks. All authorizations are enforced server-side.

| Method | Path |
| --- | --- |
| POST | `/auth/register` |
| POST | `/auth/login` |
| POST | `/auth/logout` |
| GET | `/auth/me` |
| GET | `/health` |
| GET | `/users` |
| POST | `/users` |
| PATCH | `/users/:id` |
| POST | `/payments/webhook` |
| GET | `/products` |
| GET | `/products/:id` |
| GET | `/categories` |
| POST | `/products` |
| PATCH | `/products/:id` |
| DELETE | `/products/:id` |
| POST | `/categories` |
| GET | `/cart` |
| POST | `/cart/items` |
| PATCH | `/cart/items/:id` |
| DELETE | `/cart/items/:id` |
| GET | `/wishlist` |
| POST | `/wishlist` |
| DELETE | `/wishlist/:id` |
| POST | `/orders` |
| GET | `/orders` |
| GET | `/orders/:id` |
| POST | `/orders/:id/cancel` |
| POST | `/payments/create` |
| POST | `/payments/demo-confirm` |
| GET | `/admin/products` |
| GET | `/admin/orders` |
| PATCH | `/admin/orders/:id/status` |
| GET | `/admin/customers` |
| GET | `/admin/analytics` |

## Query parameters

Pagination: `page=1&limit=20`, maximum 100.

Products: `search`, `categoryId`, `sort=newest|price_asc|price_desc`. Checkout reads the authenticated cart; send `shippingAddress` and a unique `idempotencyKey`. All amounts are integer paise.

See strict Zod schemas in the source and the Postman collection for request bodies. For resume upload, use multipart field `resume` containing a PDF.
