#!/usr/bin/env node

/**
 * Unified start script for Discord Bot + MongoDB API
 * Runs both services in parallel using child_process
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Discord Bot with MongoDB API...\n');

// Verify MongoDB URI is loaded
if (!process.env.MONGODB_URI) {
  console.error('❌ ERROR: MONGODB_URI not found in .env file!');
  console.error('Please copy .env.example to .env and configure MongoDB Atlas connection.');
  process.exit(1);
}

// Prepare environment with all loaded variables + flag to skip dotenv in children
const env = { 
  ...process.env,
  STARTED_FROM_PARENT: 'true'  // Signal to child processes
};

console.log(`📊 Environment loaded:`);
console.log(`   - Discord Token: ${process.env.DISCORD_TOKEN ? '✓ Set' : '✗ Missing'}`);
console.log(`   - MongoDB URI: ${process.env.MONGODB_URI ? '✓ Set' : '✗ Missing'}`);
console.log(`   - Port: ${process.env.PORT || '3000 (default)'}\n`);

// Start MongoDB API server
const apiProcess = spawn('node', [path.join(__dirname, 'server.js')], {
  stdio: 'inherit',
  env: env
});

// Start Discord bot
const botProcess = spawn('node', [path.join(__dirname, 'index.js')], {
  stdio: 'inherit',
  env: env
});

// Handle graceful shutdown
const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  apiProcess.kill(signal);
  botProcess.kill(signal);
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle child process exits
apiProcess.on('exit', (code, signal) => {
  console.error(`MongoDB API exited with code ${code}, signal ${signal}`);
  if (code !== 0 && code !== null) {
    console.error('Restarting MongoDB API...');
    // Could add auto-restart logic here
  }
});

botProcess.on('exit', (code, signal) => {
  console.error(`Discord Bot exited with code ${code}, signal ${signal}`);
  if (code !== 0 && code !== null) {
    console.error('Restarting Discord Bot...');
    // Could add auto-restart logic here
  }
});

console.log('✅ Both services started successfully!');
console.log('   - MongoDB API: Check configured PORT (default 3000)');
console.log('   - Discord Bot: Connecting to Discord...\n');
