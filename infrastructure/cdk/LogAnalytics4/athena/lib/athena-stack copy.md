# AWS Glue ETL システム仕様書

## 1. システム概要
APIログデータを収集、処理、分析するためのETLパイプラインシステム。

## 2. アーキテクチャ構成

### 2.1 バージョン管理
- システムバージョン: `03`
- すべてのリソース名にバージョン番号を付与

### 2.2 ストレージ構成
```plaintext
S3バケット構造:
└── fargatestack-logbucketcc3b17e8-0djriusfgxia/
    ├── /                  # 生データ格納
    └── /processed/        # 処理済みデータ格納
```

### 2.3 Glueリソース構成

#### データベース
- 名称: `fargate_logs_db_03`
- 説明: Fargate application logs analysis

#### テーブル
- 名称: `raw_api_access_logs_03`
- タイプ: EXTERNAL_TABLE
- フォーマット: JSON
- スキーマ:
  - level (string)
  - message (string)
  - method (string)
  - origin (string)
  - pathname (string)
  - timestamp (string)

#### ETLジョブ
- 名称: `ETL-Log-Process-Job_03`
- 実行ロール: `GlueETL-Log-Process-Role`
- 設定:
  - Worker Type: G.1X
  - Workers数: 2
  - タイムアウト: 60分
  - Glueバージョン: 3.0

#### クローラー
- 名称: `api-logs-crawler_03`
- スケジュール: 30分間隔
- 対象パス: `/processed/`
- テーブルプレフィックス: `raw_api_access_logs_03`

## 3. 処理フロー
1. S3に生ログデータが格納
2. ETLジョブによるデータ処理
   - Pythonスクリプト: `process_api_logs_filter.py`
   - 入力: S3生データ
   - 出力: processedフォルダ
3. クローラーによるメタデータ更新
4. Athenaによるクエリ実行が可能に

## 4. セキュリティ設定
- IAMロール: `GlueETL-Log-Process-Role`
- 暗号化: 無効
- アクセス制御: S3バケットポリシーによる

## 5. モニタリング
- ETLジョブの実行状態
- クローラーの実行状態
- スクリプトの実行ログ

## 6. 注意事項
- 検証環境用の設定
- スクリプトのS3アクセス権限は手動で付与が必要
- クローラーのスケジュールは検証用に短く設定

## 7. デプロイメント
CDKを使用したインフラストラクチャのデプロイ:
```bash
cdk deploy AthenaStack
```