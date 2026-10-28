const {
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  OverwriteType,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const config = require('./config.js');
const storage = require('./storage.js');
const ui = require('./ui.js');
const { customIds } = require('./customIds.js');

function activeSellerRoleIds() {
  return [
    ...new Set(
      (config.sellers.roleIds || [])
        .filter(Boolean)
        .filter((roleId) => roleId !== config.guildId)
    )
  ];
}

function hasGuildIdInSellerRoles() {
  return Boolean(config.guildId && (config.sellers.roleIds || []).includes(config.guildId));
}

function isTerminal(ticket) {
  return storage.TERMINAL_STATUSES.has(ticket?.status);
}

function isWonTicket(ticketOrType) {
  return (typeof ticketOrType === 'string' ? ticketOrType : ticketOrType?.type) === 'won';
}

function ticketSubject(ticketOrType, uppercase = true) {
  const subject = isWonTicket(ticketOrType) ? config.subjects.won : config.subjects.order;
  if (!subject) return '';
  return uppercase ? `${subject[0].toUpperCase()}${subject.slice(1)}` : subject;
}

function subjectVars(ticketOrType) {
  return {
    Subject: ticketSubject(ticketOrType, true),
    subject: ticketSubject(ticketOrType, false)
  };
}

function sanitizeChannelPart(value, fallback = 'user') {
  const normalized = String(value || fallback)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return normalized || fallback;
}

function getTicketUsername(ticketOrUser) {
  return ticketOrUser?.customerUsername || ticketOrUser?.username || String(ticketOrUser || 'user');
}

function formatChannelName(status, ticketOrUser) {
  const emoji = config.statusEmojis[status] || config.statusEmojis.cancelled;
  const username = sanitizeChannelPart(getTicketUsername(ticketOrUser), 'user');
  const base = isWonTicket(ticketOrUser) ? config.channelName.wonBase : config.channelName.orderBase;
  return `${emoji}${config.channelName.separator}${base}-${username}`.slice(0, 100);
}

async function resolveGuild(client, interaction) {
  if (interaction?.guild) return interaction.guild;
  if (!config.guildId) {
    throw new Error('В конфигурации не указан GUILD_ID.');
  }
  return client.guilds.fetch(config.guildId);
}

async function resolveCategory(guild, purpose) {
  const isArchive = purpose === 'archive';
  const configuredId = isArchive ? config.categories.archiveId : config.categories.activeId;
  const configuredName = isArchive ? config.categories.archiveName : config.categories.activeName;

  if (configuredId) {
    const byId = await guild.channels.fetch(configuredId).catch(() => null);
    if (byId?.type === ChannelType.GuildCategory) return byId;
    if (!config.categories.autoCreateIfMissing) {
      throw new Error(`Категория ${configuredId} не найдена или не является категорией.`);
    }
  }

  const byName = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildCategory && channel.name === configuredName
  );
  if (byName) return byName;

  if (!config.categories.autoCreateIfMissing) {
    throw new Error(`Категория "${configuredName}" не найдена.`);
  }

  return guild.channels.create({
    name: configuredName,
    type: ChannelType.GuildCategory,
    reason: 'Shop Ticket Bot: auto-created order category'
  });
}

function basicTicketAllows() {
  return [
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.UseExternalEmojis,
    PermissionFlagsBits.UseExternalStickers,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.SendVoiceMessages
  ];
}

function buildPermissionOverwrites(guild, customerId) {
  return [
    {
      id: guild.roles.everyone.id,
      type: OverwriteType.Role,
      deny: [PermissionFlagsBits.ViewChannel],
      allow: basicTicketAllows()
    },
    {
      id: customerId,
      type: OverwriteType.Member,
      allow: [PermissionFlagsBits.ViewChannel]
    }
  ];
}

function memberHasSellerRole(member) {
  const roleIds = activeSellerRoleIds();
  if (!member || !roleIds.length) return false;

  if (member.roles?.cache) {
    return roleIds.some((roleId) => member.roles.cache.has(roleId));
  }

  if (Array.isArray(member.roles)) {
    return roleIds.some((roleId) => member.roles.includes(roleId));
  }

  return false;
}

async function fetchGuildMember(guild, userId) {
  if (!guild || !userId) return null;
  if (guild.members.cache.has(userId)) return guild.members.cache.get(userId);
  return guild.members.fetch(userId).catch(() => null);
}

async function canSell(userId, guild, member = null) {
  if (!userId) return false;
  if (memberHasSellerRole(member)) return true;

  const guildMember = await fetchGuildMember(guild, userId);
  return memberHasSellerRole(guildMember);
}

async function activeSellerUserIds(guild) {
  const roleIds = activeSellerRoleIds();
  if (!guild || !roleIds.length) return [];

  const members = await guild.members.fetch().catch((error) => {
    console.error('[SELLERS] Failed to fetch guild members:', error?.message || error);
    return guild.members.cache;
  });

  const sellerIds = [];
  for (const member of members.values()) {
    if (member.user?.bot) continue;
    if (memberHasSellerRole(member)) {
      sellerIds.push(member.user.id);
    }
  }

  return [...new Set(sellerIds)];
}

function buildOrderModal(type) {
  const modal = new ModalBuilder()
    .setCustomId(customIds.modal(type))
    .setTitle(config.modal.titleByType[type] || config.modal.titleByType.order);

  const firstInputConfig = isWonTicket(type)
    ? config.modal.wonServerInput
    : config.modal.requestInput;
  const secondInputConfig = isWonTicket(type)
    ? config.modal.wonPrizeInput
    : config.modal.paymentInput;

  const firstInput = new TextInputBuilder()
    .setCustomId(firstInputConfig.id)
    .setLabel(firstInputConfig.label)
    .setPlaceholder(firstInputConfig.placeholder)
    .setStyle(isWonTicket(type) ? TextInputStyle.Short : TextInputStyle.Paragraph)
    .setMaxLength(firstInputConfig.maxLength)
    .setRequired(firstInputConfig.required);

  const secondInput = new TextInputBuilder()
    .setCustomId(secondInputConfig.id)
    .setLabel(secondInputConfig.label)
    .setPlaceholder(secondInputConfig.placeholder)
    .setStyle(isWonTicket(type) ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setMaxLength(secondInputConfig.maxLength)
    .setRequired(secondInputConfig.required);

  modal.addComponents(
    new ActionRowBuilder().addComponents(firstInput),
    new ActionRowBuilder().addComponents(secondInput)
  );

  return modal;
}

async function replyNotice(interaction, content, options = {}) {
  const guild = await resolveGuild(interaction.client, interaction).catch(
    () => interaction.guild || null
  );
  const payload = ui.buildNoticePayload(guild, interaction.client, content, {
    ephemeral: options.ephemeral ?? interaction.inGuild()
  });

  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload).catch(() => null);
  }

  return interaction.reply(payload).catch(() => null);
}

async function editComponentMessage(message, payload) {
  if (!message?.editable) return null;
  return message.edit(payload).catch(() => null);
}

async function fetchTicketChannel(client, ticket) {
  if (!ticket?.channelId) return null;
  return client.channels.fetch(ticket.channelId).catch(() => null);
}

async function fetchDmChannel(client, entry) {
  if (!entry?.userId) return null;

  const byId = entry.channelId
    ? await client.channels.fetch(entry.channelId).catch(() => null)
    : null;
  if (byId) return byId;

  const user = await client.users.fetch(entry.userId).catch(() => null);
  if (!user) return null;
  return user.createDM().catch(() => null);
}

function classifyDmError(error) {
  if (!error) return null;
  if (error.code === 50007) return 'dm_closed';
  if (error.code === 10013) return 'user_not_found';
  return 'send_failed';
}

async function sendUserDm(client, userId, payloadFactory, logLabel) {
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) {
    return { userId, ok: false, reason: 'user_not_found' };
  }

  let failure = null;
  const message = await user.send(payloadFactory(userId)).catch((error) => {
    failure = error;
    console.error(`[DM] Failed to send ${logLabel} DM to ${userId}:`, error?.message || error);
    return null;
  });

  return {
    userId,
    ok: Boolean(message),
    reason: message ? null : classifyDmError(failure),
    channelId: message?.channelId || null,
    messageId: message?.id || null
  };
}

async function sendSellers(client, guild, payloadFactory, sellerUserIds = null) {
  const results = [];
  const userIds = sellerUserIds || (await activeSellerUserIds(guild));

  for (const userId of userIds) {
    results.push(await sendUserDm(client, userId, payloadFactory, 'seller'));
  }

  return results;
}

function buildActiveTicketNotice(ticket) {
  return config.format(config.templates.noticeActiveTicketExists, {
    channelUrl: ticket.channelUrl || `<#${ticket.channelId}>`,
    channelId: ticket.channelId,
    orderNumber: ticket.orderNumber
  });
}

async function showOrderModalIfAllowed(interaction, type) {
  const existingTicket = storage.findActiveTicketByCustomer(interaction.user.id);
  if (existingTicket) {
    const guild = await resolveGuild(interaction.client, interaction).catch(
      () => interaction.guild || null
    );
    return interaction.reply(
      ui.buildNoticePayload(guild, interaction.client, buildActiveTicketNotice(existingTicket), {
        ephemeral: true
      })
    );
  }

  return interaction.showModal(buildOrderModal(type));
}

async function createTicketFromModal(interaction, type) {
  const sellerRoleIds = activeSellerRoleIds();
  if (hasGuildIdInSellerRoles()) {
    return replyNotice(interaction, config.templates.noticeInvalidSellerRolesGuildId);
  }

  if (!sellerRoleIds.length) {
    return replyNotice(interaction, config.templates.noticeMissingSellerRoles);
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = await resolveGuild(interaction.client, interaction);
  const sellerUserIds = await activeSellerUserIds(guild);
  if (!sellerUserIds.length) {
    return interaction.editReply(
      ui.buildNoticePayload(
        guild,
        interaction.client,
        config.templates.noticeNoSellersFound,
        { ephemeral: false }
      )
    );
  }

  const activeCategory = await resolveCategory(guild, 'active');
  const existingTicket = storage.findActiveTicketByCustomer(interaction.user.id);
  if (existingTicket) {
    return interaction.editReply(
      ui.buildNoticePayload(
        guild,
        interaction.client,
        buildActiveTicketNotice(existingTicket),
        { ephemeral: false }
      )
    );
  }

  const won = isWonTicket(type);
  const requestText = won
    ? interaction.fields.getTextInputValue(config.modal.wonPrizeInput.id).trim()
    : interaction.fields.getTextInputValue(config.modal.requestInput.id).trim();
  const paymentText = won
    ? interaction.fields.getTextInputValue(config.modal.wonServerInput.id).trim()
    : interaction.fields.getTextInputValue(config.modal.paymentInput.id).trim();

  const orderNumber = storage.reserveOrderNumber();
  const channelName = formatChannelName('new', { type, username: interaction.user.username });

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: activeCategory.id,
    topic: `Shop Ticket Bot ${ticketSubject(type, false)} ${interaction.user.username} | user:${interaction.user.id}`,
    permissionOverwrites: buildPermissionOverwrites(guild, interaction.user.id),
    reason: `Shop Ticket Bot: new ${ticketSubject(type, false)} by ${interaction.user.tag}`
  });

  const ticket = storage.addTicket({
    orderNumber,
    type,
    status: 'new',
    guildId: guild.id,
    channelId: channel.id,
    channelUrl: `https://discord.com/channels/${guild.id}/${channel.id}`,
    customerId: interaction.user.id,
    customerUsername: interaction.user.username,
    customerTag: interaction.user.tag,
    requestText,
    paymentText,
    wonServerText: won ? paymentText : null,
    wonPrizeText: won ? requestText : null,
    managerMessages: [],
    customerDmMessage: null,
    customerMessageId: null,
    customerMessageChannelId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const customerMessage = await channel.send(
    ui.buildCustomerTicketPayload(ticket, guild, interaction.client)
  );
  const managerMessages = await sendSellers(
    interaction.client,
    guild,
    (sellerUserId) =>
      ui.buildManagerTicketPayload(ticket, guild, interaction.client, {
        viewerUserId: sellerUserId
      }),
    sellerUserIds
  );

  const updatedTicket = storage.updateTicket(orderNumber, {
    customerMessageId: customerMessage.id,
    customerMessageChannelId: channel.id,
    managerMessages
  });

  const replyTemplate = won
    ? config.templates.ticketCreatedReplyWon
    : config.templates.ticketCreatedReplyOrder;

  const replyContent = config.format(replyTemplate, {
    username: interaction.user.username,
    userId: interaction.user.id,
    channelId: updatedTicket.channelId,
    channelUrl: updatedTicket.channelUrl,
    orderNumber: updatedTicket.orderNumber
  });

  await interaction.editReply(
    ui.buildNoticePayload(guild, interaction.client, replyContent, {
      ephemeral: false
    })
  );

  return updatedTicket;
}

async function updateChannelName(client, ticket, status) {
  const channel = await fetchTicketChannel(client, ticket);
  if (!channel || channel.type !== ChannelType.GuildText) return null;

  const nextName = formatChannelName(status, ticket);
  if (channel.name !== nextName) {
    await channel.setName(nextName, `Shop Ticket Bot: status ${status}`).catch((error) => {
      console.error(`[CHANNEL] Failed to rename ${channel.id}:`, error?.message || error);
    });
  }

  return channel;
}

async function editStoredManagerMessages(client, guild, ticket, payloadOptions = {}) {
  for (const entry of ticket.managerMessages || []) {
    if (!entry?.messageId) continue;

    const dmChannel = await fetchDmChannel(client, entry);
    const message = await dmChannel?.messages?.fetch(entry.messageId).catch(() => null);
    if (!message) continue;

    await editComponentMessage(
      message,
      ui.buildManagerTicketPayload(ticket, guild, client, {
        ...payloadOptions,
        viewerUserId: entry.userId
      })
    );
  }
}

async function editStoredCustomerMessage(client, guild, ticket, payloadOptions = {}) {
  if (!ticket.customerMessageId) return;

  const storedChannelId =
    ticket.customerMessageChannelId || ticket.customerDmMessage?.channelId || ticket.channelId;
  let channel = storedChannelId
    ? await client.channels.fetch(storedChannelId).catch(() => null)
    : null;

  if (!channel && ticket.customerDmMessage?.channelId) {
    channel = await fetchDmChannel(client, {
      userId: ticket.customerId,
      channelId: ticket.customerDmMessage.channelId
    });
  }

  if (!channel) {
    channel = await fetchTicketChannel(client, ticket);
  }

  if (!channel) return;
  const message = await channel.messages.fetch(ticket.customerMessageId).catch(() => null);
  if (!message) return;

  await editComponentMessage(
    message,
    ui.buildCustomerTicketPayload(ticket, guild, client, payloadOptions)
  );
}

async function acceptTicket(interaction, ticket) {
  if (ticket.status !== 'new') {
    return replyNotice(
      interaction,
      config.format(config.templates.noticeTicketAlreadyAccepted, subjectVars(ticket))
    );
  }

  await interaction.deferUpdate();

  const guild = await resolveGuild(interaction.client, interaction);
  let updatedTicket = storage.updateTicket(ticket.orderNumber, {
    status: 'accepted',
    acceptedBy: interaction.user.id,
    acceptedAt: new Date().toISOString()
  });

  const channel = await updateChannelName(interaction.client, updatedTicket, 'accepted');
  if (channel) {
    await channel.permissionOverwrites
      .edit(
        interaction.user.id,
        { ViewChannel: true },
        { reason: `Shop Ticket Bot: seller accepted ${ticketSubject(updatedTicket, false)}` }
      )
      .catch((error) => {
        console.error(`[PERMS] Failed to grant seller access in ${channel.id}:`, error?.message || error);
      });

    const noticeText = config.format(config.templates.channelAcceptedNotice, {
      userId: updatedTicket.customerId,
      username: updatedTicket.customerUsername,
      sellerId: interaction.user.id,
      ...subjectVars(updatedTicket)
    });

    await channel
      .send(
        ui.buildChannelStatusPayload(
          updatedTicket,
          guild,
          interaction.client,
          noticeText,
          { allowedMentions: { parse: [], users: [updatedTicket.customerId] } }
        )
      )
      .catch(() => null);
  }

  updatedTicket = storage.getTicket(ticket.orderNumber);
  await editStoredManagerMessages(interaction.client, guild, updatedTicket);
}

function statusLabel(status) {
  return config.statusLabels[status] || status;
}

async function archiveTicketChannel(client, guild, ticket, status) {
  const channel = await updateChannelName(client, ticket, status);
  if (!channel) return null;

  const archiveCategory = await resolveCategory(guild, 'archive');
  const statusNotice = config.format(config.templates.channelStatusChangedNotice, {
    statusLabel: statusLabel(status),
    ...subjectVars(ticket)
  });

  await channel
    .send(ui.buildChannelStatusPayload(ticket, guild, client, statusNotice))
    .catch(() => null);

  if (config.workflow.archiveCompletedTickets) {
    await channel
      .setParent(archiveCategory.id, {
        lockPermissions: false,
        reason: `Shop Ticket Bot: archive ${ticketSubject(ticket, false)} ${ticket.customerUsername}`
      })
      .catch((error) => {
        console.error(`[ARCHIVE] Failed to move channel ${channel.id}:`, error?.message || error);
      });
  }

  await channel.permissionOverwrites
    .edit(
      ticket.customerId,
      { ViewChannel: false },
      { reason: `Shop Ticket Bot: remove customer access after ${status}` }
    )
    .catch((error) => {
      console.error(`[PERMS] Failed to remove customer view from ${channel.id}:`, error?.message || error);
    });

  if (ticket.acceptedBy) {
    await channel.permissionOverwrites
      .edit(
        ticket.acceptedBy,
        { ViewChannel: false },
        { reason: `Shop Ticket Bot: remove seller access after ${status}` }
      )
      .catch((error) => {
        console.error(`[PERMS] Failed to remove seller view from ${channel.id}:`, error?.message || error);
      });
  }

  return channel;
}

async function closeTicket(interaction, ticket, status) {
  if (isTerminal(ticket)) {
    return replyNotice(
      interaction,
      config.format(config.templates.noticeTicketAlreadyClosed, subjectVars(ticket))
    );
  }

  await interaction.deferUpdate();

  const guild = await resolveGuild(interaction.client, interaction);
  const closedAt = new Date().toISOString();
  let updatedTicket = storage.updateTicket(ticket.orderNumber, {
    status,
    closedBy: interaction.user.id,
    closedAt
  });

  await editStoredCustomerMessage(interaction.client, guild, updatedTicket, { disabled: true });
  await archiveTicketChannel(interaction.client, guild, updatedTicket, status);

  updatedTicket = storage.getTicket(ticket.orderNumber);

  if (status === 'cancelled') {
    await sendSellers(interaction.client, guild, () =>
      ui.buildManagerCancelNoticePayload(updatedTicket, guild, interaction.client)
    );
  } else {
    const customer = await interaction.client.users.fetch(updatedTicket.customerId).catch(() => null);
    if (customer) {
      await customer
        .send(ui.buildCustomerFinalPayload(updatedTicket, guild, interaction.client, status))
        .catch((error) => {
          console.error(
            `[DM] Failed to notify customer ${updatedTicket.customerId}:`,
            error?.message || error
          );
        });
    }
  }

  await editStoredManagerMessages(interaction.client, guild, updatedTicket, {
    disabled: true,
    terminalLine: config.format(config.sellerStatus.terminalLine, {
      statusLabel: statusLabel(status)
    })
  });

  storage.archiveAndRemoveTicket(updatedTicket.orderNumber, status);
}

async function handleTicketButton(interaction, action, orderNumber) {
  const ticket = storage.getTicket(orderNumber);
  if (!ticket) {
    return replyNotice(interaction, config.templates.noticeTicketNotFound);
  }

  const guild = await resolveGuild(interaction.client, interaction);

  if (action === 'cancel') {
    if (interaction.user.id !== ticket.customerId) {
      return replyNotice(
        interaction,
        config.format(config.templates.noticeOnlyCustomerCanCancel, subjectVars(ticket))
      );
    }

    return closeTicket(interaction, ticket, 'cancelled');
  }

  const sellerAllowed = await canSell(interaction.user.id, guild, interaction.member);
  if (!sellerAllowed) {
    return replyNotice(interaction, config.templates.noticeOnlySellerCanManage);
  }

  if (action === 'accept') {
    return acceptTicket(interaction, ticket);
  }

  if (['complete', 'decline'].includes(action)) {
    if (ticket.status !== 'accepted') {
      return replyNotice(
        interaction,
        config.format(config.templates.noticeTicketNotAcceptedYet, {
          ...subjectVars(ticket),
          acceptButton: config.labels.acceptButton
        })
      );
    }

    if (ticket.acceptedBy && ticket.acceptedBy !== interaction.user.id) {
      return replyNotice(interaction, config.templates.noticeOnlyAssignedSellerCanClose);
    }

    if (action === 'complete') return closeTicket(interaction, ticket, 'completed');
    if (action === 'decline') return closeTicket(interaction, ticket, 'declined');
  }

  return replyNotice(interaction, config.templates.noticeUnknownButtonAction);
}

async function autoAcceptFromMessage(message) {
  if (!config.workflow.autoAcceptOnManagerMessage) return;
  if (!message.guild || message.author.bot) return;

  const ticket = storage.findTicketByChannel(message.channelId);
  if (!ticket || ticket.status !== 'new') return;

  const sellerAllowed = await canSell(message.author.id, message.guild, message.member);
  if (!sellerAllowed) return;

  const updatedTicket = storage.updateTicket(ticket.orderNumber, {
    status: 'accepted',
    acceptedBy: message.author.id,
    acceptedAt: new Date().toISOString()
  });

  await updateChannelName(message.client, updatedTicket, 'accepted');

  const noticeText = config.format(config.templates.channelAcceptedNotice, {
    userId: updatedTicket.customerId,
    username: updatedTicket.customerUsername,
    sellerId: message.author.id,
    ...subjectVars(updatedTicket)
  });

  await message.channel
    .send(
      ui.buildChannelStatusPayload(
        updatedTicket,
        message.guild,
        message.client,
        noticeText,
        { allowedMentions: { parse: [], users: [updatedTicket.customerId] } }
      )
    )
    .catch(() => null);

  await editStoredManagerMessages(message.client, message.guild, updatedTicket);
}

function getStats() {
  return storage.getAggregatedStats();
}

module.exports = {
  activeSellerRoleIds,
  autoAcceptFromMessage,
  buildOrderModal,
  canSell,
  createTicketFromModal,
  getStats,
  handleTicketButton,
  resolveGuild,
  showOrderModalIfAllowed
};
