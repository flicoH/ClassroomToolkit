const path = require("node:path");

const appDir = process.env.APP_DIR || path.resolve(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "classroom-toolkit-backend",
      cwd: path.join(appDir, "apps/backend"),
      script: "dist/main.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      time: true,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "classroom-toolkit-web",
      cwd: path.join(appDir, "apps/web"),
      script: "node_modules/next/dist/bin/next",
      args: "start --hostname 127.0.0.1 --port 3001",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "768M",
      time: true,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
