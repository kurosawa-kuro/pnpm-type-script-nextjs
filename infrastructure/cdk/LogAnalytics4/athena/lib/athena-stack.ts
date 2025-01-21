// lib/glue-etl-stack.ts

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3assets from 'aws-cdk-lib/aws-s3-assets';
import * as path from 'path';

// Configuration Types
type GlueColumnConfig = {
  name: string;
  type: string;
};

type GlueConfig = {
  Version: string;
  DATABASE_NAME: string;
  DATABASE_DESCRIPTION: string;
  TABLE: {
    NAME: string;
    COLUMNS: GlueColumnConfig[];
    LOCATION: string;
  };
};

type GlueJobConfig = {
  NAME: string;
  ROLE_NAME: string;
  INPUT_PATH: string;
  OUTPUT_PATH: string;
  SCRIPT_LOCATION: string;
  TIMEOUT: number;
  WORKER_TYPE: string;
  NUMBER_OF_WORKERS: number;
  GLUE_VERSION: string;
};

type CrawlerConfig = {
  NAME: string;
  TARGET_PATH: string;
  SCHEDULE: string;
};

type ConfigType = {
  GLUE: GlueConfig;
  GLUE_JOB: GlueJobConfig;
  CRAWLER: CrawlerConfig;
};

const GLUE_VERSION = "03";

const CONFIG: ConfigType = {
  GLUE: {
    Version: GLUE_VERSION,
    DATABASE_NAME: `fargate_logs_db_${GLUE_VERSION}`,
    DATABASE_DESCRIPTION: 'Database for Fargate application logs analysis',
    TABLE: {
      NAME: `raw_api_access_logs_${GLUE_VERSION}`,
      COLUMNS: [
        { name: 'level', type: 'string' },
        { name: 'message', type: 'string' },
        { name: 'method', type: 'string' },
        { name: 'origin', type: 'string' },
        { name: 'pathname', type: 'string' },
        { name: 'timestamp', type: 'string' }
      ],
      LOCATION: 's3://fargatestack-logbucketcc3b17e8-0djriusfgxia/'  // 生データ用パスを分離
    }
  },
  GLUE_JOB: {
    NAME: `ETL-Log-Process-Job_${GLUE_VERSION}`,
    ROLE_NAME: 'GlueETL-Log-Process-Role',
    INPUT_PATH: 's3://fargatestack-logbucketcc3b17e8-0djriusfgxia/',  // 入力パスを修正
    OUTPUT_PATH: 's3://fargatestack-logbucketcc3b17e8-0djriusfgxia/processed/',
    SCRIPT_LOCATION: 's3://aws-glue-assets/scripts/log-process-job.py',
    TIMEOUT: 60,  // 検証用に短縮
    WORKER_TYPE: 'G.1X',
    NUMBER_OF_WORKERS: 2,
    GLUE_VERSION: '3.0'
  },
  CRAWLER: {
    NAME: `api-logs-crawler_${GLUE_VERSION}`,
    TARGET_PATH: 's3://fargatestack-logbucketcc3b17e8-0djriusfgxia/processed/',  // 処理済みデータのパスに修正
    SCHEDULE: 'cron(0/30 * * * ? *)'  // 検証用に30分間隔に変更
  }
} as const;

export class AthenaStack extends cdk.Stack {
  // Stack-level resources
  private readonly glueRole: iam.IRole;
  private readonly etlScript: s3assets.Asset;
  private readonly glueDatabase: glue.CfnDatabase;
  private readonly glueTable: glue.CfnTable;
  private readonly etlJob: glue.CfnJob;
  private readonly crawler: glue.CfnCrawler;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Initialize core resources
    this.glueRole = this.createGlueRole();
    this.etlScript = this.createETLScript();
    
    // Create Glue infrastructure
    this.glueDatabase = this.createGlueDatabase();
    this.glueTable = this.createGlueTable();
    
    // Create ETL components
    this.etlJob = this.createETLJob();
    this.crawler = this.createCrawler();
    
    // Setup outputs
    this.defineStackOutputs();
  }

  // Role Management
  private createGlueRole(): iam.IRole {
    return iam.Role.fromRoleName(
      this,
      'ImportedGlueRole',
      CONFIG.GLUE_JOB.ROLE_NAME
    );
  }

  // ETL Script Management
  private createETLScript(): s3assets.Asset {
    return new s3assets.Asset(this, 'ETLScript', {
      path: path.join(__dirname, 'process_api_logs_filter.py')
    });
  }

  // Database Management
  private createGlueDatabase(): glue.CfnDatabase {
    return new glue.CfnDatabase(this, 'GlueDB', {
      catalogId: this.account,
      databaseInput: {
        name: CONFIG.GLUE.DATABASE_NAME,
        description: CONFIG.GLUE.DATABASE_DESCRIPTION,
      },
    });
  }

  // Table Management
  private createGlueTable(): glue.CfnTable {
    const table = new glue.CfnTable(this, 'GlueTbl', {
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

    table.addDependency(this.glueDatabase);
    return table;
  }

  // ETL Job Management
  private createETLJob(): glue.CfnJob {
    return new glue.CfnJob(this, 'LogProcessJob', {
      name: CONFIG.GLUE_JOB.NAME,
      role: this.glueRole.roleArn,
      command: {
        name: 'glueetl',
        pythonVersion: '3',
        scriptLocation: this.etlScript.s3ObjectUrl
      },
      defaultArguments: {
        '--extra-py-files': this.etlScript.s3ObjectUrl
      },
      glueVersion: CONFIG.GLUE_JOB.GLUE_VERSION,
      workerType: CONFIG.GLUE_JOB.WORKER_TYPE,
      numberOfWorkers: CONFIG.GLUE_JOB.NUMBER_OF_WORKERS,
      timeout: CONFIG.GLUE_JOB.TIMEOUT
    });
  }

  // Crawler Management
  private createCrawler(): glue.CfnCrawler {
    return new glue.CfnCrawler(this, 'LogCrawler', {
      name: CONFIG.CRAWLER.NAME,
      role: this.glueRole.roleArn,
      databaseName: CONFIG.GLUE.DATABASE_NAME,
      targets: {
        s3Targets: [{
          path: CONFIG.CRAWLER.TARGET_PATH
        }]
      },
      tablePrefix: `raw_api_access_logs_${GLUE_VERSION}`,
      schemaChangePolicy: {
        updateBehavior: 'UPDATE_IN_DATABASE',
        deleteBehavior: 'LOG'
      },
      schedule: {
        scheduleExpression: CONFIG.CRAWLER.SCHEDULE
      }
    });
  }

  // Output Management
  private defineStackOutputs(): void {
    new cdk.CfnOutput(this, 'ScriptLocation', {
      value: this.etlScript.s3ObjectUrl,
      description: 'ETLスクリプトの場所 - 手動でロールに権限を追加してください'
    });

    new cdk.CfnOutput(this, 'GlueJobArn', {
      value: this.etlJob.ref,
      description: 'The ARN of the Glue ETL Job'
    });

    new cdk.CfnOutput(this, 'CrawlerName', {
      value: this.crawler.ref,
      description: 'The name of the Glue Crawler'
    });
  }
}