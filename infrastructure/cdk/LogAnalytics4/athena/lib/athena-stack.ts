// lib/glue-etl-stack.ts

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3assets from 'aws-cdk-lib/aws-s3-assets';
import * as path from 'path';

const CONFIG = {
  GLUE: {
    DATABASE_NAME: 'fargate_logs_db02',
    DATABASE_DESCRIPTION: 'Database for Fargate application logs analysis',
    TABLE: {
      NAME: 'api_access_logs_raw02',  // 種類_目的_状態
      COLUMNS: [
        { name: 'level', type: 'string' },
        { name: 'message', type: 'string' },
        { name: 'method', type: 'string' },
        { name: 'origin', type: 'string' },
        { name: 'pathname', type: 'string' },
        { name: 'timestamp', type: 'string' }
      ],
      LOCATION: 's3://fargatestack-logbucketcc3b17e8-0djriusfgxia/'
    }
  },
  GLUE_JOB: {
    NAME: 'ETL-Log-Process-Job02',
    ROLE_NAME: 'GlueETL-Log-Process-Role',
    INPUT_PATH: 's3://fargatestack-logbucketcc3b17e8-0djriusfgxia/',
    OUTPUT_PATH: 's3://fargatestack-logbucketcc3b17e8-0djriusfgxia/processed/',
    SCRIPT_LOCATION: 's3://aws-glue-assets/scripts/log-process-job.py',
    TIMEOUT: 2880,
    WORKER_TYPE: 'G.1X',
    NUMBER_OF_WORKERS: 2,
    GLUE_VERSION: '3.0'
  },
  CRAWLER: {
    NAME: 'api-logs-crawler',
    TARGET_PATH: 's3://fargatestack-logbucketcc3b17e8-0djriusfgxia/',
    SCHEDULE: 'cron(0 */12 * * ? *)'  // 12時間ごとに実行
  }
} as const;

export class AthenaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

        // 既存のGlueロールをインポート
        const glueRole = iam.Role.fromRoleName(
          this,
          'ImportedGlueRole',
          CONFIG.GLUE_JOB.ROLE_NAME
        );

        // Glue DB 作成
    // Glue Table 作成
        // Glueデータベースの作成
        const glueDatabase = new glue.CfnDatabase(this, 'GlueDB', {
          catalogId: this.account,
          databaseInput: {
            name: CONFIG.GLUE.DATABASE_NAME,
            description: CONFIG.GLUE.DATABASE_DESCRIPTION,
          },
        });
    
        // Glueテーブルの作成
        const glueTable = new glue.CfnTable(this, 'GlueTbl', {
          catalogId: this.account,
          databaseName: CONFIG.GLUE.DATABASE_NAME,
          tableInput: {
            name: CONFIG.GLUE.TABLE.NAME,
            tableType: 'EXTERNAL_TABLE',
            parameters: {
              'has_encrypted_data': 'false',
              'classification': 'json'
            },
            storageDescriptor: {
              location: CONFIG.GLUE.TABLE.LOCATION,
              inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
              outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
              serdeInfo: {
                serializationLibrary: 'org.openx.data.jsonserde.JsonSerDe',
                parameters: {
                  'ignore.malformed.json': 'true',
                  'dots.in.keys': 'true',
                  'case.insensitive': 'true'
                }
              },
              columns: [...CONFIG.GLUE.TABLE.COLUMNS]
            }
          }
        });
    
        // テーブルの依存関係を設定
        glueTable.addDependency(glueDatabase);

    // ETLスクリプトをアセットとしてパッケージ化
    const etlScript = new s3assets.Asset(this, 'ETLScript', {
      path: path.join(__dirname, 'process_api_logs_filter.py')
    });

    // Glue ETLジョブの作成
    const etlJob = new glue.CfnJob(this, 'LogProcessJob', {
      name: CONFIG.GLUE_JOB.NAME,
      role: glueRole.roleArn,
      command: {
        name: 'glueetl',
        pythonVersion: '3',
        scriptLocation: etlScript.s3ObjectUrl
      },
      defaultArguments: {
        '--extra-py-files': etlScript.s3ObjectUrl
      },
      glueVersion: CONFIG.GLUE_JOB.GLUE_VERSION,
      workerType: CONFIG.GLUE_JOB.WORKER_TYPE,
      numberOfWorkers: CONFIG.GLUE_JOB.NUMBER_OF_WORKERS,
      timeout: CONFIG.GLUE_JOB.TIMEOUT
    });

    // grantRead()を削除し、代わりにスクリプトの場所を出力
    new cdk.CfnOutput(this, 'ScriptLocation', {
      value: etlScript.s3ObjectUrl,
      description: 'ETLスクリプトの場所 - 手動でロールに権限を追加してください'
    });

    // OutputsでジョブARNを出力
    new cdk.CfnOutput(this, 'GlueJobArn', {
      value: etlJob.ref,
      description: 'The ARN of the Glue ETL Job'
    });

    // Crawlerの作成
    const crawler = new glue.CfnCrawler(this, 'LogCrawler', {
      name: CONFIG.CRAWLER.NAME,
      role: glueRole.roleArn,
      databaseName: CONFIG.GLUE.DATABASE_NAME,
      targets: {
        s3Targets: [{
          path: CONFIG.CRAWLER.TARGET_PATH
        }]
      },
      tablePrefix: 'api_access_logs_',
      schemaChangePolicy: {
        updateBehavior: 'UPDATE_IN_DATABASE',
        deleteBehavior: 'LOG'
      },
      schedule: {
        scheduleExpression: CONFIG.CRAWLER.SCHEDULE
      }
    });

    // Crawlerの出力を追加
    new cdk.CfnOutput(this, 'CrawlerName', {
      value: crawler.ref,
      description: 'The name of the Glue Crawler'
    });
  }
}