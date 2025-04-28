const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const axios = require('axios');
const dgram = require('dgram');
const crc32 = require('buffer-crc32');
const fs = require('fs');
require('dotenv').config();

// Faction symbols configuration
// const factions = {
//   factions: {
//     0: ':small_blue_diamond:',  // NATO/Blue
//     1: ':small_orange_diamond:',  // FIA
//     2: ':small_white_square:',  // Civilians
//     3: ':small_red_triangle_down:'  // RU
//   }
// };

const factions = {
  factions: {
    0: '<:US:1363037419053781053>',  // NATO/Blue
    1: '<:FIA:1363037418168516640>',  // FIA
    2: '<:CIV:1363037417216544858>',  // Civilians
    3: '<:RU:1363037420622446734>'  // RU
  }
};

// Load environment variables
const botToken = process.env.DISCORD_TOKEN;
const CHAT_CHANNEL_ID = process.env.CHAT_CHANNEL_ID;
const GUILD_ID = process.env.GUILD_ID;
const ADMIN_ALERT_CHANNEL_ID = process.env.ADMIN_ALERT_CHANNEL_ID;
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;

// Load server configurations
let serverConfig = JSON.parse(fs.readFileSync('./servers.json', 'utf8'));

// Function to save server configurations
function saveServerConfig() {
  fs.writeFileSync('./servers.json', JSON.stringify(serverConfig, null, 2));
}

// Get current server configuration
function getCurrentServer() {
  return serverConfig.servers[serverConfig.currentServer];
}

// RCON Configuration
const RCON_CONFIG = {
  host: getCurrentServer().address,
  port: getCurrentServer().port,
  password: getCurrentServer().password
};

// Name of the game you want to track
const ARMA_REF_ORDER = "Arma Reforger";

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

// Webhook Setup (Express)
const app = express();
const PORT = process.env.SERVER_PORT;
const IP = process.env.SERVER_IP;

// Middleware to parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store the latest player list and banlist
let latestPlayerList = [];
let latestBanList = [];
let latestGameStatus = null;
let playerListUpdatePromise = null;
let playerListUpdateResolve = null;
let banListUpdatePromise = null;
let banListUpdateResolve = null;
let gameStatusUpdatePromise = null;
let gameStatusUpdateResolve = null;
let lastAdminPingTime = 0; // Track last admin ping time
let lastStatusCommandTime = 0; // Track last status command time
const ADMIN_PING_COOLDOWN = 60000; // 1 minute in milliseconds
const STATUS_COMMAND_COOLDOWN = 120000; // 2 minutes in milliseconds

// Webhook endpoint for handling webhook JSON data
app.post('/webhook', async (req, res) => {
  const { type, data } = req.body;
  
  try {
    // Store player list if received
    if (type === 'playerlist') {
      latestPlayerList = data;
      if (playerListUpdateResolve) {
        playerListUpdateResolve();
        playerListUpdateResolve = null;
        playerListUpdatePromise = null;
      }
      return;
    }
    
    // Store banlist if received
    if (type === 'banlist') {
      latestBanList = data;
      if (banListUpdateResolve) {
        banListUpdateResolve();
        banListUpdateResolve = null;
        banListUpdatePromise = null;
      }
      return;
    }

    // Store game status if received
    if (type === 'gamestatus') {
      console.log('Received game status update');
      latestGameStatus = data;
      if (gameStatusUpdateResolve) {
        gameStatusUpdateResolve();
        gameStatusUpdateResolve = null;
        gameStatusUpdatePromise = null;
      }
      return;
    }
    
    // Get the channel where messages will be sent
    const channel = await client.channels.fetch(CHAT_CHANNEL_ID);
    if (!channel) {
      return;
    }

    let message;
    
    switch (type) {
      case 'chat':
        const { playerName, message: chatMessage, faction, channelId, factionIndex } = data;
        // Add channel indicator based on channelId
        let channelIndicator = '';
        switch (channelId) {
          case 0:
            channelIndicator = '(Global)';
            break;
          case 1:
            channelIndicator = '(Faction)';
            break;
          case 2:
            channelIndicator = '(Group)';
            break;
          case 3:
            channelIndicator = '(Vehicle)';
            break;
          case 4:
            channelIndicator = '(Local)';
            break;
          default:
            channelIndicator = `(Channel ${channelId})`;
        }

        // Add faction symbol if factionIndex exists
        let factionSymbol = factions.factions[factionIndex] || ':grey_question:';

        message = `${channelIndicator} ${factionSymbol} ${playerName}: ${chatMessage}`;
        console.log(`Chat message from ${playerName}: ${chatMessage}`);
        
        // Check if message contains !admin or !gm (case insensitive)
        if (chatMessage.toLowerCase().match(/^!(admin|gm)\b/)) {
          const currentTime = Date.now();
          // Check if enough time has passed since last ping
          if (currentTime - lastAdminPingTime >= ADMIN_PING_COOLDOWN) {
            // Get the admin alert channel
            const adminAlertChannel = await client.channels.fetch(ADMIN_ALERT_CHANNEL_ID);
            if (adminAlertChannel) {
              console.log(`Forwarding admin mention to alert channel ${ADMIN_ALERT_CHANNEL_ID}`);
              // Send alert with role mention
              await adminAlertChannel.send(`<@&${ADMIN_ROLE_ID}> Admin mention in chat:\n${message}`);
              lastAdminPingTime = currentTime; // Update last ping time
            } else {
              console.error(`Could not find admin alert channel with ID ${ADMIN_ALERT_CHANNEL_ID}`);
            }
          } else {
            console.log('Admin ping cooldown active, skipping ping');
          }
        }
        break;
        
      case 'teamkill':
        const { killerName, victimName, killerFaction, victimFaction } = data;
        message = `${killerName} (${killerFaction}) **Teamkilled** ${victimName} (${victimFaction})`;
        console.log(`Teamkill: ${killerName} killed ${victimName}`);
        break;
        
      case 'player_joined':
        const { playerName: joinedPlayer } = data;
        message = `${joinedPlayer} joined the server`;
        console.log(`Player joined: ${joinedPlayer}`);
        break;
        
      case 'player_left':
        const { playerName: leftPlayer } = data;
        message = `${leftPlayer} left the server`;
        console.log(`Player left: ${leftPlayer}`);
        break;
        
      default:
        console.log(`Received unknown webhook type: ${type}`);
        console.log('Raw webhook data:', req.body);
        return;
    }
    
    // Only send message if it's not a status update
    if (message) {
      await channel.send(message);
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
  }
});

// Start the Express server (Webhook listener)
app.listen(PORT, () => {
  console.log(`Webhook server is running on http://${IP}:${PORT}/webhook`);
});

// Function to count how many members are playing "Arma Reforger"
async function countArmaPlayers() {
  // Get the first guild the bot is in
  const guild = client.guilds.cache.first();
  if (!guild) {
    console.error('Bot is not in any guild!');
    return 0;
  }

  const members = await guild.members.fetch();
  let armaPlayers = 0;

  // Count members who are playing "Arma Reforger"
  members.forEach(member => {
    const activity = member.presence?.activities.find(activity => activity.name === ARMA_REF_ORDER);
    if (activity) {
      armaPlayers++;
    }
  });

  return armaPlayers;
}

// Update the bot's status with the number of players in the server
async function updateStatus() {
  try {
    // Create a new promise for waiting for the webhook update
    playerListUpdatePromise = new Promise(resolve => {
      playerListUpdateResolve = resolve;
    });
    
    // First force an update of the player list via RCON
    await executeRconCommand('playerlist');
    
    // Wait for the webhook to update latestPlayerList
    await playerListUpdatePromise;
    
    const playerCount = latestPlayerList ? latestPlayerList.length : 0;
    const maxPlayers = 128; // You can adjust this based on your server's max capacity
    
    await client.user.setActivity({
      type: 4, // ActivityType.Custom
      name: `${playerCount}/${maxPlayers} players`,
      state: `${playerCount}/${maxPlayers} players`
    });
    
    console.log(`Status updated: ${playerCount}/${maxPlayers} players`);
  } catch (error) {
    console.error('Error updating status:', error);
  }
}

class BattleEyeClient {
  constructor(ip, port, password) {
    this.socket = dgram.createSocket('udp4');
    this.ip = ip;
    this.port = port;
    this.password = password;
    this.sequenceNumber = 0;
    this.loggedIn = false;
    this.lastResponse = 0;
    this.error = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket.bind();

      this.socket.on('error', (err) => {
        console.error('Socket error:', err);
        this.error = true;
        reject(err);
      });

      this.socket.on('message', (message) => {
        this.lastResponse = Date.now();

        if (message.length < 8) {
          console.warn('Received malformed packet (too short).');
          return;
        }

        const packetType = message[7];

        if (packetType === 0x00) { // Login response
          if (message.length < 9) {
            console.warn('Malformed login response (too short).');
            return;
          }
          const loginResp = message[8];
          if (loginResp === 0x01) {
            this.loggedIn = true;
            resolve();
          } else {
            reject(new Error('Login failed'));
          }
        }
      });

      // Send login
      this.login();
    });
  }

  login() {
    const loginBuf = Buffer.alloc(this.password.length + 1);
    loginBuf[0] = 0x00;
    for (let i = 0; i < this.password.length; i++) {
      loginBuf[i + 1] = this.password.charCodeAt(i);
    }

    const packet = this.buildPacket(loginBuf);
    this.send(packet);
  }

  sendCommand(command) {
    return new Promise((resolve, reject) => {
      if (!this.loggedIn || this.error) {
        reject(new Error('Not logged in or in error state'));
        return;
      }

      const seq = this.sequenceNumber & 0xff;
      this.sequenceNumber++;

      const cmdBuffer = Buffer.alloc(2 + command.length);
      cmdBuffer[0] = 0x01;
      cmdBuffer[1] = seq;
      for (let i = 0; i < command.length; i++) {
        cmdBuffer[i + 2] = command.charCodeAt(i);
      }

      const packet = this.buildPacket(cmdBuffer);
      this.send(packet);

      // Set up a one-time message handler for this command
      const messageHandler = (message) => {
        if (message.length < 9) return;
        const packetType = message[7];
        if (packetType === 0x01) {
          const response = message.slice(9).toString();
          this.socket.removeListener('message', messageHandler);
          resolve(response);
        }
      };

      this.socket.on('message', messageHandler);

      // Set timeout
      setTimeout(() => {
        this.socket.removeListener('message', messageHandler);
        reject(new Error('Command timeout'));
      }, 5000);
    });
  }

  buildPacket(payload) {
    const nBuffer = Buffer.alloc(1 + payload.length);
    nBuffer[0] = 0xFF;
    payload.copy(nBuffer, 1);

    const crc = crc32(nBuffer);
    const packet = Buffer.alloc(7 + payload.length);
    packet[0] = 0x42; // 'B'
    packet[1] = 0x45; // 'E'
    packet[2] = crc[0];
    packet[3] = crc[1];
    packet[4] = crc[2];
    packet[5] = crc[3];
    packet[6] = 0xFF;
    payload.copy(packet, 7);

    return packet;
  }

  send(data) {
    this.socket.send(data, 0, data.length, this.port, this.ip);
  }

  close() {
    this.socket.close();
  }
}

// Function to execute RCON commands
async function executeRconCommand(command) {
  const rcon = new BattleEyeClient(
    RCON_CONFIG.host,
    RCON_CONFIG.port,
    RCON_CONFIG.password
  );

  try {
    console.log('Connecting to RCON server...');
    await rcon.connect();
    console.log('RCON connection established');
    
    console.log('Sending command:', command);
    const response = await rcon.sendCommand(command);
    console.log('Raw RCON response:', response);
    console.log('Response type:', typeof response);
    console.log('Response length:', response ? response.length : 0);
    console.log('Response is empty:', !response || response.trim() === '');
    
    rcon.close();
    return response;
  } catch (error) {
    console.error('RCON Error:', error);
    throw error;
  }
}

// When the bot is ready
client.once('ready', async () => {
  console.log('Bot is online!');

  // Register slash commands
  const rest = new REST({ version: '10' }).setToken(botToken);
  const commands = [
    new SlashCommandBuilder()
      .setName('chatglobal')
      .setDescription('Send a global message to the Arma server')
      .addStringOption(option =>
        option.setName('message')
          .setDescription('The message to send')
          .setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('playerlist')
      .setDescription('Get the current list of players on the server')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('banlist')
      .setDescription('Get the current list of banned players')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Remove a player from the ban list')
      .addStringOption(option =>
        option.setName('player')
          .setDescription('The player to unban (name or ID)')
          .setRequired(true)
          .setAutocomplete(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Kick a player from the server')
      .addStringOption(option =>
        option.setName('player')
          .setDescription('The player to kick')
          .setRequired(true)
          .setAutocomplete(true))
      .addStringOption(option =>
        option.setName('reason')
          .setDescription('Reason for the kick')
          .setRequired(true)
          .setAutocomplete(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Ban a player from the server')
      .addStringOption(option =>
        option.setName('player')
          .setDescription('The player to ban')
          .setRequired(true)
          .setAutocomplete(true))
      .addIntegerOption(option =>
        option.setName('duration')
          .setDescription('Duration of the ban')
          .setRequired(true))
      .addStringOption(option =>
        option.setName('unit')
          .setDescription('Unit of time')
          .setRequired(true)
          .setAutocomplete(true))
      .addStringOption(option =>
        option.setName('reason')
          .setDescription('Reason for the ban')
          .setRequired(false)
          .setAutocomplete(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('reloadconfigs')
      .setDescription('Reload server configurations')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('permban')
      .setDescription('Permanently ban a player from the server')
      .addStringOption(option =>
        option.setName('player')
          .setDescription('The player to ban')
          .setRequired(true)
          .setAutocomplete(true))
      .addStringOption(option =>
        option.setName('reason')
          .setDescription('Reason for the ban')
          .setRequired(true)
          .setAutocomplete(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('server')
      .setDescription('Manage server configurations')
      .addSubcommand(subcommand =>
        subcommand
          .setName('list')
          .setDescription('List all available servers'))
      .addSubcommand(subcommand =>
        subcommand
          .setName('switch')
          .setDescription('Switch to a different server')
          .addStringOption(option =>
            option.setName('server')
              .setDescription('The server to switch to')
              .setRequired(true)
              .setAutocomplete(true)))
      .toJSON()
  ];

  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, GUILD_ID),
      { body: commands },
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error refreshing application commands:', error);
  }

  // Set initial status
  await updateStatus();
  
  // Start the status update loop
  setInterval(async () => {
    try {
      await updateStatus();
    } catch (error) {
      console.error('Error in status update:', error);
    }
  }, 120000); // Update every 2 minutes
});

// Common kick reasons
const KICK_REASONS = [
  'Inappropriate Behavior',
  'Team Killing',
  'Hacking/Cheating',
  'AFK',
  'Language',
  'Spamming',
  'Other'
];

// Common ban reasons
const BAN_REASONS = [
  'Hacking/Cheating',
  'Exploiting',
  'Toxicity',
  'Racism',
  'Team Killing',
  'Griefing',
  'Other'
];

// Duration units
const DURATION_UNITS = [
  { name: 'Minutes', value: 'minutes' },
  { name: 'Hours', value: 'hours' },
  { name: 'Days', value: 'days' },
  { name: 'Months', value: 'months' }
];

// Function to convert duration to seconds
function convertToSeconds(amount, unit) {
  const amountNum = parseInt(amount);
  switch (unit) {
    case 'minutes':
      return amountNum * 60;
    case 'hours':
      return amountNum * 3600;
    case 'days':
      return amountNum * 86400;
    case 'months':
      return amountNum * 2592000; // 30 days
    default:
      return amountNum;
  }
}

// Handle autocomplete interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isAutocomplete()) return;

  const focusedOption = interaction.options.getFocused(true);
  
  if (interaction.commandName === 'server' && focusedOption.name === 'server') {
    const filtered = Object.entries(serverConfig.servers)
      .filter(([id, server]) => 
        id.toLowerCase().includes(focusedOption.value.toLowerCase()) ||
        server.name.toLowerCase().includes(focusedOption.value.toLowerCase())
      )
      .map(([id, server]) => ({
        name: `${server.name} (${id})`,
        value: id
      }))
      .slice(0, 25);
    
    await interaction.respond(filtered);
  } else if (interaction.commandName === 'kick') {
    if (focusedOption.name === 'player') {
      // Ensure latestPlayerList is an array and handle empty case
      const players = Array.isArray(latestPlayerList) ? latestPlayerList : [];
      const filtered = players
        .filter(player => player && player.playerDisplayName && 
          player.playerDisplayName.toLowerCase().includes(focusedOption.value.toLowerCase()))
        .map(player => ({
          name: player.playerDisplayName,
          value: player.playerId.toString()
        }))
        .slice(0, 25);
      
      await interaction.respond(filtered);
    } else if (focusedOption.name === 'reason') {
      const filtered = KICK_REASONS
        .filter(reason => reason.toLowerCase().includes(focusedOption.value.toLowerCase()))
        .map(reason => ({
          name: reason,
          value: reason
        }))
        .slice(0, 25);
      
      await interaction.respond(filtered);
    }
  } else if (interaction.commandName === 'ban') {
    if (focusedOption.name === 'player') {
      // Ensure latestPlayerList is an array and handle empty case
      const players = Array.isArray(latestPlayerList) ? latestPlayerList : [];
      const filtered = players
        .filter(player => player && player.playerDisplayName && 
          player.playerDisplayName.toLowerCase().includes(focusedOption.value.toLowerCase()))
        .map(player => ({
          name: player.playerDisplayName,
          value: player.playerId.toString()
        }))
        .slice(0, 25);
      
      await interaction.respond(filtered);
    } else if (focusedOption.name === 'unit') {
      const filtered = DURATION_UNITS
        .filter(unit => unit.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
        .map(unit => ({
          name: unit.name,
          value: unit.value
        }))
        .slice(0, 25);
      
      await interaction.respond(filtered);
    } else if (focusedOption.name === 'reason') {
      const filtered = BAN_REASONS
        .filter(reason => reason.toLowerCase().includes(focusedOption.value.toLowerCase()))
        .map(reason => ({
          name: reason,
          value: reason
        }))
        .slice(0, 25);
      
      await interaction.respond(filtered);
    }
  } else if (interaction.commandName === 'unban') {
    if (focusedOption.name === 'player') {
      // Ensure latestBanList is an array and handle empty case
      const bans = Array.isArray(latestBanList) ? latestBanList : [];
      const filtered = bans
        .filter(ban => {
          const searchTerm = focusedOption.value.toLowerCase();
          return (
            ban.bannedName.toLowerCase().includes(searchTerm) ||
            ban.identityId.toLowerCase().includes(searchTerm)
          );
        })
        .map(ban => ({
          name: `${ban.bannedName} (${ban.identityId})`,
          value: ban.identityId
        }))
        .slice(0, 25);
      
      await interaction.respond(filtered);
    }
  } else if (interaction.commandName === 'permban') {
    if (focusedOption.name === 'player') {
      // Ensure latestPlayerList is an array and handle empty case
      const players = Array.isArray(latestPlayerList) ? latestPlayerList : [];
      const filtered = players
        .filter(player => player && player.playerDisplayName && 
          player.playerDisplayName.toLowerCase().includes(focusedOption.value.toLowerCase()))
        .map(player => ({
          name: player.playerDisplayName,
          value: player.playerId.toString()
        }))
        .slice(0, 25);
      
      await interaction.respond(filtered);
    } else if (focusedOption.name === 'reason') {
      const filtered = BAN_REASONS
        .filter(reason => reason.toLowerCase().includes(focusedOption.value.toLowerCase()))
        .map(reason => ({
          name: reason,
          value: reason
        }))
        .slice(0, 25);
      
      await interaction.respond(filtered);
    }
  }
});

// Handle slash command interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

  // Add interaction state logging
  console.log('Interaction state:', {
    replied: interaction.replied,
    deferred: interaction.deferred,
    createdTimestamp: interaction.createdTimestamp,
  });

  // Helper function to safely handle interaction responses
  const safeReply = async (interaction, content, ephemeral = false) => {
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content, ephemeral });
      } else if (interaction.deferred) {
        await interaction.editReply(content);
      }
    } catch (error) {
      console.error('Error handling interaction response:', error);
      // If we can't respond to the interaction, log it and move on
      console.log('Failed to respond to interaction:', {
        command: commandName,
        error: error.message,
        code: error.code
      });
    }
  };

  if (commandName === 'server') {
    const subcommand = options.getSubcommand();

    switch (subcommand) {
      case 'list':
        const serverList = Object.entries(serverConfig.servers)
          .map(([id, server]) => `${id} (${server.name}): ${server.address}:${server.port}`)
          .join('\n');
        await safeReply(interaction, `Available servers:\n${serverList}`);
        break;

      case 'switch':
        const serverId = options.getString('server');
        if (serverConfig.servers[serverId]) {
          serverConfig.currentServer = serverId;
          saveServerConfig();
          // Update RCON_CONFIG with new server settings
          RCON_CONFIG.host = getCurrentServer().address;
          RCON_CONFIG.port = getCurrentServer().port;
          RCON_CONFIG.password = getCurrentServer().password;
          await safeReply(interaction, `Switched to server: ${serverConfig.servers[serverId].name}`);
        } else {
          await safeReply(interaction, 'Server not found!');
        }
        break;
    }
  } else if (commandName === 'chatglobal') {
    // Check if the user has the Arma Admin role
    const hasArmaAdminRole = interaction.member.roles.cache.some(role => role.name === 'Arma Admin');
    
    if (!hasArmaAdminRole) {
      return safeReply(interaction, 'You do not have permission to use Arma RCON commands. You need the "Arma Admin" role.', true);
    }

    const message = interaction.options.getString('message');
    
    try {
      await interaction.deferReply();
      const response = await executeRconCommand(`chatglobal ${message}`);
      
      if (!response || response.trim() === '') {
        await safeReply(interaction, `Message sent successfully: "${message}"`);
      } else {
        await safeReply(interaction, `RCON Response: \`\`\`${response}\`\`\``);
      }
    } catch (error) {
      console.error('Error in command execution:', error);
      await safeReply(interaction, `Error executing RCON command: ${error.message}`);
    }
  } else if (commandName === 'playerlist') {
    // Check if the user has the Arma Admin role
    const hasArmaAdminRole = interaction.member.roles.cache.some(role => role.name === 'Arma Admin');
    
    if (!hasArmaAdminRole) {
      return safeReply(interaction, 'You do not have permission to use Arma RCON commands. You need the "Arma Admin" role.', true);
    }

    try {
      await interaction.deferReply();
      
      // Create a new promise for waiting for the webhook update
      playerListUpdatePromise = new Promise(resolve => {
        playerListUpdateResolve = resolve;
      });
      
      // First force an update of the player list via RCON
      await executeRconCommand('playerlist');
      
      // Wait for the webhook to update latestPlayerList
      await playerListUpdatePromise;
      
      // Then display the current list from latestPlayerList
      if (!latestPlayerList || latestPlayerList.length === 0) {
        await safeReply(interaction, 'No players currently on the server.');
      } else {
        // Format the player list nicely
        const formattedPlayers = latestPlayerList
          .map(player => `${player.playerDisplayName} (ID: ${player.playerId})`)
          .join('\n');
        
        await safeReply(interaction, `Current players on server:\n\`\`\`\n${formattedPlayers}\n\`\`\``);
      }
    } catch (error) {
      console.error('Error in playerlist command execution:', error);
      await safeReply(interaction, `Error fetching player list: ${error.message}`);
    }
  } else if (commandName === 'banlist') {
    // Check if the user has the Arma Admin role
    const hasArmaAdminRole = interaction.member.roles.cache.some(role => role.name === 'Arma Admin');
    
    if (!hasArmaAdminRole) {
      return safeReply(interaction, 'You do not have permission to use Arma RCON commands. You need the "Arma Admin" role.', true);
    }

    try {
      await interaction.deferReply();
      
      // Create a new promise for waiting for the webhook update
      banListUpdatePromise = new Promise(resolve => {
        banListUpdateResolve = resolve;
      });
      
      // First force an update of the ban list via RCON
      await executeRconCommand('banlistjson');
      
      // Wait for the webhook to update latestBanList
      await banListUpdatePromise;
      
      // Then display the current list from latestBanList
      if (!latestBanList || latestBanList.length === 0) {
        await safeReply(interaction, 'No players are currently banned.');
      } else {
        // Format the ban list nicely
        const formattedBans = latestBanList
          .map(ban => `${ban.bannedName} (ID: ${ban.identityId})`)
          .join('\n');
        
        await safeReply(interaction, `Current ban list:\n\`\`\`\n${formattedBans}\n\`\`\``);
      }
    } catch (error) {
      console.error('Error in banlist command execution:', error);
      await safeReply(interaction, `Error fetching ban list: ${error.message}`);
    }
  } else if (commandName === 'unban') {
    // Check if the user has the Arma Admin role
    const hasArmaAdminRole = interaction.member.roles.cache.some(role => role.name === 'Arma Admin');
    
    if (!hasArmaAdminRole) {
      return safeReply(interaction, 'You do not have permission to use Arma RCON commands. You need the "Arma Admin" role.', true);
    }

    const playerId = interaction.options.getString('player');
    
    try {
      await interaction.deferReply();
      
      // Find the player's name for the success message
      const bannedPlayer = latestBanList.find(ban => ban.identityId === playerId);
      const displayName = bannedPlayer ? bannedPlayer.bannedName : `Player ${playerId}`;
      
      // Execute unban command
      const response = await executeRconCommand(`ban remove ${playerId}`);
      
      if (!response || response.trim() === '') {
        await safeReply(interaction, `Successfully unbanned ${displayName}`);
      } else {
        await safeReply(interaction, `RCON Response: \`\`\`${response}\`\`\``);
      }
    } catch (error) {
      console.error('Error in unban command execution:', error);
      await safeReply(interaction, `Error executing unban command: ${error.message}`);
    }
  } else if (commandName === 'kick') {
    // Check if the user has the Arma Admin role
    const hasArmaAdminRole = interaction.member.roles.cache.some(role => role.name === 'Arma Admin');
    
    if (!hasArmaAdminRole) {
      return safeReply(interaction, 'You do not have permission to use Arma RCON commands. You need the "Arma Admin" role.', true);
    }

    const playerId = interaction.options.getString('player');
    const reason = interaction.options.getString('reason');
    
    try {
      await interaction.deferReply();
      const response = await executeRconCommand(`kick ${playerId} ${reason}`);
      
      if (!response || response.trim() === '') {
        // Find the player's display name for the success message
        const player = latestPlayerList.find(p => p.playerId.toString() === playerId);
        const displayName = player ? player.playerDisplayName : `Player ${playerId}`;
        await safeReply(interaction, `Successfully kicked ${displayName} for: ${reason}`);
      } else {
        await safeReply(interaction, `RCON Response: \`\`\`${response}\`\`\``);
      }
    } catch (error) {
      console.error('Error in kick command execution:', error);
      await safeReply(interaction, `Error executing kick command: ${error.message}`);
    }
  } else if (commandName === 'ban') {
    // Check if the user has the Arma Admin role
    const hasArmaAdminRole = interaction.member.roles.cache.some(role => role.name === 'Arma Admin');
    
    if (!hasArmaAdminRole) {
      return safeReply(interaction, 'You do not have permission to use Arma RCON commands. You need the "Arma Admin" role.', true);
    }

    const playerId = interaction.options.getString('player');
    const duration = interaction.options.getInteger('duration');
    const unit = interaction.options.getString('unit');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    
    try {
      await interaction.deferReply();
      
      // Convert duration to seconds, defaulting to 1 if duration is zero or less
      const durationInSeconds = convertToSeconds(duration <= 0 ? 1 : duration, unit);
      
      // Execute ban command
      const command = `ban create ${playerId} ${durationInSeconds} ${reason}`;
      console.log('Executing ban command:', command);
      const response = await executeRconCommand(command);
      console.log('Ban command response:', response);
      
      // Find the player's display name for the success message
      const player = latestPlayerList.find(p => p.playerId.toString() === playerId);
      const displayName = player ? player.playerDisplayName : `Player ${playerId}`;
      
      if (!response || response.trim() === '') {
        if (duration <= 0) {
          await safeReply(interaction, `Successfully banned ${displayName} for 1 ${unit} for: ${reason}\nNote: Duration was adjusted from 0. If you want to permanently ban, use /permban`);
        } else {
          await safeReply(interaction, `Successfully banned ${displayName} for ${duration} ${unit} for: ${reason}`);
        }
      } else {
        await safeReply(interaction, `RCON Response: \`\`\`${response}\`\`\``);
      }
    } catch (error) {
      console.error('Error in ban command execution:', error);
      await safeReply(interaction, `Error executing ban command: ${error.message}`);
    }
  } else if (commandName === 'reloadconfigs') {
    // Check if the user has the Arma Admin role
    const hasArmaAdminRole = interaction.member.roles.cache.some(role => role.name === 'Arma Admin');
    
    if (!hasArmaAdminRole) {
      return safeReply(interaction, 'You do not have permission to use Arma RCON commands. You need the "Arma Admin" role.', true);
    }

    try {
      await interaction.deferReply();
      const response = await executeRconCommand('reloadconfigs');
      
      if (!response || response.trim() === '') {
        await safeReply(interaction, 'Server configurations reloaded successfully');
      } else {
        await safeReply(interaction, `RCON Response: \`\`\`${response}\`\`\``);
      }
    } catch (error) {
      console.error('Error in reloadconfigs command execution:', error);
      await safeReply(interaction, `Error executing reloadconfigs command: ${error.message}`);
    }
  } else if (commandName === 'permban') {
    // Check if the user has the Arma Admin role
    const hasArmaAdminRole = interaction.member.roles.cache.some(role => role.name === 'Arma Admin');
    
    if (!hasArmaAdminRole) {
      return safeReply(interaction, 'You do not have permission to use Arma RCON commands. You need the "Arma Admin" role.', true);
    }

    const playerId = interaction.options.getString('player');
    const reason = interaction.options.getString('reason');
    
    try {
      await interaction.deferReply();
      
      // Execute permban command
      const response = await executeRconCommand(`ban create ${playerId} 0 ${reason}`);
      
      if (!response || response.trim() === '') {
        // Find the player's display name for the success message
        const player = latestPlayerList.find(p => p.playerId.toString() === playerId);
        const displayName = player ? player.playerDisplayName : `Player ${playerId}`;
        await safeReply(interaction, `Successfully permanently banned ${displayName} for: ${reason}`);
      } else {
        await safeReply(interaction, `RCON Response: \`\`\`${response}\`\`\``);
      }
    } catch (error) {
      console.error('Error in permban command execution:', error);
      await safeReply(interaction, `Error executing permban command: ${error.message}`);
    }
  }
});

// Add message event handler for !status6
client.on('messageCreate', async message => {
  if (message.content.toLowerCase() === '!status6') {
    try {
      const currentTime = Date.now();
      const timeSinceLastUpdate = currentTime - lastStatusCommandTime;
      const currentServer = getCurrentServer();

      if (timeSinceLastUpdate >= STATUS_COMMAND_COOLDOWN) {
        gameStatusUpdatePromise = new Promise(resolve => {
          gameStatusUpdateResolve = resolve;
        });
        await executeRconCommand('gamestatus');
        await gameStatusUpdatePromise;
        lastStatusCommandTime = currentTime;
      }

      const { timeOfDay = 'Unknown', weather = 'Unknown', factions = [] } = latestGameStatus || {};

      // Only show US and USSR (indices 0 and 3)
      const relevantFactions = factions.filter((_, i) => i === 0 || i === 3);

      const factionStatus = relevantFactions.length
        ? relevantFactions.map(f => `${f.factionName}: ${f.playerCount} player${f.playerCount !== 1 ? 's' : ''}`).join('\n')
        : 'No faction data available.';

      const statusEmbed = {
        color: 0x00ff00, // green
        title: `[NA] ${currentServer.name}`,
        fields: [
          {
            name: 'Time',
            value: timeOfDay,
            inline: true
          },
          {
            name: 'Weather',
            value: weather,
            inline: true
          },
          {
            name: 'Factions',
            value: factionStatus,
            inline: false
          }
        ],
        footer: {
          text: `Powered by B&B Arma Bot${timeSinceLastUpdate < STATUS_COMMAND_COOLDOWN ? ` • Cached (${Math.floor(timeSinceLastUpdate / 1000)}s old)` : ''}`
        }
      };

      await message.channel.send({ embeds: [statusEmbed] });
    } catch (error) {
      console.error('Error in !status6:', error);
      await message.channel.send('Error fetching server status.');
    }
  }
});

// Log the bot in
client.login(botToken);
