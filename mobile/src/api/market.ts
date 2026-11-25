/**
 * Rider runs, central M-Pesa payments and the ledger sheets, as typed calls
 * on the generated client. Types come from backend/openapi.json (run
 * `npm run gen:api` after the backend changes).
 */
import { api, unwrap, type Schemas } from './client';

export type RiderRules = Schemas['RiderRules'];
export type RideStatus = Schemas['OpenJobs']['ride_status'];
export type OpenJob = Schemas['OpenJob'];
export type OpenJobs = Schemas['OpenJobs'];
export type BlockedReason = OpenJob['blocked_reason'];
export type RiderDelivery = Schemas['RiderDelivery'];
export type Waypoint = Schemas['Waypoint'];
export type Run = Schemas['RiderRun'];
export type PaymentCheck = Schemas['PaymentCheck'];
export type ReceiptMatch = Schemas['PaymentMatch'];
export type RiderMe = Schemas['RiderMe'];

const id = (delivery_id: string) => ({ params: { path: { delivery_id } } });
const so = (store_order_id: string) => ({ params: { path: { store_order_id } } });

export const rider = {
  openJobs: () => unwrap(api.GET('/api/v1/rider/open-jobs')),
  claim: (storeOrderId: string) => unwrap(api.POST('/api/v1/rider/open-jobs/{store_order_id}/claim', so(storeOrderId))),
  skip: (storeOrderId: string) => unwrap(api.POST('/api/v1/rider/open-jobs/{store_order_id}/skip', so(storeOrderId))),
  run: () => unwrap(api.GET('/api/v1/rider/run')),
  arrived: (deliveryId: string) => unwrap(api.POST('/api/v1/rider/deliveries/{delivery_id}/arrived', id(deliveryId))),
  checkPayment: (deliveryId: string, q: string) =>
    unwrap(api.GET('/api/v1/rider/deliveries/{delivery_id}/payment', { params: { path: { delivery_id: deliveryId }, query: { q } } })),
  usePayment: (deliveryId: string, by: { code: string } | { receipt_id: string }) =>
    unwrap(api.POST('/api/v1/rider/deliveries/{delivery_id}/payment', { ...id(deliveryId), body: { code: null, receipt_id: null, ...by } })),
};

// ---------------------------------------------------------------------------
// Admin payments
// ---------------------------------------------------------------------------

export type ImportRow = Schemas['ImportedRow'];
export type ImportResult = Schemas['ImportOut'];
export type PaymentReceipt = Schemas['PaymentReceipt'];
export type ReceiptStatus = PaymentReceipt['status'];
export type Settlement = Schemas['Settlement'];

export const payments = {
  importText: (text: string, commit: boolean) => unwrap(api.POST('/api/v1/admin/payments/import', { body: { text, commit } })),
  list: (status?: ReceiptStatus, q?: string) => unwrap(api.GET('/api/v1/admin/payments', { params: { query: { status, q, page_size: 100 } } })),
  applyToOrder: (receiptId: string, orderNumber: string) =>
    unwrap(api.PATCH('/api/v1/admin/payments/{receipt_id}', { params: { path: { receipt_id: receiptId } }, body: { order_number: orderNumber } })),
  voidReceipt: (receiptId: string, note: string) =>
    unwrap(api.PATCH('/api/v1/admin/payments/{receipt_id}', { params: { path: { receipt_id: receiptId } }, body: { status: 'void', note } })),
  settlements: () => unwrap(api.GET('/api/v1/admin/settlements')),
  settle: (storeId: string, body: { reference: string; amount_cents?: number | null; note?: string | null; force?: boolean }) =>
    unwrap(api.POST('/api/v1/admin/settlements/{store_id}', { params: { path: { store_id: storeId } }, body: { amount_cents: null, note: null, force: false, ...body } })),
};

// ---------------------------------------------------------------------------
// Ledger sheets
// ---------------------------------------------------------------------------

export type SheetName = 'ledger' | 'sales' | 'payments' | 'inventory' | 'entries' | 'payouts';
export type Sheet = Schemas['SheetOut'];
export type SheetColumn = Schemas['Column'];
export type SheetEntry = Schemas['Entry'];
export type EntryIn = Schemas['EntryIn'];
export type EntryKind = EntryIn['kind'];
export type EntryStatus = SheetEntry['status'];

export const sheets = {
  vendor: (sheet: SheetName, from?: string, to?: string) =>
    // The route can also answer with CSV (?format=csv), which widens the generated type; this call asks for JSON.
    unwrap(api.GET('/api/v1/seller/sheets/{sheet}', { params: { path: { sheet }, query: { from, to, page_size: 200 } } })) as Promise<Sheet>,
  admin: (sheet: SheetName, storeId?: string, from?: string, to?: string) =>
    unwrap(api.GET('/api/v1/admin/sheets/{sheet}', { params: { path: { sheet }, query: { store_id: storeId, from, to, page_size: 200 } } })) as Promise<Sheet>,
  entries: (status?: EntryStatus) => unwrap(api.GET('/api/v1/seller/sheet-entries', { params: { query: { status, page_size: 100 } } })),
  addEntry: (e: EntryIn) => unwrap(api.POST('/api/v1/seller/sheet-entries', { body: e })),
  editEntry: (entryId: string, e: Partial<EntryIn>) =>
    unwrap(api.PATCH('/api/v1/seller/sheet-entries/{entry_id}', { params: { path: { entry_id: entryId } }, body: e })),
  deleteEntry: (entryId: string) => unwrap(api.DELETE('/api/v1/seller/sheet-entries/{entry_id}', { params: { path: { entry_id: entryId } } })),
  adminEntries: (status?: EntryStatus, storeId?: string) =>
    unwrap(api.GET('/api/v1/admin/sheet-entries', { params: { query: { status, store_id: storeId, page_size: 100 } } })),
  confirmEntry: (entryId: string, key: string) =>
    unwrap(api.POST('/api/v1/admin/sheet-entries/{entry_id}/confirm', { params: { path: { entry_id: entryId } }, body: { key, note: null } })),
  rejectEntry: (entryId: string, note: string) =>
    unwrap(api.POST('/api/v1/admin/sheet-entries/{entry_id}/reject', { params: { path: { entry_id: entryId } }, body: { note } })),
};

export type PaymentInfo = Schemas['PaymentDetails'];

export const shop = {
  saveForLater: (cartItemId: string) => unwrap(api.POST('/api/v1/cart/items/{item_id}/save-for-later', { params: { path: { item_id: cartItemId } } })),
};
