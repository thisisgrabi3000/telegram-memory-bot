module.exports = {
  apps: [{
    name: 'famories',
    script: 'dist/index.js',
    cwd: '/var/www/memory-app',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    error_file: '/var/www/memory-app/logs/error.log',
    out_file: '/var/www/memory-app/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }]
};
