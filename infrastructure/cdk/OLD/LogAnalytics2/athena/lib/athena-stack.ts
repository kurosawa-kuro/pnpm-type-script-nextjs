// lib/glue-etl-stack.ts

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3assets from 'aws-cdk-lib/aws-s3-assets';
import * as path from 'path';

const CONFIG = {
  GLUE: {
    DATABASE_NAME: 'fargate_logs_db',
    DATABASE_DESCRIPTION: 'Database for Fargate application logs analysis',
    TABLE: {
      // ... existing table config ...
    }
  },
  GLUE_JOB: {
    NAME: 'ETL-Log-Process-Job',
    ROLE_NAME: 'GlueETL-Log-Process-Role',
    INPUT_PATH: 's3://fargatestack-logbucketcc3b17e8-0djriusfgxia/',
    OUTPUT_PATH: 's3://fargatestack-logbucketcc3b17e8-0djriusfgxia/processed/',
    SCRIPT_LOCATION: 's3://aws-glue-assets/scripts/log-process-job.py',
    TIMEOUT: 2880,
    WORKER_TYPE: 'G.1X',
    NUMBER_OF_WORKERS: 2,
    GLUE_VERSION: '3.0'
  }
} as const;

export class AthenaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Pythonスクリプトをアセットとしてパッケージ化
    const etlScript = new s3assets.Asset(this, 'ETLScript', {
      path: path.join(__dirname, 'process_api_logs_filter.py')
    });

    // 既存のGlueロールをインポート
    const glueRole = iam.Role.fromRoleName(
      this,
      'ImportedGlueRole',
      CONFIG.GLUE_JOB.ROLE_NAME
    );

    // Glue ETLジョブの作成
    const etlJob = new glue.CfnJob(this, 'LogProcessJob', {
      name: CONFIG.GLUE_JOB.NAME,
      role: glueRole.roleArn,
      command: {
        name: 'glueetl',
        pythonVersion: '3',
        scriptLocation: etlScript.s3ObjectUrl
      },
      glueVersion: CONFIG.GLUE_JOB.GLUE_VERSION,
      workerType: CONFIG.GLUE_JOB.WORKER_TYPE,
      numberOfWorkers: CONFIG.GLUE_JOB.NUMBER_OF_WORKERS,
      timeout: CONFIG.GLUE_JOB.TIMEOUT
    });

    // S3アセットへのアクセス権限をGlueロールに付与
    etlScript.grantRead(glueRole);

    // OutputsでジョブARNを出力
    new cdk.CfnOutput(this, 'GlueJobArn', {
      value: etlJob.ref,
      description: 'The ARN of the Glue ETL Job'
    });
  }
}