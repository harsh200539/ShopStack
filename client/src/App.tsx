import { FormEvent, useRef, useState } from 'react';
import { Routes, Route, Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShoppingBag,
  Heart,
  Package,
  LayoutDashboard,
  Users,
  ShoppingCart,
  Headphones,
  Watch,
  Keyboard,
  Camera,
  Speaker,
  ArrowUpRight,
  ArrowLeft,
  Plus,
  Minus,
  Trash2,
  IndianRupee,
  CheckCircle2,
} from 'lucide-react';
import {
  api,
  useAuth,
  useData,
  useActions,
  Guard,
  Login,
  Shell,
  Heading,
  Stats,
  Loading,
  ErrorState,
  Empty,
  Badge,
  RecordForm,
  Field,
  SearchBox,
  Pager,
  Page,
  Row,
  AddButton,
  date,
  options,
  money,
  message,
} from './shared';
const nav = [
  { to: '/', label: 'Discover', icon: <ShoppingBag size={17} /> },
  { to: '/wishlist', label: 'Saved favourites', icon: <Heart size={17} /> },
  { to: '/cart', label: 'Your bag', icon: <ShoppingCart size={17} /> },
  { to: '/orders', label: 'Your orders', icon: <Package size={17} /> },
  { to: '/profile', label: 'Your profile', icon: <Users size={17} /> },
  { to: '/admin', label: 'Store overview', icon: <LayoutDashboard size={17} />, admin: true },
  {
    to: '/admin/products',
    label: 'Products & inventory',
    icon: <Package size={17} />,
    admin: true,
  },
  { to: '/admin/orders', label: 'Manage orders', icon: <ShoppingBag size={17} />, admin: true },
  { to: '/admin/customers', label: 'Customers', icon: <Users size={17} />, admin: true },
];
const icons: Record<string, typeof Package> = {
  headphones: Headphones,
  watch: Watch,
  keyboard: Keyboard,
  camera: Camera,
  speaker: Speaker,
  package: Package,
};
function ProductArt({ product, children }: { product: Row; children?: React.ReactNode }) {
  const Icon = icons[product.image] || Package;
  return (
    <div className="product-art">
      <Icon strokeWidth={1.2} />
      {children}
    </div>
  );
}
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <Guard>
            <Shell nav={nav}>
              <Routes>
                <Route index element={<Catalog />} />
                <Route path="products/:id" element={<ProductDetail />} />
                <Route path="wishlist" element={<Wishlist />} />
                <Route path="cart" element={<Cart />} />
                <Route path="checkout" element={<Checkout />} />
                <Route path="orders" element={<Orders />} />
                <Route path="orders/:id" element={<OrderDetail />} />
                <Route path="profile" element={<Profile />} />
                <Route
                  path="admin"
                  element={
                    <Guard roles={['ADMIN']}>
                      <Analytics />
                    </Guard>
                  }
                />
                <Route
                  path="admin/products"
                  element={
                    <Guard roles={['ADMIN']}>
                      <Inventory />
                    </Guard>
                  }
                />
                <Route
                  path="admin/orders"
                  element={
                    <Guard roles={['ADMIN']}>
                      <Orders admin />
                    </Guard>
                  }
                />
                <Route
                  path="admin/customers"
                  element={
                    <Guard roles={['ADMIN']}>
                      <Customers />
                    </Guard>
                  }
                />
                <Route path="*" element={<Empty title="Page not found" />} />
              </Routes>
            </Shell>
          </Guard>
        }
      />
    </Routes>
  );
}
function ProductCard({ p, saved = false }: { p: Row; saved?: boolean }) {
  const a = useActions();
  return (
    <article className="card">
      <ProductArt product={p}>
        <button
          aria-label={(saved ? 'Remove' : 'Save') + ' ' + p.name}
          className="heart"
          disabled={a.busy}
          onClick={() =>
            a.run(() =>
              saved ? api.delete('/wishlist/' + p.id) : api.post('/wishlist', { productId: p.id }),
            )
          }
        >
          <Heart fill={saved ? 'currentColor' : 'none'} />
        </button>
      </ProductArt>
      <div className="section-space">
        <span className="eyebrow">{p.category?.name}</span>
        <Link to={'/products/' + p.id}>
          <h3>{p.name}</h3>
        </Link>
        <p>
          {p.description.slice(0, 85)}
          {p.description.length > 85 ? '…' : ''}
        </p>
        <div className="card-bottom">
          <strong className="product-price">{money(p.price)}</strong>
          <button
            disabled={!p.stock || a.busy}
            onClick={() => a.run(() => api.post('/cart/items', { productId: p.id, quantity: 1 }))}
          >
            {p.stock ? 'Add to bag' : 'Sold out'}
            <Plus size={13} />
          </button>
        </div>
        {a.error && (
          <p role="alert" className="error">
            {a.error}
          </p>
        )}
      </div>
    </article>
  );
}
function Catalog() {
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState(''),
    [sort, setSort] = useState('newest'),
    [page, setPage] = useState(1);
  const cats = useData<Row[]>('/categories');
  const q = useData<Page>(
    `/products?search=${encodeURIComponent(search)}&sort=${sort}&page=${page}${category ? '&categoryId=' + category : ''}`,
  );
  return (
    <>
      <section className="shop-hero">
        <div>
          <span className="eyebrow">THE EVERYDAY, ELEVATED</span>
          <h1>
            Less noise.
            <br />
            More things you love.
          </h1>
          <p>A considered collection of useful, beautiful objects for your daily life.</p>
          <a href="#collection" className="primary">
            Explore the collection <ArrowUpRight size={15} />
          </a>
        </div>
        <Headphones />
      </section>
      <Heading
        eyebrow="GOOD FINDS, RIGHT HERE"
        title="The collection"
        subtitle="Designed to fit your life. Chosen to make it better."
      />
      <div id="collection" className="toolbar">
        <SearchBox
          value={search}
          onChange={(s) => {
            setSearch(s);
            setPage(1);
          }}
          placeholder="Find your next favourite…"
        />
        <select
          aria-label="Sort products"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
        >
          <option value="newest">Newest first</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </select>
      </div>
      <div className="pill-tabs">
        <button
          className={!category ? 'selected' : ''}
          onClick={() => {
            setCategory('');
            setPage(1);
          }}
        >
          Everything
        </button>
        {cats.data?.map((c) => (
          <button
            className={category === c.id ? 'selected' : ''}
            key={c.id}
            onClick={() => {
              setCategory(c.id);
              setPage(1);
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : (
        <>
          <div className="cards">
            {q.data.items.map((p) => (
              <ProductCard p={p} key={p.id} />
            ))}
          </div>
          {!q.data.items.length && (
            <Empty title="No matching finds" text="Try another search or category." />
          )}
          <Pager page={page} total={q.data.total} onChange={setPage} />
        </>
      )}
    </>
  );
}
function ProductDetail() {
  const { id } = useParams();
  const q = useData<Row>('/products/' + id);
  const a = useActions();
  const [quantity, setQuantity] = useState(1);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={q.refetch} />;
  const p = q.data;
  return (
    <>
      <Link to="/" className="back">
        <ArrowLeft size={15} />
        Back to collection
      </Link>
      <div className="detail-grid">
        <ProductArt product={p} />
        <section className="panel">
          <span className="eyebrow">{p.category.name}</span>
          <h1>{p.name}</h1>
          <strong className="product-price">{money(p.price)}</strong>
          <p className="section-space">{p.description}</p>
          <p className="muted">{p.stock} available · Shipping included in this demonstration</p>
          <label>
            Quantity
            <input
              type="number"
              value={quantity}
              min={1}
              max={Math.max(1, p.stock)}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </label>
          <div className="actions section-space">
            <button
              className="primary"
              disabled={a.busy || !p.stock}
              onClick={() => a.run(() => api.post('/cart/items', { productId: id, quantity }))}
            >
              Add to bag <Plus size={15} />
            </button>
            <button onClick={() => a.run(() => api.post('/wishlist', { productId: id }))}>
              <Heart size={15} />
              Save
            </button>
          </div>
          {a.error && <p className="error">{a.error}</p>}
        </section>
      </div>
    </>
  );
}
function Wishlist() {
  const q = useData<Row[]>('/wishlist');
  return (
    <>
      <Heading
        eyebrow="KEEP THE GOOD ONES CLOSE"
        title="Your favourites"
        subtitle="A little collection of things that caught your eye."
      />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : q.data.length ? (
        <div className="cards">
          {q.data.map((w) => (
            <ProductCard key={w.id} p={w.product} saved />
          ))}
        </div>
      ) : (
        <Empty title="A blank canvas" text="Save something from the collection to find it here." />
      )}
    </>
  );
}
function Cart() {
  const q = useData<Row>('/cart');
  const a = useActions();
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={q.refetch} />;
  const items = q.data.items,
    total = items.reduce((n: number, i: Row) => n + i.product.price * i.quantity, 0);
  return (
    <>
      <Heading
        eyebrow="YOUR CONSIDERED COLLECTION"
        title="In the bag"
        subtitle="Good choices. All in one place."
      />
      {a.error && (
        <p role="alert" className="error">
          {a.error}
        </p>
      )}
      {!items.length ? (
        <Empty
          title="Your bag is taking a breather"
          text="Explore the collection and add something you love."
        />
      ) : (
        <div className="cart-layout">
          <section className="panel">
            {items.map((i: Row) => (
              <div className="list-row" key={i.id}>
                <div className="cell-person">
                  <div className="avatar">
                    <Package size={16} />
                  </div>
                  <Link to={'/products/' + i.productId}>
                    <strong>{i.product.name}</strong>
                    <small>{money(i.product.price)} each</small>
                  </Link>
                </div>
                <div className="actions">
                  <button
                    aria-label={'Decrease ' + i.product.name}
                    disabled={i.quantity <= 1 || a.busy}
                    onClick={() =>
                      a.run(() => api.patch('/cart/items/' + i.id, { quantity: i.quantity - 1 }))
                    }
                  >
                    <Minus size={12} />
                  </button>
                  <span>{i.quantity}</span>
                  <button
                    aria-label={'Increase ' + i.product.name}
                    disabled={a.busy}
                    onClick={() =>
                      a.run(() => api.patch('/cart/items/' + i.id, { quantity: i.quantity + 1 }))
                    }
                  >
                    <Plus size={12} />
                  </button>
                  <strong>{money(i.quantity * i.product.price)}</strong>
                  <button
                    aria-label={'Remove ' + i.product.name}
                    disabled={a.busy}
                    onClick={() => a.run(() => api.delete('/cart/items/' + i.id))}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </section>
          <section className="panel">
            <h2>The details</h2>
            <div className="summary-line">
              <span>Subtotal</span>
              <span>{money(total)}</span>
            </div>
            <div className="summary-line">
              <span>Shipping</span>
              <span>Included</span>
            </div>
            <div className="summary-line summary-total">
              <span>Total</span>
              <strong>{money(total)}</strong>
            </div>
            <Link
              className="primary full"
              style={{ display: 'flex', marginTop: 20 }}
              to="/checkout"
            >
              Continue to checkout <ArrowUpRight size={16} />
            </Link>
            <p className="muted section-space">
              Prices and availability are verified by the server at checkout.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
function Checkout() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [order, setOrder] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const cart = useData<Row>('/cart');
  const previous = useData<Row>(params.get('orderId') ? '/orders/' + params.get('orderId') : '');
  const current = order || previous.data;
  async function pay(o: Row) {
    const p = await api.post('/payments/create', { orderId: o.id });
    if (p.data.mode === 'stripe') {
      window.location.assign(p.data.url);
      return;
    }
    setOrder(o);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const f = new FormData(e.currentTarget);
      const shippingAddress = Object.fromEntries(f.entries());
      const r = await api.post('/orders', { shippingAddress, idempotencyKey: key.current });
      await pay(r.data);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back" to="/cart">
        <ArrowLeft size={15} />
        Your bag
      </Link>
      <Heading
        eyebrow="JUST ONE MORE STEP"
        title="Make it yours"
        subtitle="We’ll keep the details simple."
      />
      <div className="notice">
        Portfolio checkout: demo payments are explicitly simulated. Stripe integration requires your
        own test credentials.
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {current ? (
        <section className="panel">
          <h2>Order reserved</h2>
          <p className="muted">
            Order {current.id} · {money(current.total)} · {date(current.expiresAt)}
          </p>
          <div className="actions">
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  if (current.payment?.provider === 'demo') {
                    await api.post('/payments/demo-confirm', { orderId: current.id });
                    navigate('/orders/' + current.id);
                  } else await pay(current);
                } catch (e) {
                  setError(message(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {current.payment?.provider === 'demo'
                ? 'Simulate successful test payment'
                : 'Open Stripe test checkout'}
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.post('/orders/' + current.id + '/cancel');
                  navigate('/orders');
                } catch (e) {
                  setError(message(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Cancel reservation
            </button>
          </div>
        </section>
      ) : (
        <div className="cart-layout">
          <section className="panel">
            <h2>Where should it go?</h2>
            <form onSubmit={submit} className="checkout-form">
              <div className="form-grid">
                <label className="full">
                  Full name
                  <input name="name" required minLength={2} autoComplete="name" />
                </label>
                <label className="full">
                  Address
                  <input name="line1" required minLength={5} autoComplete="street-address" />
                </label>
                <label>
                  City
                  <input name="city" required autoComplete="address-level2" />
                </label>
                <label>
                  Postal code
                  <input
                    name="postalCode"
                    required
                    minLength={4}
                    maxLength={12}
                    autoComplete="postal-code"
                  />
                </label>
                <label>
                  Country
                  <select name="country">
                    <option value="IN">India</option>
                  </select>
                </label>
              </div>
              <button className="primary" disabled={busy || !cart.data?.items.length}>
                {busy ? 'Reserving your order…' : 'Reserve order & continue'}
              </button>
            </form>
          </section>
          <section className="panel">
            <h2>Your collection</h2>
            {cart.data?.items.map((i: Row) => (
              <div className="summary-line" key={i.id}>
                <span>
                  {i.product.name} × {i.quantity}
                </span>
                <span>{money(i.quantity * i.product.price)}</span>
              </div>
            ))}
            <p className="muted section-space">
              Inventory is reserved atomically when the order is created. Unpaid demo reservations
              expire after 31 minutes.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
function Orders({ admin = false }: { admin?: boolean }) {
  const [page, setPage] = useState(1);
  const q = useData<Page>((admin ? '/admin/orders' : '/orders') + '?page=' + page);
  const a = useActions();
  const next: Record<string, string> = {
    CONFIRMED: 'PROCESSING',
    PROCESSING: 'SHIPPED',
    SHIPPED: 'DELIVERED',
  };
  return (
    <>
      <Heading
        eyebrow={admin ? 'THE STORE, IN MOTION' : 'GOOD THINGS ON THEIR WAY'}
        title={admin ? 'Manage orders' : 'Your orders'}
        subtitle={
          admin ? 'From confirmation to delivery.' : 'Every order, every detail, always here.'
        }
      />
      {a.error && <p className="error">{a.error}</p>}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  {admin && <th>Customer</th>}
                  <th>Date</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Next step</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((o) => (
                  <tr key={o.id}>
                    <td>
                      {admin ? (
                        o.id.slice(-8)
                      ) : (
                        <Link to={'/orders/' + o.id}>#{o.id.slice(-8)} ↗</Link>
                      )}
                    </td>
                    {admin && <td>{o.user.name}</td>}
                    <td>{date(o.createdAt)}</td>
                    <td>{money(o.total)}</td>
                    <td>
                      <Badge value={o.paymentStatus} />
                    </td>
                    <td>
                      <Badge value={o.status} />
                    </td>
                    <td>
                      {admin && next[o.status] ? (
                        <button
                          disabled={a.busy}
                          onClick={() =>
                            a.run(() =>
                              api.patch('/admin/orders/' + o.id + '/status', {
                                status: next[o.status],
                              }),
                            )
                          }
                        >
                          Mark {next[o.status].toLowerCase()}
                        </button>
                      ) : !admin && o.status === 'PENDING' ? (
                        <Link to={'/checkout?orderId=' + o.id}>Complete payment ↗</Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!q.data.items.length && <Empty />}
          <Pager page={page} total={q.data.total} onChange={setPage} />
        </>
      )}
    </>
  );
}
function OrderDetail() {
  const { id } = useParams();
  const q = useData<Row>('/orders/' + id);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={q.refetch} />;
  const o = q.data;
  return (
    <>
      <Link className="back" to="/orders">
        <ArrowLeft size={15} />
        Your orders
      </Link>
      <Heading
        eyebrow="EVERY DETAIL, SAVED"
        title={'Order #' + o.id.slice(-8)}
        subtitle={date(o.createdAt)}
      />
      <div className="detail-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Your collection</h2>
            <Badge value={o.status} />
          </div>
          {o.items.map((i: Row) => (
            <div className="summary-line" key={i.id}>
              <span>
                {i.productName} × {i.quantity}
              </span>
              <strong>{money(i.priceAtPurchase * i.quantity)}</strong>
            </div>
          ))}
          <div className="summary-line summary-total">
            <span>Total paid</span>
            <strong>{money(o.total)}</strong>
          </div>
          <p className="muted section-space">
            These are the prices recorded when your order was placed.
          </p>
        </section>
        <section className="panel">
          <h2>Delivery details</h2>
          <p>
            {o.shippingAddress.name}
            <br />
            {o.shippingAddress.line1}
            <br />
            {o.shippingAddress.city}, {o.shippingAddress.postalCode}
            <br />
            {o.shippingAddress.country}
          </p>
          <Badge value={o.paymentStatus} />
          <p className="muted section-space">Payment provider: {o.payment.provider}</p>
        </section>
      </div>
    </>
  );
}
function Profile() {
  const { user } = useAuth();
  return (
    <>
      <Heading
        eyebrow="YOUR LITTLE CORNER"
        title="Account details"
        subtitle="The person behind the good finds."
      />
      <section className="panel">
        <dl className="detail-list">
          <div>
            <dt>Name</dt>
            <dd>{user?.name}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user?.email}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{user?.role}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
function Analytics() {
  const q = useData<Row>('/admin/analytics');
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={q.refetch} />;
  const d = q.data;
  const days = Object.entries(d.days) as [string, number][];
  return (
    <>
      <Heading
        eyebrow="A CLEARER VIEW"
        title="Your store, at a glance"
        subtitle="Good decisions start with knowing where you stand."
      />
      <Stats
        items={[
          {
            label: 'Paid revenue',
            value: money(d.revenue),
            note: 'Confirmed payments only',
            icon: <IndianRupee size={18} />,
          },
          {
            label: 'Total orders',
            value: d.orders,
            note: 'Every chapter of the journey',
            icon: <ShoppingBag size={18} />,
          },
          {
            label: 'Customers',
            value: d.customers,
            note: 'People finding their favourites',
            icon: <Users size={18} />,
          },
          {
            label: 'Active products',
            value: d.products,
            note: 'A considered collection',
            icon: <Package size={18} />,
          },
        ]}
      />
      <div className="dashboard-grid">
        <section className="panel">
          <h2>Revenue · last 30 days</h2>
          {days.length ? (
            <div className="chart-bars">
              {days
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([day, v]) => (
                  <div title={day + ' ' + money(v)} key={day}>
                    <span
                      style={{
                        height: Math.max(5, (v / Math.max(...days.map(([, n]) => n))) * 130),
                      }}
                    />
                    <small>{day.slice(5)}</small>
                  </div>
                ))}
            </div>
          ) : (
            <Empty title="Your first sale is ahead" />
          )}
        </section>
        <section className="panel">
          <h2>Order journeys</h2>
          {d.statuses.map((s: Row) => (
            <div className="summary-line" key={s.status}>
              <Badge value={s.status} />
              <strong>{s._count._all}</strong>
            </div>
          ))}
        </section>
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <h2>Worth a restock</h2>
          {d.lowStock.map((p: Row) => (
            <div className="list-row" key={p.id}>
              <strong>{p.name}</strong>
              <Badge value={p.stock + ' LEFT'} />
            </div>
          ))}
          {!d.lowStock.length && <Empty title="All stocked up" />}
        </section>
        <section className="panel">
          <h2>Customer favourites</h2>
          {d.topProducts.map((p: Row) => (
            <div className="list-row" key={p.name}>
              <strong>{p.name}</strong>
              <small>{p.quantity} sold</small>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
function Inventory() {
  const [page, setPage] = useState(1),
    [modal, setModal] = useState<Row | null | false>(false),
    [catModal, setCatModal] = useState(false);
  const q = useData<Page>('/admin/products?page=' + page),
    cats = useData<Row[]>('/categories');
  const a = useActions();
  const fields: Field[] = [
    { name: 'name', label: 'Product name', required: true },
    {
      name: 'categoryId',
      label: 'Category',
      type: 'select',
      required: true,
      options: cats.data?.map((c) => ({ value: c.id, label: c.name })),
    },
    { name: 'price', label: 'Price in ₹', type: 'number', min: 0.01, step: '0.01', required: true },
    { name: 'stock', label: 'Available stock', type: 'number', min: 0, required: true },
    {
      name: 'image',
      label: 'Product illustration',
      type: 'select',
      required: true,
      options: options(Object.keys(icons)),
    },
    { name: 'description', label: 'Description', type: 'textarea', required: true },
  ];
  return (
    <>
      <Heading
        eyebrow="A WELL-KEPT COLLECTION"
        title="Products & inventory"
        subtitle="Keep your shelves thoughtful and your stock in check."
        action={
          <div className="actions">
            <button onClick={() => setCatModal(true)}>New category</button>
            <AddButton onClick={() => setModal(null)}>Add product</AddButton>
          </div>
        }
      />
      {a.error && <p className="error">{a.error}</p>}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Visibility</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                    </td>
                    <td>{p.category.name}</td>
                    <td>{money(p.price)}</td>
                    <td>{p.stock}</td>
                    <td>
                      <Badge value={p.active ? 'ACTIVE' : 'ARCHIVED'} />
                    </td>
                    <td className="actions">
                      <button onClick={() => setModal(p)}>Edit</button>
                      <button
                        disabled={a.busy}
                        onClick={() =>
                          a.run(() => api.patch('/products/' + p.id, { active: !p.active }))
                        }
                      >
                        {p.active ? 'Archive' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={q.data.total} onChange={setPage} />
        </>
      )}
      {modal !== false && (
        <RecordForm
          title={modal ? 'Edit product' : 'Add to the collection'}
          fields={fields}
          initial={modal ? { ...modal, price: modal.price / 100 } : { image: 'package' }}
          onClose={() => setModal(false)}
          onSave={(d) =>
            a.save(() =>
              modal
                ? api.patch('/products/' + modal.id, { ...d, price: Math.round(d.price * 100) })
                : api.post('/products', { ...d, price: Math.round(d.price * 100) }),
            )
          }
        />
      )}
      {catModal && (
        <RecordForm
          title="Create a category"
          fields={[
            { name: 'name', label: 'Category name', required: true },
            { name: 'slug', label: 'URL slug (lowercase-hyphens)', required: true },
          ]}
          onClose={() => setCatModal(false)}
          onSave={(d) => a.save(() => api.post('/categories', d))}
        />
      )}
    </>
  );
}
function Customers() {
  const [page, setPage] = useState(1);
  const q = useData<Page>('/admin/customers?page=' + page);
  return (
    <>
      <Heading
        eyebrow="THE PEOPLE WHO CHOOSE YOU"
        title="Your customers"
        subtitle="Good relationships are the heart of a good store."
      />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : (
        <>
          <section className="panel">
            {q.data.items.map((u) => (
              <div className="list-row" key={u.id}>
                <div className="cell-person">
                  <span className="avatar">{u.name[0]}</span>
                  <div>
                    <strong>{u.name}</strong>
                    <small>{u.email}</small>
                  </div>
                </div>
                <small>
                  {u._count.orders} orders · Joined {date(u.createdAt)}
                </small>
              </div>
            ))}
          </section>
          <Pager page={page} total={q.data.total} onChange={setPage} />
        </>
      )}
    </>
  );
}
