import postgres from 'postgres';
import {
  CustomerField,
  CustomersTableType,
  Invoice,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  Revenue,
} from './definitions';
import { formatCurrency } from './utils';
import {
  invoices as placeholderInvoices,
  customers as placeholderCustomers,
  revenue as placeholderRevenue,
} from './placeholder-data';

// If a connection string isn't supplied we won't attempt to connect to Postgres
const hasDatabaseUrl = !!process.env.POSTGRES_URL;

// sql will be null when no DB connection is possible. Always check for truthiness
const sql = hasDatabaseUrl ? postgres(process.env.POSTGRES_URL!, { ssl: 'require' }) : null;

/* -------------------------------------------------------------------------- */
/*                               Helper utils                                */
/* -------------------------------------------------------------------------- */

function mergeInvoiceCustomer(inv: Invoice & { customer_id: string }) {
  const customer = placeholderCustomers.find((c) => c.id === inv.customer_id);
  if (!customer) return null;
  return {
    id: inv.id,
    customer_id: inv.customer_id,
    name: customer.name,
    email: customer.email,
    image_url: customer.image_url,
    date: inv.date,
    amount: inv.amount,
    status: inv.status,
  } as InvoicesTable;
}

export async function fetchRevenue() {
  // If we don't have a DB connection just return local placeholder data
  if (!sql) {
    return placeholderRevenue;
  }

  try {
    // We artificially delay a response for demo purposes.
    // Don't do this in production :)
    console.log('Fetching revenue data...');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const db = sql!;
    const data = await db<Revenue[]>`SELECT * FROM revenue`;

    console.log('Data fetch completed after 3 seconds.');

    return data;
  } catch (error) {
    console.error('Database Error:', error);
    return placeholderRevenue;
  }
}

export async function fetchLatestInvoices() {
  if (!sql) {
    // Join placeholder invoices & customers and format
    const latestInvoicesJoin = [...placeholderInvoices]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 5)
      .map((inv) => {
        const cust = placeholderCustomers.find((c) => c.id === inv.customer_id)!;
        return {
          id: inv.id,
          name: cust.name,
          image_url: cust.image_url,
          email: cust.email,
          amount: formatCurrency(inv.amount),
        };
      });
    return latestInvoicesJoin;
  }

  try {
    const db = sql!;
    const data = await db<LatestInvoiceRaw[]>`
      SELECT invoices.amount, customers.name, customers.image_url, customers.email, invoices.id
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      ORDER BY invoices.date DESC
      LIMIT 5`;

    const latestInvoices = data.map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
    return latestInvoices;
  } catch (error) {
    console.error('Database Error:', error);
    // Fallback
    const latestInvoicesJoin = [...placeholderInvoices]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 5)
      .map((inv) => {
        const cust = placeholderCustomers.find((c) => c.id === inv.customer_id)!;
        return {
          id: inv.id,
          name: cust.name,
          image_url: cust.image_url,
          email: cust.email,
          amount: formatCurrency(inv.amount),
        };
      });
    return latestInvoicesJoin;
  }
}

export async function fetchCardData() {
  if (!sql) {
    const numberOfInvoices = placeholderInvoices.length;
    const numberOfCustomers = placeholderCustomers.length;
    const totalPaidInvoices = formatCurrency(
      placeholderInvoices
        .filter((i) => i.status === 'paid')
        .reduce((acc, cur) => acc + cur.amount, 0),
    );
    const totalPendingInvoices = formatCurrency(
      placeholderInvoices
        .filter((i) => i.status === 'pending')
        .reduce((acc, cur) => acc + cur.amount, 0),
    );

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  }

  try {
    // You can probably combine these into a single SQL query
    // However, we are intentionally splitting them to demonstrate
    // how to initialize multiple queries in parallel with JS.
    const db = sql!;
    const invoiceCountPromise = db`SELECT COUNT(*) FROM invoices`;
    const customerCountPromise = db`SELECT COUNT(*) FROM customers`;
    const invoiceStatusPromise = db`SELECT
         SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS "paid",
         SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS "pending"
         FROM invoices`;

    const data = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    const numberOfInvoices = Number(data[0][0].count ?? '0');
    const numberOfCustomers = Number(data[1][0].count ?? '0');
    const totalPaidInvoices = formatCurrency(data[2][0].paid ?? '0');
    const totalPendingInvoices = formatCurrency(data[2][0].pending ?? '0');

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error('Database Error:', error);
    // Fallback to placeholder
    const numberOfInvoices = placeholderInvoices.length;
    const numberOfCustomers = placeholderCustomers.length;
    const totalPaidInvoices = formatCurrency(
      placeholderInvoices
        .filter((i) => i.status === 'paid')
        .reduce((acc, cur) => acc + cur.amount, 0),
    );
    const totalPendingInvoices = formatCurrency(
      placeholderInvoices
        .filter((i) => i.status === 'pending')
        .reduce((acc, cur) => acc + cur.amount, 0),
    );
    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number,
) {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  if (!sql) {
    // Local filtering when no database is available
    const normalizedQuery = query.toLowerCase();

    const merged = placeholderInvoices
      .map((inv) => mergeInvoiceCustomer(inv))
      .filter((row): row is InvoicesTable => !!row);

    const filtered = merged.filter((row) => {
      return (
        row.name.toLowerCase().includes(normalizedQuery) ||
        row.email.toLowerCase().includes(normalizedQuery) ||
        row.amount.toString().includes(normalizedQuery) ||
        row.date.toString().includes(normalizedQuery) ||
        row.status.toLowerCase().includes(normalizedQuery)
      );
    });

    return filtered
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(offset, offset + ITEMS_PER_PAGE);
  }

  try {
    const db = sql!;
    const invoices = await db<InvoicesTable[]>`
      SELECT
        invoices.id,
        invoices.amount,
        invoices.date,
        invoices.status,
        customers.name,
        customers.email,
        customers.image_url
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      WHERE
        customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`} OR
        invoices.amount::text ILIKE ${`%${query}%`} OR
        invoices.date::text ILIKE ${`%${query}%`} OR
        invoices.status ILIKE ${`%${query}%`}
      ORDER BY invoices.date DESC
      LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    `;

    return invoices;
  } catch (error) {
    console.error('Database Error:', error);
    // Fallback
    const normalizedQuery = query.toLowerCase();
    const merged = placeholderInvoices
      .map((inv) => mergeInvoiceCustomer(inv))
      .filter((row): row is InvoicesTable => !!row);

    const filtered = merged.filter((row) => {
      return (
        row.name.toLowerCase().includes(normalizedQuery) ||
        row.email.toLowerCase().includes(normalizedQuery) ||
        row.amount.toString().includes(normalizedQuery) ||
        row.date.toString().includes(normalizedQuery) ||
        row.status.toLowerCase().includes(normalizedQuery)
      );
    });

    return filtered
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(offset, offset + ITEMS_PER_PAGE);
  }
}

export async function fetchInvoicesPages(query: string) {
  if (!sql) {
    const normalizedQuery = query.toLowerCase();

    const merged = placeholderInvoices
      .map((inv) => mergeInvoiceCustomer(inv))
      .filter((row): row is InvoicesTable => !!row);

    const filteredCount = merged.filter((row) => {
      return (
        row.name.toLowerCase().includes(normalizedQuery) ||
        row.email.toLowerCase().includes(normalizedQuery) ||
        row.amount.toString().includes(normalizedQuery) ||
        row.date.toString().includes(normalizedQuery) ||
        row.status.toLowerCase().includes(normalizedQuery)
      );
    }).length;

    return Math.ceil(filteredCount / ITEMS_PER_PAGE);
  }

  try {
    const db = sql!;
    const data = await db`SELECT COUNT(*)
    FROM invoices
    JOIN customers ON invoices.customer_id = customers.id
    WHERE
      customers.name ILIKE ${`%${query}%`} OR
      customers.email ILIKE ${`%${query}%`} OR
      invoices.amount::text ILIKE ${`%${query}%`} OR
      invoices.date::text ILIKE ${`%${query}%`} OR
      invoices.status ILIKE ${`%${query}%`}
  `;

    const totalPages = Math.ceil(Number(data[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    const normalizedQuery = query.toLowerCase();
    const merged = placeholderInvoices
      .map((inv) => mergeInvoiceCustomer(inv))
      .filter((row): row is InvoicesTable => !!row);
    const filteredCount = merged.filter((row) => {
      return (
        row.name.toLowerCase().includes(normalizedQuery) ||
        row.email.toLowerCase().includes(normalizedQuery) ||
        row.amount.toString().includes(normalizedQuery) ||
        row.date.toString().includes(normalizedQuery) ||
        row.status.toLowerCase().includes(normalizedQuery)
      );
    }).length;

    return Math.ceil(filteredCount / ITEMS_PER_PAGE);
  }
}

export async function fetchInvoiceById(id: string) {
  if (!sql) {
    const inv = placeholderInvoices.find((i) => i.id === id);
    if (!inv) return undefined;
    return {
      ...inv,
      amount: inv.amount / 100,
    } as InvoiceForm;
  }

  try {
    const db = sql!;
    const data = await db<InvoiceForm[]>`
      SELECT
        invoices.id,
        invoices.customer_id,
        invoices.amount,
        invoices.status
      FROM invoices
      WHERE invoices.id = ${id};
    `;

    const invoice = data.map((invoice) => ({
      ...invoice,
      // Convert amount from cents to dollars
      amount: invoice.amount / 100,
    }));

    console.log(invoice); // Invoice is an empty array []
    return invoice[0];
  } catch (error) {
    console.error('Database Error:', error);
    const inv = placeholderInvoices.find((i) => i.id === id);
    if (!inv) return undefined;
    return {
      ...inv,
      amount: inv.amount / 100,
    } as InvoiceForm;
  }
}

export async function fetchCustomers() {
  if (!sql) {
    return placeholderCustomers.map((c) => ({ id: c.id, name: c.name }));
  }

  try {
    const db = sql!;
    const customers = await db<CustomerField[]>`
      SELECT
        id,
        name
      FROM customers
      ORDER BY name ASC
    `;

    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    return placeholderCustomers.map((c) => ({ id: c.id, name: c.name }));
  }
}

export async function fetchFilteredCustomers(query: string) {
  if (!sql) {
    const normalizedQuery = query.toLowerCase();
    const data = placeholderCustomers.map((customer) => {
      const customerInvoices = placeholderInvoices.filter(
        (inv) => inv.customer_id === customer.id,
      );
      const total_pending = customerInvoices
        .filter((i) => i.status === 'pending')
        .reduce((acc, cur) => acc + cur.amount, 0);
      const total_paid = customerInvoices
        .filter((i) => i.status === 'paid')
        .reduce((acc, cur) => acc + cur.amount, 0);

      return {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        image_url: customer.image_url,
        total_invoices: customerInvoices.length,
        total_pending,
        total_paid,
      } as CustomersTableType;
    });

    const filtered = data.filter(
      (cust) =>
        cust.name.toLowerCase().includes(normalizedQuery) ||
        cust.email.toLowerCase().includes(normalizedQuery),
    );

    const formatted = filtered.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return formatted;
  }

  try {
    const db = sql!;
    const data = await db<CustomersTableType[]>`
		SELECT
		  customers.id,
		  customers.name,
		  customers.email,
		  customers.image_url,
		  COUNT(invoices.id) AS total_invoices,
		  SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
		  SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
		FROM customers
		LEFT JOIN invoices ON customers.id = invoices.customer_id
		WHERE
		  customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`}
		GROUP BY customers.id, customers.name, customers.email, customers.image_url
		ORDER BY customers.name ASC
	  `;

    const customers = data.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    // Fallback to local
    const normalizedQuery = query.toLowerCase();
    const data = placeholderCustomers.map((customer) => {
      const customerInvoices = placeholderInvoices.filter(
        (inv) => inv.customer_id === customer.id,
      );
      const total_pending = customerInvoices
        .filter((i) => i.status === 'pending')
        .reduce((acc, cur) => acc + cur.amount, 0);
      const total_paid = customerInvoices
        .filter((i) => i.status === 'paid')
        .reduce((acc, cur) => acc + cur.amount, 0);

      return {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        image_url: customer.image_url,
        total_invoices: customerInvoices.length,
        total_pending,
        total_paid,
      } as CustomersTableType;
    });

    const filtered = data.filter(
      (cust) =>
        cust.name.toLowerCase().includes(normalizedQuery) ||
        cust.email.toLowerCase().includes(normalizedQuery),
    );

    const formatted = filtered.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return formatted;
  }
}
