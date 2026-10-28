const PREFIX = 'stb';

const customIds = {
  open: (type) => `${PREFIX}:open:${type}`,
  modal: (type) => `${PREFIX}:modal:${type}`,
  accept: (orderNumber) => `${PREFIX}:accept:${orderNumber}`,
  complete: (orderNumber) => `${PREFIX}:complete:${orderNumber}`,
  decline: (orderNumber) => `${PREFIX}:decline:${orderNumber}`,
  cancel: (orderNumber) => `${PREFIX}:cancel:${orderNumber}`
};

/**
 * Parses a button or modal customId with the bot prefix.
 * @param {string} customId
 * @returns {{ action: string, value: string } | null}
 */
function parseCustomId(customId) {
  const [prefix, action, value] = String(customId || '').split(':');
  if (prefix !== PREFIX || !action) return null;
  return { action, value: value || '' };
}

module.exports = {
  PREFIX,
  customIds,
  parseCustomId
};
