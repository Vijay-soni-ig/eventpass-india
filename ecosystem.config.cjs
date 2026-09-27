module.exports = {
  apps: [
    {
      name: "eventpass-api",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "watch src/index.ts",
      cwd: "c:/Project/eventpass-india/server",
      interpreter: "node",
      windowsHide: true,
      autorestart: true,
    },
    {
      name: "eventpass-web",
      script: "node_modules/vite/bin/vite.js",
      cwd: "c:/Project/eventpass-india",
      interpreter: "node",
      windowsHide: true,
      autorestart: true,
    },
  ],
};
