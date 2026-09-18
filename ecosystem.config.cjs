module.exports = {
  apps: [
    {
      name: "eventpass-api",
      script: "cmd.exe",
      args: ["/c", "npm", "run", "dev"],
      cwd: "c:/Project/eventpass-india/server",
      interpreter: "none",
      windowsHide: true,
      autorestart: true,
    },
    {
      name: "eventpass-web",
      script: "cmd.exe",
      args: ["/c", "npm", "run", "dev"],
      cwd: "c:/Project/eventpass-india",
      interpreter: "none",
      windowsHide: true,
      autorestart: true,
    },
  ],
};
