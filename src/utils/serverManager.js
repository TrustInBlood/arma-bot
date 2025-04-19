const fs = require('fs');
const path = require('path');

// Load server configurations
let serverConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config/servers/servers.json'), 'utf8'));

// Function to save server configurations
function saveServerConfig() {
    fs.writeFileSync(path.join(__dirname, '../../config/servers/servers.json'), JSON.stringify(serverConfig, null, 2));
}

// Get current server configuration
function getCurrentServer() {
    return serverConfig.servers[serverConfig.currentServer];
}

module.exports = {
    serverConfig,
    saveServerConfig,
    getCurrentServer
}; 