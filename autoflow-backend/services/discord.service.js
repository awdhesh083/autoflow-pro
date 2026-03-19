/**
 * ══════════════════════════════════════════════════════════
 * DISCORD BOT SERVICE
 * Features: Mass DM server members, send channel messages,
 *           auto-reply, role-based messaging, webhook posting,
 *           member scraper, server stats
 * Uses: discord.js v14
 * ══════════════════════════════════════════════════════════
 */

const { Client, GatewayIntentBits, Partials, EmbedBuilder,
        ActionRowBuilder, ButtonBuilder, ButtonStyle,
        Events, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');
const { delay, randomDelay, personalizeText } = require('../utils/helpers');
const { MessageLog, Contact, AutoReply }      = require('../models');
const AIService = require('./index').AIService;

class DiscordService {
  constructor() {
    this.bots      = new Map();   // accountId → Client
    this.autoReply = new Map();   // guildId → rules
  }

  // ── Initialize bot ──────────────────────────────────────
  async initBot(accountId, token, options = {}) {
    if (this.bots.has(accountId)) {
      logger.info(`Discord bot already running for ${accountId}`);
      return;
    }

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions,
      ],
      partials: [Partials.Channel, Partials.Message],
    });

    // ── Bot events ────────────────────────────────────────
    client.once(Events.ClientReady, (c) => {
      logger.info(`✅ Discord bot ready: ${c.user.tag} (${c.guilds.cache.size} servers)`);
    });

    // Auto-reply to messages
    client.on(Events.MessageCreate, async (msg) => {
      if (msg.author.bot) return;
      await this._handleMessage(accountId, msg, options);
    });

    // Log DMs received
    client.on(Events.MessageCreate, async (msg) => {
      if (!msg.author.bot && msg.channel.type === 1) { // DM channel
        await MessageLog.create({
          platform:  'discord',
          direction: 'inbound',
          from:      msg.author.id,
          body:      msg.content,
          externalId:msg.id,
        }).catch(() => {});
      }
    });

    // New member joined
    client.on(Events.GuildMemberAdd, async (member) => {
      if (options.welcomeMessage) {
        const msg = personalizeText(options.welcomeMessage, {
          name:      member.displayName,
          username:  member.user.username,
          server:    member.guild.name,
        });
        await member.send(msg).catch(() => {}); // DM welcome
      }
    });

    await client.login(token);
    this.bots.set(accountId, client);
    return client;
  }

  // ── Get client ──────────────────────────────────────────
  getBot(accountId) {
    const bot = this.bots.get(accountId);
    if (!bot) throw new Error(`Discord bot not initialized for account ${accountId}`);
    return bot;
  }

  // ── Send message to channel ─────────────────────────────
  async sendChannelMessage(accountId, channelId, message, options = {}) {
    const client  = this.getBot(accountId);
    const channel = await client.channels.fetch(channelId);
    if (!channel) throw new Error(`Channel ${channelId} not found`);

    let payload;

    if (options.embed) {
      const embed = new EmbedBuilder()
        .setTitle(options.embed.title || '')
        .setDescription(options.embed.description || message)
        .setColor(options.embed.color || '#00d4ff')
        .setTimestamp();
      if (options.embed.image)  embed.setImage(options.embed.image);
      if (options.embed.footer) embed.setFooter({ text: options.embed.footer });
      if (options.embed.fields) {
        for (const field of options.embed.fields) embed.addFields(field);
      }
      payload = { embeds: [embed] };
    } else {
      payload = { content: message };
    }

    // Add buttons if provided
    if (options.buttons?.length) {
      const row = new ActionRowBuilder().addComponents(
        options.buttons.map(btn => new ButtonBuilder()
          .setCustomId(btn.customId || btn.label)
          .setLabel(btn.label)
          .setStyle(btn.style === 'danger' ? ButtonStyle.Danger : btn.style === 'secondary' ? ButtonStyle.Secondary : ButtonStyle.Primary)
        )
      );
      payload.components = [row];
    }

    const sent = await channel.send(payload);

    await MessageLog.create({
      platform: 'discord', direction: 'outbound',
      to: channelId, body: message, externalId: sent.id,
    }).catch(() => {});

    return { success: true, messageId: sent.id };
  }

  // ── Bulk DM all server members ───────────────────────────
  async dmAllMembers(accountId, guildId, message, options = {}) {
    const client = this.getBot(accountId);
    const guild  = await client.guilds.fetch(guildId);
    if (!guild) throw new Error(`Server ${guildId} not found`);

    const {
      delayMin      = 3000,
      delayMax      = 8000,
      maxPerHour    = 50,
      filterRoles   = [],   // only DM members with these roles
      excludeRoles  = [],   // skip members with these roles
      excludeBots   = true,
    } = options;

    // Fetch all members
    await guild.members.fetch();
    let members = [...guild.members.cache.values()];

    if (excludeBots)          members = members.filter(m => !m.user.bot);
    if (filterRoles.length)   members = members.filter(m => filterRoles.some(r => m.roles.cache.has(r)));
    if (excludeRoles.length)  members = members.filter(m => !excludeRoles.some(r => m.roles.cache.has(r)));

    const results = { sent: 0, failed: 0, skipped: 0 };
    let hourlySent = 0;
    let hourStart  = Date.now();

    for (const member of members) {
      // Hourly rate limit
      if (hourlySent >= maxPerHour) {
        const wait = Math.max(0, 3600000 - (Date.now() - hourStart));
        logger.info(`Discord DM hourly limit reached. Waiting ${Math.round(wait/60000)}m`);
        await delay(wait);
        hourlySent = 0;
        hourStart  = Date.now();
      }

      try {
        const personalizedMsg = personalizeText(message, {
          name:      member.displayName,
          username:  member.user.username,
          server:    guild.name,
          memberId:  member.id,
        });

        await member.send(personalizedMsg);
        results.sent++;
        hourlySent++;

        await MessageLog.create({
          platform: 'discord', direction: 'outbound',
          to: member.id, body: personalizedMsg, externalId: member.id,
        }).catch(() => {});

        await delay(randomDelay(delayMin, delayMax));

      } catch (err) {
        // User has DMs disabled — skip
        if (err.code === 50007) { results.skipped++; }
        else { results.failed++; }
      }
    }

    return { ...results, total: members.length };
  }

  // ── Scrape server members to contacts ───────────────────
  async scrapeMembers(accountId, guildId, userId, options = {}) {
    const client = this.getBot(accountId);
    const guild  = await client.guilds.fetch(guildId);

    await guild.members.fetch();
    const members  = [...guild.members.cache.values()].filter(m => !m.user.bot);
    const contacts = [];

    for (const member of members) {
      const contact = await Contact.findOneAndUpdate(
        { userId, 'customFields.discordId': member.id },
        {
          userId,
          name:   member.displayName || member.user.username,
          source: 'import',
          tags:   ['discord', guild.name],
          customFields: {
            discordId:      member.id,
            discordUsername:`${member.user.username}#${member.user.discriminator}`,
            serverId:       guildId,
            serverName:     guild.name,
            roles:          member.roles.cache.map(r => r.name).join(', '),
            joinedAt:       member.joinedAt,
          },
          status: 'active',
        },
        { upsert: true, new: true }
      );
      contacts.push(contact);
    }

    return { scraped: members.length, saved: contacts.length };
  }

  // ── Post to server via webhook (no bot needed) ───────────
  async sendViaWebhook(webhookUrl, message, options = {}) {
    const axios    = require('axios');
    const payload  = { content: message };

    if (options.username) payload.username   = options.username;
    if (options.avatar)   payload.avatar_url = options.avatar;

    if (options.embed) {
      payload.embeds = [{
        title:       options.embed.title,
        description: options.embed.description || message,
        color:       parseInt((options.embed.color || '#00d4ff').replace('#', ''), 16),
        fields:      options.embed.fields || [],
        footer:      options.embed.footer ? { text: options.embed.footer } : undefined,
        image:       options.embed.image  ? { url: options.embed.image  } : undefined,
        timestamp:   new Date().toISOString(),
      }];
      delete payload.content;
    }

    const response = await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    return { success: true, status: response.status };
  }

  // ── Broadcast to multiple webhooks ──────────────────────
  async broadcastToWebhooks(webhookUrls, message, options = {}) {
    const results = [];
    for (const url of webhookUrls) {
      const r = await this.sendViaWebhook(url, message, options).catch(e => ({ error: e.message }));
      results.push({ url, ...r });
      await delay(500);
    }
    return results;
  }

  // ── Get server stats ─────────────────────────────────────
  async getServerStats(accountId, guildId) {
    const client = this.getBot(accountId);
    const guild  = await client.guilds.fetch(guildId);
    await guild.members.fetch();

    return {
      name:          guild.name,
      id:            guild.id,
      memberCount:   guild.memberCount,
      onlineCount:   guild.members.cache.filter(m => m.presence?.status === 'online').size,
      channels:      guild.channels.cache.size,
      roles:         guild.roles.cache.size,
      boosts:        guild.premiumSubscriptionCount,
      boostLevel:    guild.premiumTier,
      createdAt:     guild.createdAt,
      icon:          guild.iconURL(),
    };
  }

  // ── Setup auto-reply ─────────────────────────────────────
  async setupAutoReply(accountId, guildId, rules) {
    this.autoReply.set(guildId, rules);
    logger.info(`Discord auto-reply rules set for guild ${guildId}`);
  }

  // ── Handle incoming messages (auto-reply) ───────────────
  async _handleMessage(accountId, msg, options) {
    const rules = this.autoReply.get(msg.guildId) || [];

    for (const rule of rules) {
      let matches = false;

      if (rule.trigger === 'all') matches = true;
      else if (rule.trigger === 'keyword') {
        matches = rule.keywords.some(kw => msg.content.toLowerCase().includes(kw.toLowerCase()));
      } else if (rule.trigger === 'mention') {
        matches = msg.mentions.has(this.bots.get(accountId)?.user);
      }

      if (matches) {
        let reply;

        if (rule.type === 'ai') {
          reply = await AIService.chat(msg.content, [], rule.systemPrompt || 'You are a helpful Discord bot. Be concise.').catch(() => null);
        } else {
          reply = rule.response;
        }

        if (reply) {
          await delay(randomDelay(500, 2000)); // seem human
          await msg.reply(reply);
        }
        break;
      }
    }

    // Save inbound DM to log
    if (msg.channel.type === 1) {
      await MessageLog.create({
        platform: 'discord', direction: 'inbound',
        from: msg.author.id, body: msg.content,
      }).catch(() => {});
    }
  }

  // ── Disconnect bot ───────────────────────────────────────
  async disconnect(accountId) {
    const client = this.bots.get(accountId);
    if (client) {
      await client.destroy();
      this.bots.delete(accountId);
      logger.info(`Discord bot disconnected: ${accountId}`);
    }
  }
}

module.exports = new DiscordService();
