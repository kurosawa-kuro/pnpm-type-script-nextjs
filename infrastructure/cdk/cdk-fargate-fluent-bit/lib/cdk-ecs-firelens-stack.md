# AWS CDKインフラストラクチャー仕様

## 1. 設定ファイルとストレージ

 **検証段階での簡略化項目**
   - NAT Gatewayによるプライベートサブネット構成: 利用禁止
   - WAF: 利用禁止
   - IAMロール: 広めの権限設定
   - ドメイン関連:
     - Route53設定: 利用禁止
     - SSL/TLS (443): 利用禁止
     - 証明書管理: 利用禁止

### 1.1 Fluentbit設定
- 設定ファイル: extra.conf
- 保存方法: S3アセットとして管理
- リソースID: "asset"

### 1.2 S3バケット
- リソースID: "logBucket"
- 削除ポリシー: DESTROY
- 自動オブジェクト削除: 有効

### 1.3 Kinesis Firehose
- リソースID: "logDeliveryStream"
- ストリーム名: "log-delivery-stream02"
- 出力先: logBucket

## 2. ネットワーク構成

### 2.1 VPC
- リソースID: "Vpc"
- AZ数: 2
- NAT Gateway: 0

### 2.2 セキュリティグループ
#### ALB用
- リソースID: "albSecurityGroup"
- インバウンド: TCP/80 (0.0.0.0/0)

#### Fargate用
- リソースID: "fargateSecurityGroup"
- インバウンド: ALBセキュリティグループからの全トラフィック

## 3. ロードバランサー構成

### 3.1 ALB
- リソースID: "alb"
- インターネット向け: 有効
- セキュリティグループ: albSecurityGroup

### 3.2 リスナー
- リソースID: "listener"
- プロトコル: HTTP
- ポート: 80

### 3.3 ターゲットグループ
- リソースID: "targetGroup"
- ポート: 80
- プロトコル: HTTP
- タイプ: IP
- ヘルスチェック:
  - パス: "/"
  - 正常コード: "200"

## 4. コンテナ実行環境

### 4.1 ECSクラスター
- リソースID: "cluster"
- VPC: 上記VPCを使用

### 4.2 タスク実行ロール
- リソースID: "taskRole"
- 信頼関係: ecs-tasks.amazonaws.com
- 許可アクション:
  - logs:CreateLogStream
  - logs:CreateLogGroup
  - logs:DescribeLogStreams
  - logs:PutLogEvents
  - s3:GetObject
  - s3:GetBucketLocation
  - firehose:PutRecordBatch
- リソース範囲: "*"

### 4.3 Fargateタスク定義
- リソースID: "taskDefinition"
- CPU: 512
- メモリ: 1024 MiB

#### Fluentbitコンテナ
- リソースID: "firelensLogRouter"
- タイプ: FLUENTBIT
- イメージ: public.ecr.aws/aws-observability/aws-for-fluent-bit:init-latest
- ログ設定:
  - ドライバー: awsLogs
  - プレフィックス: "log-router"

#### Nginxコンテナ
- リソースID: "nginxContainer"
- イメージ: public.ecr.aws/nginx/nginx:latest
- ログ設定: firelens
- ポート: 80

### 4.4 Fargateサービス
- リソースID: "fargateService"
- タスク数: 1
- パブリックIP: 有効
- セキュリティグループ: fargateSecurityGroup
- ターゲットグループ接続: 有効