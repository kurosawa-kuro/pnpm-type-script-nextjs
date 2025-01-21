// lib/glue-etl-stack.ts

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3assets from 'aws-cdk-lib/aws-s3-assets';
import * as path from 'path';

// 設定オブジェクトの型定義
type GlueColumnConfig = {
  name: string;
  type: string;
};

type ConfigType = {
  GLUE: {
    Version:string;
    DATABASE_NAME: string;
    DATABASE_DESCRIPTION: string;
    TABLE: {
      NAME: string;
      COLUMNS: GlueColumnConfig[];
      LOCATION: string;
    };
  };
  GLUE_JOB: {
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
  CRAWLER: {
    NAME: string;
    TARGET_PATH: string;
    SCHEDULE: string;
  };
};

const GLUE_VERSION = "02";
const TABLE_PREFIX = `raw_api_access_logs_${GLUE_VERSION}`;

const CONFIG: ConfigType = {
  GLUE: {
    Version: GLUE_VERSION,
    DATABASE_NAME: `fargate_logs_db${GLUE_VERSION}`,
    DATABASE_DESCRIPTION: 'Database for Fargate application logs analysis',
    TABLE: {
      NAME: TABLE_PREFIX,
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
    NAME: 'ETL-Log-Process-Job' + GLUE_VERSION,
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
    NAME: 'api-logs-crawler',
    TARGET_PATH: 's3://fargatestack-logbucketcc3b17e8-0djriusfgxia/processed/',  // 処理済みデータのパスに修正
    SCHEDULE: 'cron(0/30 * * * ? *)'  // 検証用に30分間隔に変更
  }
} as const;

export class AthenaStack extends cdk.Stack {
  private readonly glueRole: iam.IRole;
  private readonly etlScript: s3assets.Asset;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Glueロールの初期化
    this.glueRole = this.initializeGlueRole();
    this.etlScript = new s3assets.Asset(this, 'ETLScript', {
      path: path.join(__dirname, 'process_api_logs_filter.py')
    });
    
    // Glueリソースの作成
    const { glueDatabase, glueTable } = this.createGlueResources();
    
    // ETLジョブの作成
    const etlJob = this.createETLJob();
    
    // Crawlerの作成
    const crawler = this.createCrawler();
    
    // 出力の設定
    this.setupOutputs(etlJob, crawler);
  }

  private initializeGlueRole(): iam.IRole {
    return iam.Role.fromRoleName(
      this,
      'ImportedGlueRole',
      CONFIG.GLUE_JOB.ROLE_NAME
    );
  }

  private createGlueResources() {
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

    glueTable.addDependency(glueDatabase);
    return { glueDatabase, glueTable };
  }

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
      tablePrefix: TABLE_PREFIX,
      schemaChangePolicy: {
        updateBehavior: 'UPDATE_IN_DATABASE',
        deleteBehavior: 'LOG'
      },
      schedule: {
        scheduleExpression: CONFIG.CRAWLER.SCHEDULE
      }
    });
  }

  private setupOutputs(etlJob: glue.CfnJob, crawler: glue.CfnCrawler): void {
    new cdk.CfnOutput(this, 'ScriptLocation', {
      value: this.etlScript.s3ObjectUrl,
      description: 'ETLスクリプトの場所 - 手動でロールに権限を追加してください'
    });

    new cdk.CfnOutput(this, 'GlueJobArn', {
      value: etlJob.ref,
      description: 'The ARN of the Glue ETL Job'
    });

    new cdk.CfnOutput(this, 'CrawlerName', {
      value: crawler.ref,
      description: 'The name of the Glue Crawler'
    });
  }
}