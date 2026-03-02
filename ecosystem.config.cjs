module.exports = {
  apps: [{
    name: 'lead-machine',
    script: 'src/index.js',
    // Garante que o processo rode no mesmo clone onde este arquivo está.
    cwd: __dirname,
    interpreter: 'node',
    env: { NODE_ENV: 'production' },
    max_memory_restart: '512M',
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_date_format: 'DD/MM/YYYY HH:mm:ss',
    restart_delay: 5000,
    max_restarts: 10
  }]
};
