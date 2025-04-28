# Arma Bot

A Discord bot designed to complement the [TrustyAdminTools](https://reforger.armaplatform.com/workshop/65064E8034130626-TrustyAdminTools) mod for Arma Reforger servers. This bot receives and processes webhook events from your Arma Reforger server, providing real-time monitoring and administration capabilities in your Discord server.

## Project Structure

```
arma-bot/
├── index.js              # Main bot code
├── servers.json          # Server configurations
├── servers.json.example  # Example server configuration
├── .env                  # Environment variables
├── .env.example          # Example environment variables
├── package.json          # Project dependencies
└── README.md             # Project documentation
```

## Features

- Discord bot integration with TrustyAdminTools
- Webhook server for receiving server events
- Real-time player tracking and monitoring
- Teamkill detection and reporting
- Server event logging
- Configurable through environment variables
- BattleEye RCON integration for server administration
- Multi-server support with easy switching
- Real-time player count status updates

## Prerequisites

- Node.js (v14 or higher recommended)
- npm or yarn package manager
- Discord Bot Token
- Discord Server (Guild) ID
- Discord Channel ID for chat
- Arma Reforger server with [TrustyAdminTools](https://reforger.armaplatform.com/workshop/65064E8034130626-TrustyAdminTools) mod installed
- BattleEye RCON access to your Arma Reforger server

## Installation

1. Clone the repository:
```bash
git clone https://github.com/TrustInBlood/arma-bot.git
cd arma-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```bash
cp .env.example .env
```

4. Edit the `.env` file with your configuration:
```
SERVER_PORT=your_server_port_here
SERVER_IP=your_server_ip_here
DISCORD_TOKEN=your_discord_bot_token_here
CHAT_CHANNEL_ID=your_chat_channel_id_here
GUILD_ID=your_guild_id_here
```

5. Create the necessary directories and configure your servers:
```bash
# Create the config directory structure
mkdir -p config/servers

# Copy the example server configuration
cp config/servers/servers.json.example config/servers/servers.json
```

6. Edit `config/servers/servers.json` to add your Arma Reforger servers with their RCON details.

## Configuration

### Environment Variables

- `SERVER_PORT`: Port for the webhook server to listen on
- `SERVER_IP`: IP address for the webhook server (use 0.0.0.0 for all interfaces)
- `DISCORD_TOKEN`: Your Discord bot token
- `CHAT_CHANNEL_ID`: Discord channel ID for chat messages
- `GUILD_ID`: Your Discord server (guild) ID

### Server Configuration

The `servers.json` file contains configuration for multiple Arma Reforger servers:
```json
{
  "currentServer": "server1",
  "servers": {
    "server1": {
      "name": "My Server",
      "address": "server.ip.address",
      "port": 2302,
      "password": "rcon_password"
    }
  }
}
```

### TrustyAdminTools Integration

1. Install the [TrustyAdminTools](https://reforger.armaplatform.com/workshop/65064E8034130626-TrustyAdminTools) mod on your Arma Reforger server
2. Configure the mod's webhook settings to point to your bot's webhook server
3. Enable desired modules in TrustyAdminTools:
   - Player List Module
   - Kills Module
   - Player Events Module
   - Server Information Module

## Discord Commands

The bot provides several types of commands:

### Slash Commands
- `/chatglobal [message]` - Send a global message to the server
- `/playerlist` - Get the current list of players on the server
- `/banlist` - Get the current list of banned players
- `/unban [player]` - Remove a player from the ban list
- `/kick [player] [reason]` - Kick a player from the server
- `/ban [player] [duration] [unit] [reason]` - Ban a player for a specified duration
- `/permban [player] [reason]` - Permanently ban a player
- `/reloadconfigs` - Reload server configurations
- `/server list` - List all available servers
- `/server switch [server]` - Switch to a different server

### Message Commands
- `!status6` - Display current server status and player count

## Usage

Start the bot:
```bash
node index.js
```

The bot will now:
- Connect to your Discord server
- Start the webhook server
- Begin monitoring your Arma Reforger server
- Update its status with the current player count
- Process and relay server events to Discord

## Security

- Never commit your `.env` file to version control
- Keep your Discord bot token secure
- Add `.env` to your `.gitignore` file
- Ensure your webhook server is properly secured
- Keep your RCON passwords secure
- Only grant the "Arma Admin" role to trusted users

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 