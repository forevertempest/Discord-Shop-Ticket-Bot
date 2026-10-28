const fs = require('fs');
const sharp = require('sharp');
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder
} = require('discord.js');

const config = require('./config.js');
const { customIds } = require('./customIds.js');

const V2_FLAGS = MessageFlags.IsComponentsV2;
const V2_EPHEMERAL_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

function buttonStyle(name) {
  return ButtonStyle[name] || ButtonStyle.Secondary;
}

function noMentions() {
  return { parse: [] };
}

function buildMessagePayload(container, options = {}) {
  const payload = {
    components: [container],
    flags: options.ephemeral ? V2_EPHEMERAL_FLAGS : V2_FLAGS,
    allowedMentions: options.allowedMentions || noMentions()
  };

  if (options.files?.length) {
    payload.files = options.files;
  }

  return payload;
}

function getGuildIconUrl(guild, client) {
  return (
    guild?.iconURL({ extension: 'png', size: 128, forceStatic: true }) ||
    client?.user?.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true }) ||
    null
  );
}

function buildSection(guild, client, content) {
  const section = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(content)
  );
  const thumbnailUrl = getGuildIconUrl(guild, client);

  if (thumbnailUrl) {
    section.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(thumbnailUrl)
        .setDescription(guild?.name || 'Server avatar')
    );
  }

  return section;
}

function buildNoticeContainer(guild, client, content) {
  return new ContainerBuilder().addSectionComponents(buildSection(guild, client, content));
}

function buildNoticePayload(guild, client, content, options = {}) {
  return buildMessagePayload(buildNoticeContainer(guild, client, content), options);
}

function buildButton(customId, label, options = {}) {
  const button = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(String(label || '').slice(0, 80))
    .setStyle(buttonStyle(options.style || config.buttons.actionStyle));

  if (options.disabled) {
    button.setDisabled(true);
  }

  return button;
}

function assertPanelAssetExists() {
  if (!fs.existsSync(config.panel.imagePath)) {
    throw new Error(
      `Не найден файл баннера панели: ${config.panel.imagePath}. Поместите изображение в Assets/test.png.`
    );
  }
}

async function buildPanelAttachment() {
  assertPanelAssetExists();
  const stat = fs.statSync(config.panel.imagePath);

  if (stat.size <= config.panel.maxUploadBytes) {
    return {
      attachment: new AttachmentBuilder(config.panel.imagePath, {
        name: config.panel.imageAttachmentName
      }),
      attachmentName: config.panel.imageAttachmentName
    };
  }

  const source = sharp(config.panel.imagePath).rotate().resize({
    width: config.panel.maxOptimizedWidth,
    withoutEnlargement: true
  });

  let bestBuffer = null;
  let bestQuality = 82;

  for (const quality of [82, 74, 66, 58, 50, 42]) {
    const buffer = await source.clone().webp({ quality, effort: 5 }).toBuffer();
    bestBuffer = buffer;
    bestQuality = quality;

    if (buffer.length <= config.panel.maxUploadBytes) break;
  }

  if (!bestBuffer || bestBuffer.length > config.panel.maxUploadBytes) {
    throw new Error(
      `Изображение панели слишком большое даже после сжатия (${Math.ceil(
        (bestBuffer?.length || stat.size) / 1024 / 1024
      )} МБ). Уменьшите размер Assets/test.png.`
    );
  }

  console.log(
    `[PANEL] Optimized ${config.panel.imageAttachmentName}: ${Math.ceil(
      stat.size / 1024
    )} KB -> ${Math.ceil(bestBuffer.length / 1024)} KB (WebP quality ${bestQuality}).`
  );

  return {
    attachment: new AttachmentBuilder(bestBuffer, {
      name: config.panel.optimizedImageAttachmentName
    }),
    attachmentName: config.panel.optimizedImageAttachmentName
  };
}

async function buildPanelPayload() {
  const { attachment, attachmentName } = await buildPanelAttachment();

  const mediaGallery = new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder()
      .setURL(`attachment://${attachmentName}`)
      .setDescription(config.panel.imageDescription)
  );

  const buttons = new ActionRowBuilder().addComponents(
    buildButton(customIds.open('order'), config.labels.orderButton, {
      style: config.buttons.panelStyle
    }),
    buildButton(customIds.open('won'), config.labels.wonButton, {
      style: config.buttons.panelStyle
    })
  );

  const container = new ContainerBuilder().addMediaGalleryComponents(mediaGallery);

  if (config.panel.showText && config.panel.text) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(config.panel.text));
  }

  container.addActionRowComponents(buttons);

  return buildMessagePayload(container, { files: [attachment] });
}

function sanitizeCodeBlock(value) {
  return String(value || '')
    .replace(/```/g, "'''")
    .trim();
}

function getTicketTypeLabel(type) {
  return type === 'won' ? config.labels.wonType : config.labels.orderType;
}

function isWonTicket(ticket) {
  return ticket?.type === 'won';
}

function getWonServerText(ticket) {
  return ticket.wonServerText || ticket.paymentText || '';
}

function getWonPrizeText(ticket) {
  return ticket.wonPrizeText || ticket.requestText || '';
}

function buildManagerContent(ticket, terminalBlock) {
  const template = isWonTicket(ticket)
    ? config.templates.sellerDmWon
    : config.templates.sellerDmOrder;

  return config.format(template, {
    orderNumber: ticket.orderNumber,
    username: ticket.customerUsername,
    userId: ticket.customerId,
    channelId: ticket.channelId,
    channelUrl: ticket.channelUrl,
    orderType: getTicketTypeLabel(ticket.type),
    request: sanitizeCodeBlock(ticket.requestText),
    payment: sanitizeCodeBlock(ticket.paymentText),
    wonServer: sanitizeCodeBlock(getWonServerText(ticket)),
    wonPrize: sanitizeCodeBlock(getWonPrizeText(ticket)),
    terminalBlock
  });
}

function buildManagerTicketPayload(ticket, guild, client, options = {}) {
  const disabled = Boolean(options.disabled);
  const viewerUserId = options.viewerUserId || null;
  const acceptedBy = ticket.acceptedBy || null;
  const viewerAccepted = Boolean(acceptedBy && viewerUserId === acceptedBy);
  const statusLines = [];

  if (ticket.status === 'accepted' && acceptedBy) {
    statusLines.push(
      viewerAccepted
        ? config.sellerStatus.acceptedSelf
        : config.format(config.sellerStatus.acceptedOther, { sellerId: acceptedBy })
    );
  }

  if (options.terminalLine) {
    statusLines.push(options.terminalLine);
  }

  const terminalBlock = statusLines.length
    ? `\n${statusLines.map((line) => `> ***${line}***`).join('\n')}`
    : '';
  const content = buildManagerContent(ticket, terminalBlock);
  const actionRows = [];

  if (ticket.status === 'new' && config.workflow.includeAcceptButton) {
    actionRows.push(
      new ActionRowBuilder().addComponents(
        buildButton(customIds.accept(ticket.orderNumber), config.labels.acceptButton, {
          disabled,
          style: config.buttons.actionStyle
        })
      )
    );
  } else if (ticket.status === 'accepted' && viewerAccepted && !disabled) {
    actionRows.push(
      new ActionRowBuilder().addComponents(
        buildButton(customIds.complete(ticket.orderNumber), config.labels.completeButton, {
          disabled: false,
          style: config.buttons.terminalStyle
        }),
        buildButton(customIds.decline(ticket.orderNumber), config.labels.declineButton, {
          disabled: false,
          style: config.buttons.terminalStyle
        })
      )
    );
  } else if (viewerAccepted) {
    actionRows.push(
      new ActionRowBuilder().addComponents(
        buildButton(customIds.complete(ticket.orderNumber), config.labels.completeButton, {
          disabled: true,
          style: config.buttons.terminalStyle
        }),
        buildButton(customIds.decline(ticket.orderNumber), config.labels.declineButton, {
          disabled: true,
          style: config.buttons.terminalStyle
        })
      )
    );
  } else {
    actionRows.push(
      new ActionRowBuilder().addComponents(
        buildButton(customIds.accept(ticket.orderNumber), config.labels.acceptButton, {
          disabled: true,
          style: config.buttons.actionStyle
        })
      )
    );
  }

  const container = new ContainerBuilder().addSectionComponents(
    buildSection(guild, client, content)
  );

  for (const actionRow of actionRows) {
    container.addActionRowComponents(actionRow);
  }

  return buildMessagePayload(container);
}

function buildCustomerTicketPayload(ticket, guild, client, options = {}) {
  const disabled = Boolean(options.disabled);
  const template = isWonTicket(ticket)
    ? config.templates.customerTicketWon
    : config.templates.customerTicketOrder;

  const content = config.format(template, {
    orderNumber: ticket.orderNumber,
    username: ticket.customerUsername,
    userId: ticket.customerId,
    channelId: ticket.channelId,
    channelUrl: ticket.channelUrl
  });

  const row = new ActionRowBuilder().addComponents(
    buildButton(customIds.cancel(ticket.orderNumber), config.labels.cancelButton, {
      disabled,
      style: config.buttons.terminalStyle
    })
  );

  const container = new ContainerBuilder()
    .addSectionComponents(buildSection(guild, client, content))
    .addActionRowComponents(row);

  return buildMessagePayload(container);
}

function buildCustomerFinalPayload(ticket, guild, client, status) {
  const reviewsUrl = config.links?.reviewsChannelUrl || '';
  const reviewsLine = reviewsUrl
    ? `\n${config.format(config.reviews.promptLine, { reviewsUrl })}`
    : '';

  const templatesByStatus = isWonTicket(ticket)
    ? {
        completed: config.templates.customerFinalWonCompleted,
        declined: config.templates.customerFinalWonDeclined,
        cancelled: config.templates.customerFinalWonCancelled
      }
    : {
        completed: config.templates.customerFinalOrderCompleted,
        declined: config.templates.customerFinalOrderDeclined,
        cancelled: config.templates.customerFinalOrderCancelled
      };

  const template = templatesByStatus[status] || templatesByStatus.cancelled;
  const content = config.format(template, {
    orderNumber: ticket.orderNumber,
    username: ticket.customerUsername,
    userId: ticket.customerId,
    channelId: ticket.channelId,
    channelUrl: ticket.channelUrl,
    reviewsUrl,
    reviewsLine
  });

  return buildMessagePayload(buildNoticeContainer(guild, client, content));
}

function buildManagerCancelNoticePayload(ticket, guild, client) {
  const template = isWonTicket(ticket)
    ? config.templates.sellerCancelNoticeWon
    : config.templates.sellerCancelNoticeOrder;

  const content = config.format(template, {
    orderNumber: ticket.orderNumber,
    username: ticket.customerUsername,
    userId: ticket.customerId,
    channelId: ticket.channelId,
    channelUrl: ticket.channelUrl,
    request: sanitizeCodeBlock(ticket.requestText),
    payment: sanitizeCodeBlock(ticket.paymentText),
    wonServer: sanitizeCodeBlock(getWonServerText(ticket)),
    wonPrize: sanitizeCodeBlock(getWonPrizeText(ticket))
  });

  return buildMessagePayload(buildNoticeContainer(guild, client, content));
}

function formatTicketTitle(ticket) {
  const template = isWonTicket(ticket)
    ? config.channelHeaders.won
    : config.channelHeaders.order;

  return config.format(template, {
    orderNumber: ticket.orderNumber,
    username: ticket.customerUsername,
    userId: ticket.customerId
  });
}

function buildChannelStatusPayload(ticket, guild, client, content, options = {}) {
  const fullContent = [`# ${formatTicketTitle(ticket)}`, content].join('\n');
  return buildMessagePayload(buildNoticeContainer(guild, client, fullContent), options);
}

function buildStatsPayload(stats, guild, client) {
  const content = config.format(config.templates.statsContainer, {
    total: stats.total,
    new: stats.new,
    accepted: stats.accepted,
    completed: stats.completed,
    declined: stats.declined,
    cancelled: stats.cancelled
  });

  return buildMessagePayload(buildNoticeContainer(guild, client, content), { ephemeral: true });
}

module.exports = {
  V2_EPHEMERAL_FLAGS,
  V2_FLAGS,
  assertPanelAssetExists,
  buildChannelStatusPayload,
  buildCustomerFinalPayload,
  buildCustomerTicketPayload,
  buildManagerCancelNoticePayload,
  buildManagerTicketPayload,
  buildNoticePayload,
  buildPanelPayload,
  buildStatsPayload
};
