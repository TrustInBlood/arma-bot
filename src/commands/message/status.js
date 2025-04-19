const { getCurrentServer } = require('../../utils/serverManager');

/**
 * Handles the !status6 command
 * @param {Message} message - The Discord message object
 * @param {Array} latestPlayerList - The current list of players on the server
 */
async function handleStatusCommand(message, latestPlayerList) {
    try {
        // Get current server info
        const currentServer = getCurrentServer();
        const playerCount = latestPlayerList ? latestPlayerList.length : 0;
        const maxPlayers = 128;
        
        // Create an embed for better formatting
        const statusEmbed = {
            color: 0x00ff00, // Green color
            description: `${currentServer.name}\n\nPlayers\n${playerCount}/${maxPlayers}\n\nPowered by B&B Arma Bot • ${new Date().toLocaleTimeString()}`,
        };
        
        await message.channel.send({ embeds: [statusEmbed] });
    } catch (error) {
        console.error('Error in status command:', error);
        await message.channel.send('Error fetching server status.');
    }
}

module.exports = {
    handleStatusCommand
}; 