const fs = require('fs');
const path = require('path');

const config = require('./config.js');

const TERMINAL_STATUSES = new Set(['completed', 'declined', 'cancelled']);

function createDefaultStore() {
  return {
    version: 1,
    nextOrderNumber: 1,
    stats: {
      completed: 0,
      declined: 0,
      cancelled: 0
    },
    tickets: []
  };
}

function normalizeStats(rawStats) {
  const source = rawStats && typeof rawStats === 'object' ? rawStats : {};
  return {
    completed: Number.isInteger(source.completed) && source.completed >= 0 ? source.completed : 0,
    declined: Number.isInteger(source.declined) && source.declined >= 0 ? source.declined : 0,
    cancelled: Number.isInteger(source.cancelled) && source.cancelled >= 0 ? source.cancelled : 0
  };
}

function normalizeStore(raw) {
  const store = raw && typeof raw === 'object' ? raw : createDefaultStore();

  const nextOrderNumber =
    Number.isInteger(store.nextOrderNumber) && store.nextOrderNumber >= 1
      ? store.nextOrderNumber
      : 1;

  return {
    version: 1,
    nextOrderNumber,
    stats: normalizeStats(store.stats),
    tickets: Array.isArray(store.tickets) ? store.tickets : []
  };
}

function ensureStoreFile() {
  const dir = path.dirname(config.storage.filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(config.storage.filePath)) {
    writeStore(createDefaultStore());
  }
}

function readStore() {
  ensureStoreFile();

  try {
    const raw = JSON.parse(fs.readFileSync(config.storage.filePath, 'utf8'));
    return normalizeStore(raw);
  } catch (error) {
    console.error('[STORE] Failed to read tickets store:', error);
    return createDefaultStore();
  }
}

function writeStore(store) {
  const normalized = normalizeStore(store);
  const dir = path.dirname(config.storage.filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempPath = `${config.storage.filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`);
  fs.renameSync(tempPath, config.storage.filePath);
}

function reserveOrderNumber() {
  const store = readStore();
  const orderNumber = store.nextOrderNumber;
  store.nextOrderNumber += 1;
  writeStore(store);
  return orderNumber;
}

function addTicket(ticket) {
  const store = readStore();
  store.tickets.push(ticket);
  writeStore(store);
  return ticket;
}

function listTickets() {
  return readStore().tickets;
}

function getTicket(orderNumber) {
  const normalizedOrderNumber = Number(orderNumber);
  return listTickets().find((ticket) => Number(ticket.orderNumber) === normalizedOrderNumber) || null;
}

function findTicketByChannel(channelId) {
  return listTickets().find((ticket) => ticket.channelId === channelId) || null;
}

function findActiveTicketByCustomer(customerId) {
  return (
    listTickets().find(
      (ticket) => ticket.customerId === customerId && !TERMINAL_STATUSES.has(ticket.status)
    ) || null
  );
}

function updateTicket(orderNumber, updater) {
  const normalizedOrderNumber = Number(orderNumber);
  const store = readStore();
  const index = store.tickets.findIndex(
    (ticket) => Number(ticket.orderNumber) === normalizedOrderNumber
  );

  if (index === -1) return null;

  const current = store.tickets[index];
  const next =
    typeof updater === 'function'
      ? updater({ ...current })
      : {
          ...current,
          ...updater
        };

  next.updatedAt = new Date().toISOString();
  store.tickets[index] = next;
  writeStore(store);
  return next;
}

/**
 * Increments historical terminal counter and removes the closed ticket from active storage.
 * @param {number|string} orderNumber
 * @param {'completed'|'declined'|'cancelled'} status
 * @returns {boolean}
 */
function archiveAndRemoveTicket(orderNumber, status) {
  const normalizedOrderNumber = Number(orderNumber);
  const store = readStore();
  const initialLength = store.tickets.length;

  store.tickets = store.tickets.filter(
    (ticket) => Number(ticket.orderNumber) !== normalizedOrderNumber
  );

  if (store.tickets.length === initialLength) return false;

  if (TERMINAL_STATUSES.has(status)) {
    store.stats[status] = (store.stats[status] || 0) + 1;
  }

  writeStore(store);
  return true;
}

function deleteTicket(orderNumber) {
  const normalizedOrderNumber = Number(orderNumber);
  const store = readStore();
  const initialLength = store.tickets.length;
  store.tickets = store.tickets.filter(
    (ticket) => Number(ticket.orderNumber) !== normalizedOrderNumber
  );

  if (store.tickets.length === initialLength) return false;

  writeStore(store);
  return true;
}

function getAggregatedStats() {
  const store = readStore();
  const stats = {
    total: 0,
    new: 0,
    accepted: 0,
    completed: store.stats.completed || 0,
    declined: store.stats.declined || 0,
    cancelled: store.stats.cancelled || 0
  };

  for (const ticket of store.tickets) {
    if (Object.prototype.hasOwnProperty.call(stats, ticket.status)) {
      stats[ticket.status] += 1;
    }
  }

  stats.total =
    stats.new + stats.accepted + stats.completed + stats.declined + stats.cancelled;

  return stats;
}

module.exports = {
  TERMINAL_STATUSES,
  addTicket,
  archiveAndRemoveTicket,
  deleteTicket,
  findActiveTicketByCustomer,
  findTicketByChannel,
  getAggregatedStats,
  getTicket,
  listTickets,
  readStore,
  reserveOrderNumber,
  updateTicket
};
