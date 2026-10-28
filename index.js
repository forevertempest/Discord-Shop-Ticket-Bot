const {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const config = require('./src/config.js');
const { parseCustomId } = require('./src/customIds.js');
const tickets = require('./src/tickets.js');
const ui = require('./src/ui.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

function buildCommands() {
  return [
    new SlashCommandBuilder()
      .setName(config.commands.name)
      .setDescription(config.commands.description)
      .addSubcommand((subcommand) =>
        subcommand
          .setName('panel')
          .setDescription(config.commands.panelDescription)
          .addChannelOption((option) =>
            option
              .setName('channel')
              .setDescription(config.commands.panelChannelOptionDescription)
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(false)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('stats')
          .setDescription(config.commands.statsDescription)
      )
  ];
}

async function registerCommands() {
  if (!config.registerCommandsOnReady) return;
  if (!config.guildId) {
    console.warn('[COMMANDS] GUILD_ID is empty; slash commands were not registered.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(config.token);
  const commands = buildCommands().map((command) => command.toJSON());

  await rest.put(Routes.applicationGuildCommands(client.user.id, config.guildId), {
    body: commands
  });

  console.log(`[COMMANDS] Registered ${commands.length} command(s) in guild ${config.guildId}.`);
}

function getCommandManagerUserIds() {
  return [
    ...new Set(
      (config.managers.userIds || []).filter(
        (userId) => userId && userId !== config.guildId
      )
    )
  ];
}

function warnConfigIssues() {
  const managerUserIds = config.managers.userIds || [];
  const sellerRoleIds = config.sellers.roleIds || [];

  if (config.guildId && managerUserIds.includes(config.guildId)) {
    console.warn('[CONFIG] MANAGER_USER_IDS contains GUILD_ID. Specify Discord User IDs instead.');
  }

  if (!getCommandManagerUserIds().length) {
    console.warn('[CONFIG] No valid MANAGER_USER_IDS configured. Nobody will be able to run /shop panel.');
  }

  if (config.guildId && sellerRoleIds.includes(config.guildId)) {
    console.warn('[CONFIG] SELLER_ROLE_IDS contains GUILD_ID (@everyone). Specify seller Role IDs instead.');
  }

  if (!tickets.activeSellerRoleIds().length) {
    console.warn('[CONFIG] No valid SELLER_ROLE_IDS configured. Set SELLER_ROLE_IDS in .env.');
  }
}

async function respondToShopCommand(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply(payload);
}

async function ensureShopCommandAccess(interaction, subcommand) {
  const guild = await tickets.resolveGuild(client, interaction);
  const isManager = getCommandManagerUserIds().includes(interaction.user.id);
  if (isManager) return true;

  const isSeller =
    subcommand === 'stats' &&
    (await tickets.canSell(interaction.user.id, guild, interaction.member));
  if (isSeller) return true;

  const payload = ui.buildNoticePayload(
    guild,
    client,
    config.templates.noticeNoCommandAccess,
    { ephemeral: true }
  );

  await respondToShopCommand(interaction, payload);
  return false;
}

async function handleShopCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const subcommand = interaction.options.getSubcommand();
  if (!(await ensureShopCommandAccess(interaction, subcommand))) return;

  const guild = await tickets.resolveGuild(client, interaction);

  if (subcommand === 'panel') {
    ui.assertPanelAssetExists();

    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    if (!targetChannel?.isTextBased()) {
      return respondToShopCommand(
        interaction,
        ui.buildNoticePayload(
          guild,
          client,
          config.templates.noticeInvalidPanelChannel,
          { ephemeral: true }
        )
      );
    }

    await targetChannel.send(await ui.buildPanelPayload(guild, client));
    return respondToShopCommand(
      interaction,
      ui.buildNoticePayload(
        guild,
        client,
        config.format(config.templates.noticePanelSent, { channelId: targetChannel.id }),
        { ephemeral: true }
      )
    );
  }

  if (subcommand === 'stats') {
    return respondToShopCommand(
      interaction,
      ui.buildStatsPayload(tickets.getStats(), guild, client)
    );
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`[READY] Logged in as ${client.user.tag} (${client.user.id}).`);
  warnConfigIssues();

  try {
    await registerCommands();
  } catch (error) {
    console.error('[COMMANDS] Failed to register slash commands:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === config.commands.name) {
        await handleShopCommand(interaction);
      }
      return;
    }

    if (interaction.isButton()) {
      const parsed = parseCustomId(interaction.customId);
      if (!parsed) return;

      if (parsed.action === 'open') {
        await tickets.showOrderModalIfAllowed(
          interaction,
          parsed.value === 'won' ? 'won' : 'order'
        );
        return;
      }

      if (['accept', 'complete', 'decline', 'cancel'].includes(parsed.action)) {
        await tickets.handleTicketButton(interaction, parsed.action, parsed.value);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      const parsed = parseCustomId(interaction.customId);
      if (!parsed || parsed.action !== 'modal') return;

      await tickets.createTicketFromModal(
        interaction,
        parsed.value === 'won' ? 'won' : 'order'
      );
    }
  } catch (error) {
    console.error('[INTERACTION] Failed to handle interaction:', error);

    const guild = interaction.guild || null;
    const errorMessage = String(error?.message || error).slice(0, 1500);
    const payload = ui.buildNoticePayload(
      guild,
      client,
      config.format(config.templates.noticeInteractionError, { errorMessage }),
      { ephemeral: interaction.inGuild() }
    );

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await tickets.autoAcceptFromMessage(message);
  } catch (error) {
    console.error('[MESSAGE] Failed to process message:', error);
  }
});

function shutdown(signal) {
  console.log(`[SHUTDOWN] Received ${signal}, closing Discord client...`);
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

if (!config.token) {
  console.error('[CONFIG] TOKEN is not set. Create a .env file from .env.example and set TOKEN.');
  process.exit(1);
}

client.login(config.token);
