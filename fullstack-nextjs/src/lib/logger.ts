import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'next-app' },
  transports: [
    new winston.transports.File({ 
      filename: '/home/ec2-user/app/tmp/pnpm-type-script-nextjs/logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: '/home/ec2-user/app/tmp/pnmp_java_script_express/logs/combined.log' 
    })
  ]
});

// 開発環境の場合はコンソールにも出力
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

export default logger;