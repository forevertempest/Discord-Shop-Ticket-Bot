const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT_DIR, '.env'), quiet: true });

const CONFIG_MD_PATH = path.join(ROOT_DIR, 'config.md');

/**
 * Parses a comma-separated environment variable into an array of non-empty strings.
 * @param {string} name
 * @param {string[]} [fallback=[]]
 * @returns {string[]}
 */
function listFromEnv(name, fallback = []) {
  const raw = process.env[name];
  if (!raw) return fallback;

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Parses config.md for single-line `- \`key\`: value` settings and `### [section]` markdown blocks.
 * @param {string} filePath
 * @returns {{ values: Record<string, string>, blocks: Record<string, string> }}
 */
function parseConfigMarkdown(filePath) {
  const values = {};
  const blocks = {};

  if (!fs.existsSync(filePath)) {
    return { values, blocks };
  }

  const raw = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');

  let currentBlockKey = null;
  let inFence = false;
  let fenceTicks = '';
  let fenceLines = [];

  for (const line of lines) {
    if (inFence) {
      const closeMatch = line.match(/^(`{3,})\s*$/);
      if (closeMatch && closeMatch[1].length >= fenceTicks.length) {
        if (currentBlockKey) {
          blocks[currentBlockKey] = fenceLines.join('\n').trim();
        }
        inFence = false;
        fenceTicks = '';
        fenceLines = [];
        currentBlockKey = null;
      } else {
        fenceLines.push(line);
      }
      continue;
    }

    const sectionMatch = line.match(/^###\s+\[([A-Za-z0-9_.-]+)\]\s*$/);
    if (sectionMatch) {
      currentBlockKey = sectionMatch[1].trim();
      continue;
    }

    if (currentBlockKey) {
      const openMatch = line.match(/^(`{3,})(?:markdown|md|text)?\s*$/i);
      if (openMatch) {
        inFence = true;
        fenceTicks = openMatch[1];
        fenceLines = [];
        continue;
      }
    }

    const kvMatch = line.match(/^\s*-\s+`([A-Za-z0-9_.-]+)`\s*:\s*(.+?)\s*$/);
    if (kvMatch) {
      values[kvMatch[1]] = kvMatch[2];
    }
  }

  return { values, blocks };
}

/**
 * Replaces `{placeholder}` tokens in a template string with values from `vars`.
 * @param {string} template
 * @param {Record<string, string|number|null|undefined>} [vars={}]
 * @returns {string}
 */
function format(template, vars = {}) {
  return String(template || '').replace(/\{([A-Za-z0-9_]+)\}/g, (full, key) => {
    if (
      Object.prototype.hasOwnProperty.call(vars, key) &&
      vars[key] !== undefined &&
      vars[key] !== null
    ) {
      return String(vars[key]);
    }
    return full;
  });
}

const parsedMd = parseConfigMarkdown(CONFIG_MD_PATH);

const mdVal = (key, fallback) =>
  Object.prototype.hasOwnProperty.call(parsedMd.values, key) ? parsedMd.values[key] : fallback;

const mdBool = (key, fallback) => {
  if (!Object.prototype.hasOwnProperty.call(parsedMd.values, key)) return fallback;
  const normalized = String(parsedMd.values[key]).trim().toLowerCase();
  if (['true', '1', 'yes', 'да'].includes(normalized)) return true;
  if (['false', '0', 'no', 'нет'].includes(normalized)) return false;
  return fallback;
};

const mdNum = (key, fallback) => {
  if (!Object.prototype.hasOwnProperty.call(parsedMd.values, key)) return fallback;
  const parsed = Number(parsedMd.values[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const mdBlock = (key, fallback) =>
  Object.prototype.hasOwnProperty.call(parsedMd.blocks, key) ? parsedMd.blocks[key] : fallback;

const panelImageFile = mdVal('panel.imageFile', 'test.png');
const panelMaxUploadMB = mdNum('panel.maxUploadMB', 7.5);

module.exports = {
  configMdPath: CONFIG_MD_PATH,
  format,

  token: process.env.TOKEN || process.env.DISCORD_TOKEN || '',
  guildId: process.env.GUILD_ID || '',

  registerCommandsOnReady: mdBool('bot.registerCommandsOnReady', true),

  managers: {
    userIds: listFromEnv('MANAGER_USER_IDS')
  },

  sellers: {
    roleIds: listFromEnv('SELLER_ROLE_IDS')
  },

  categories: {
    activeId: process.env.ACTIVE_ORDERS_CATEGORY_ID || '',
    archiveId: process.env.ARCHIVE_ORDERS_CATEGORY_ID || '',
    activeName: mdVal('categories.activeName', 'дизайн-заказы'),
    archiveName: mdVal('categories.archiveName', 'архив-дизайн-заказов'),
    autoCreateIfMissing: mdBool('categories.autoCreateIfMissing', true)
  },

  links: {
    reviewsChannelUrl: (process.env.REVIEWS_CHANNEL_URL || '').trim()
  },

  panel: {
    imagePath: path.join(ROOT_DIR, 'Assets', panelImageFile),
    imageAttachmentName: panelImageFile,
    optimizedImageAttachmentName: `${path.parse(panelImageFile).name}.webp`,
    maxUploadBytes: panelMaxUploadMB * 1024 * 1024,
    maxOptimizedWidth: Math.round(mdNum('panel.maxOptimizedWidth', 2200)),
    imageDescription: mdVal('panel.imageDescription', 'Заказ дизайна'),
    showText: mdBool('panel.showText', false),
    text: mdBlock(
      'panelText',
      [
        '# Заказ дизайна',
        '> ***Нажмите кнопку ниже, чтобы оформить заявку на дизайн.***',
        '> ***Если дизайн был выигран, выберите отдельную кнопку.***'
      ].join('\n')
    )
  },

  storage: {
    filePath: path.join(ROOT_DIR, 'data', 'tickets.json')
  },

  commands: {
    name: mdVal('commands.name', 'shop'),
    description: mdVal('commands.description', 'Панель и статистика дизайн-заказов'),
    panelDescription: mdVal('commands.panelDescription', 'Отправить панель оформления дизайн-заказов'),
    panelChannelOptionDescription: mdVal(
      'commands.panelChannelOptionDescription',
      'Канал для отправки панели (по умолчанию — текущий канал)'
    ),
    statsDescription: mdVal('commands.statsDescription', 'Показать статистику дизайн-заказов')
  },

  channelName: {
    separator: mdVal('channelName.separator', '・'),
    orderBase: mdVal('channelName.orderBase', 'заказ'),
    wonBase: mdVal('channelName.wonBase', 'выигрыш')
  },

  statusEmojis: {
    new: mdVal('statusEmojis.new', '🔴'),
    accepted: mdVal('statusEmojis.accepted', '🔵'),
    completed: mdVal('statusEmojis.completed', '🔘'),
    declined: mdVal('statusEmojis.declined', '⚫'),
    cancelled: mdVal('statusEmojis.cancelled', '⚫')
  },

  subjects: {
    order: mdVal('subjects.order', 'заказ'),
    won: mdVal('subjects.won', 'выигрыш в розыгрыше')
  },

  statusLabels: {
    new: mdVal('statusLabels.new', 'ожидает продавца'),
    accepted: mdVal('statusLabels.accepted', 'в работе'),
    completed: mdVal('statusLabels.completed', 'выполнен'),
    declined: mdVal('statusLabels.declined', 'отказ'),
    cancelled: mdVal('statusLabels.cancelled', 'заказчик передумал')
  },

  sellerStatus: {
    acceptedSelf: mdVal('sellerStatus.acceptedSelf', 'Вы взяли этот заказ.'),
    acceptedOther: mdVal('sellerStatus.acceptedOther', 'Заказ взял продавец <@{sellerId}>.'),
    terminalLine: mdVal('sellerStatus.terminalLine', 'Статус: {statusLabel}.')
  },

  channelHeaders: {
    order: mdVal('channelHeaders.order', 'Заказ — {username}'),
    won: mdVal('channelHeaders.won', 'Выигрыш в розыгрыше — {username}')
  },

  reviews: {
    promptLine: mdVal('reviews.promptLine', '> ***Оставьте свой отзыв: {reviewsUrl}***')
  },

  workflow: {
    includeAcceptButton: mdBool('workflow.includeAcceptButton', true),
    autoAcceptOnManagerMessage: mdBool('workflow.autoAcceptOnManagerMessage', false),
    archiveCompletedTickets: mdBool('workflow.archiveCompletedTickets', true)
  },

  modal: {
    titleByType: {
      order: mdVal('modal.titleOrder', 'Заказать дизайн'),
      won: mdVal('modal.titleWon', 'Выиграл дизайн')
    },
    requestInput: {
      id: 'design_request',
      label: mdVal('modal.requestInput.label', 'Что вы желаете заказать?'),
      placeholder: mdVal('modal.requestInput.placeholder', 'Например: дизайн аватарки'),
      maxLength: Math.round(mdNum('modal.requestInput.maxLength', 150)),
      required: mdBool('modal.requestInput.required', true)
    },
    paymentInput: {
      id: 'payment_method',
      label: mdVal('modal.paymentInput.label', 'Желаемый тип оплаты'),
      placeholder: mdVal('modal.paymentInput.placeholder', 'Например: Рубли, USDT, СБП'),
      maxLength: Math.round(mdNum('modal.paymentInput.maxLength', 80)),
      required: mdBool('modal.paymentInput.required', true)
    },
    wonServerInput: {
      id: 'won_server',
      label: mdVal('modal.wonServerInput.label', 'На каком сервере выиграли?'),
      placeholder: mdVal('modal.wonServerInput.placeholder', 'Название или ссылка сервера'),
      maxLength: Math.round(mdNum('modal.wonServerInput.maxLength', 100)),
      required: mdBool('modal.wonServerInput.required', true)
    },
    wonPrizeInput: {
      id: 'won_prize',
      label: mdVal('modal.wonPrizeInput.label', 'Что выиграли?'),
      placeholder: mdVal('modal.wonPrizeInput.placeholder', 'Например: дизайн аватарки'),
      maxLength: Math.round(mdNum('modal.wonPrizeInput.maxLength', 150)),
      required: mdBool('modal.wonPrizeInput.required', true)
    }
  },

  labels: {
    orderButton: mdVal('labels.orderButton', 'Заказать дизайн'),
    wonButton: mdVal('labels.wonButton', 'Выиграл дизайн'),
    acceptButton: mdVal('labels.acceptButton', 'Взять заказ'),
    completeButton: mdVal('labels.completeButton', 'Выполнен'),
    declineButton: mdVal('labels.declineButton', 'Отказаться'),
    cancelButton: mdVal('labels.cancelButton', 'Я передумал'),
    orderType: mdVal('labels.orderType', 'Заказ дизайна'),
    wonType: mdVal('labels.wonType', 'Выигранный дизайн')
  },

  buttons: {
    panelStyle: mdVal('buttons.panelStyle', 'Secondary'),
    actionStyle: mdVal('buttons.actionStyle', 'Secondary'),
    terminalStyle: mdVal('buttons.terminalStyle', 'Secondary')
  },

  templates: {
    customerTicketOrder: mdBlock(
      'customerTicketOrder',
      [
        '# {username}, ваш заказ создан!',
        '> ***Обсудите детали заказа здесь: {channelUrl}***',
        '## *Если вы передумали, нажмите кнопку ниже!*'
      ].join('\n')
    ),
    customerTicketWon: mdBlock(
      'customerTicketWon',
      [
        '# {username}, ваше получение выигрыша в розыгрыше!',
        '> ***Обсудите получение выигрыша здесь: {channelUrl}***',
        '## *Если вы передумали, нажмите кнопку ниже!*'
      ].join('\n')
    ),
    ticketCreatedReplyOrder: mdBlock(
      'ticketCreatedReplyOrder',
      ['# {username}, ваш заказ создан!', '> ***Канал заказа: {channelUrl}***'].join('\n')
    ),
    ticketCreatedReplyWon: mdBlock(
      'ticketCreatedReplyWon',
      [
        '# {username}, ваш выигрыш в розыгрыше зарегистрирован!',
        '> ***Канал выигрыша: {channelUrl}***'
      ].join('\n')
    ),
    sellerDmOrder: mdBlock(
      'sellerDmOrder',
      [
        '# Заказ — {username}',
        '***Линк: <@{userId}>***',
        '***ID: `{userId}`***',
        '***Тип заказа: `{orderType}`***',
        '***Желает заказать:***\n```{request}```',
        '***Желаемый тип оплаты:***\n```{payment}```{terminalBlock}'
      ].join('\n')
    ),
    sellerDmWon: mdBlock(
      'sellerDmWon',
      [
        '# Выигрыш — {username}',
        '***Линк: <@{userId}>***',
        '***ID: `{userId}`***',
        '***На каком сервере выиграли:***\n```{wonServer}```',
        '***Что выиграли:***\n```{wonPrize}```{terminalBlock}'
      ].join('\n')
    ),
    sellerCancelNoticeOrder: mdBlock(
      'sellerCancelNoticeOrder',
      [
        '# Заказчик передумал — заказ {username}',
        '***Линк: <@{userId}>***',
        '***ID: `{userId}`***',
        '***Желал заказать:***\n\n```{request}```',
        '***Желаемый тип оплаты:***\n```{payment}```'
      ].join('\n')
    ),
    sellerCancelNoticeWon: mdBlock(
      'sellerCancelNoticeWon',
      [
        '# Победитель передумал — выигрыш в розыгрыше {username}',
        '***Линк: <@{userId}>***',
        '***ID: `{userId}`***',
        '***На каком сервере выиграли:***\n\n```{wonServer}```',
        '***Что выиграли:***\n```{wonPrize}```'
      ].join('\n')
    ),
    channelAcceptedNotice: mdBlock(
      'channelAcceptedNotice',
      ['<@{userId}>', '> ***{Subject} взял в работу продавец <@{sellerId}>.***'].join('\n')
    ),
    channelStatusChangedNotice: mdBlock(
      'channelStatusChangedNotice',
      '> ***Статус {subject} изменен: {statusLabel}.***'
    ),
    customerFinalOrderCompleted: mdBlock(
      'customerFinalOrderCompleted',
      ['# {username}, ваш заказ выполнен!', '> ***Спасибо за ваш заказ!***{reviewsLine}'].join('\n')
    ),
    customerFinalOrderDeclined: mdBlock(
      'customerFinalOrderDeclined',
      '# {username}\n> ***По вашему заказу отказ.***'
    ),
    customerFinalOrderCancelled: mdBlock(
      'customerFinalOrderCancelled',
      '# {username}\n> ***Ваш заказ отменен.***'
    ),
    customerFinalWonCompleted: mdBlock(
      'customerFinalWonCompleted',
      '# {username}, ваш выигрыш в розыгрыше обработан!{reviewsLine}'
    ),
    customerFinalWonDeclined: mdBlock(
      'customerFinalWonDeclined',
      '# {username}\n> ***По вашему выигрышу в розыгрыше отказ.***'
    ),
    customerFinalWonCancelled: mdBlock(
      'customerFinalWonCancelled',
      '# {username}\n> ***Ваш выигрыш в розыгрыше отменен.***'
    ),
    statsContainer: mdBlock(
      'statsContainer',
      [
        '# Статистика заказов',
        '*`Всего создано:` {total}*',
        '*`Ожидают продавца:` {new}*',
        '*`В работе:` {accepted}*',
        '*`Выполнены:` {completed}*',
        '*`Отменен продавцом:` {declined}*',
        '*`Отменен заказчиком:` {cancelled}*'
      ].join('\n')
    ),
    noticeNoCommandAccess: mdBlock(
      'noticeNoCommandAccess',
      '## *У вас нет доступа к этой команде.*'
    ),
    noticeInvalidPanelChannel: mdBlock(
      'noticeInvalidPanelChannel',
      '# Канал не подходит\n> ***Выберите текстовый канал сервера.***'
    ),
    noticePanelSent: mdBlock(
      'noticePanelSent',
      '# Панель отправлена\n> ***Канал: <#{channelId}>***'
    ),
    noticeActiveTicketExists: mdBlock(
      'noticeActiveTicketExists',
      [
        '# У вас уже есть активный тикет',
        '> ***Канал: {channelUrl}***',
        '> ***Новый тикет можно создать после завершения или отмены текущего.***'
      ].join('\n')
    ),
    noticeInvalidSellerRolesGuildId: mdBlock(
      'noticeInvalidSellerRolesGuildId',
      [
        '# Неверная настройка SELLER_ROLE_IDS',
        '> ***В конфигурации указан ID сервера (@everyone). Укажите ID роли продавцов, которым бот будет отправлять заказы в ЛС.***'
      ].join('\n')
    ),
    noticeMissingSellerRoles: mdBlock(
      'noticeMissingSellerRoles',
      '# Настройка не завершена\n> ***Укажите SELLER_ROLE_IDS в файле .env.***'
    ),
    noticeNoSellersFound: mdBlock(
      'noticeNoSellersFound',
      '# Продавцы не найдены\n> ***На сервере нет участников с ролью из SELLER_ROLE_IDS, либо у бота не включен Server Members Intent.***'
    ),
    noticeTicketAlreadyAccepted: mdBlock(
      'noticeTicketAlreadyAccepted',
      '# {Subject} уже обработан\n> ***{Subject} больше не ожидает принятия.***'
    ),
    noticeTicketAlreadyClosed: mdBlock(
      'noticeTicketAlreadyClosed',
      '# {Subject} уже закрыт\n> ***Повторное действие не требуется.***'
    ),
    noticeTicketNotFound: mdBlock(
      'noticeTicketNotFound',
      '# Тикет не найден\n> ***Запись уже завершена или отсутствует в хранилище.***'
    ),
    noticeOnlyCustomerCanCancel: mdBlock(
      'noticeOnlyCustomerCanCancel',
      '# Нет доступа\n> ***Отменить {subject} может только заказчик, который его создал.***'
    ),
    noticeOnlySellerCanManage: mdBlock(
      'noticeOnlySellerCanManage',
      '# Нет доступа\n> ***Управлять заказом может только продавец с ролью из SELLER_ROLE_IDS.***'
    ),
    noticeTicketNotAcceptedYet: mdBlock(
      'noticeTicketNotAcceptedYet',
      '# {Subject} еще не принят\n> ***Сначала нажмите кнопку «{acceptButton}».***'
    ),
    noticeOnlyAssignedSellerCanClose: mdBlock(
      'noticeOnlyAssignedSellerCanClose',
      '# Нет доступа\n> ***Завершить или отклонить заказ может только продавец, который его принял.***'
    ),
    noticeUnknownButtonAction: mdBlock(
      'noticeUnknownButtonAction',
      '# Неизвестное действие\n> ***Кнопка не распознана ботом.***'
    ),
    noticeInteractionError: mdBlock(
      'noticeInteractionError',
      '# Ошибка\n> ***{errorMessage}***'
    )
  }
};
