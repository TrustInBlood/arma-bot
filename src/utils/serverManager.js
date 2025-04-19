const fs = require('fs');
const path = require('path');

// Define paths
const configDir = path.join(__dirname, '../../config');
const serversDir = path.join(configDir, 'servers');
const serversFile = path.join(serversDir, 'servers.json');
const exampleFile = path.join(serversDir, 'servers.json.example');

// Ensure directories and files exist
function ensureConfigExists() {
    // Create config directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    // Create servers directory if it doesn't exist
    if (!fs.existsSync(serversDir)) {
        fs.mkdirSync(serversDir, { recursive: true });
    }

    // Create example file if it doesn't exist
    if (!fs.existsSync(exampleFile)) {
        const defaultConfig = {
            currentServer: "server1",
            servers: {
                "server1": {
                    "name": "My Server",
                    "address": "server.ip.address",
                    "port": 2302,
                    "password": "rcon_password"
                }
            }
        };
        fs.writeFileSync(exampleFile, JSON.stringify(defaultConfig, null, 2));
    }

    // Create servers.json if it doesn't exist
    if (!fs.existsSync(serversFile)) {
        fs.copyFileSync(exampleFile, serversFile);
    }
}

// Initialize configuration
ensureConfigExists();

// Load server configurations
let serverConfig = JSON.parse(fs.readFileSync(serversFile, 'utf8'));

// Function to save server configurations
function saveServerConfig() {
    fs.writeFileSync(serversFile, JSON.stringify(serverConfig, null, 2));
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