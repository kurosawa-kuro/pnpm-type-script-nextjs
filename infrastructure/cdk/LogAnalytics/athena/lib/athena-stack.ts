import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as glue from 'aws-cdk-lib/aws-glue';

// 設定値を定数として定義
const CONFIG = {
  GLUE: {
    DATABASE_NAME: 'fargate_logs_db',  // アプリケーション_目的_db
    DATABASE_DESCRIPTION: 'Database for Fargate application logs analysis',
    TABLE: {
      NAME: 'api_access_logs_raw',  // 種類_目的_状態
      // または 'api_access_logs_partitioned' パーティション化後用
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
  }
} as const;

export class AthenaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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
  }
}
