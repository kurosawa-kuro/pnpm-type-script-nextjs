import { Construct } from "constructs";
import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_iam as iam,
  aws_s3 as s3,
  aws_s3_assets as assets,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_s3_deployment as s3deploy,
  RemovalPolicy,
  Stack,
  StackProps,
  CfnOutput,
  Duration,
} from "aws-cdk-lib";
import { FirelensLogRouterType } from "aws-cdk-lib/aws-ecs";
import { Effect } from "aws-cdk-lib/aws-iam";
import * as path from "path";
import * as firehose from "@aws-cdk/aws-kinesisfirehose-alpha";
import * as destinations from "@aws-cdk/aws-kinesisfirehose-destinations-alpha";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";

const PREFIX = 'cdkfargate01';

// キャメルケース変換用のヘルパー関数
function toCamelCase(str: string): string {
  return str
    .split('-')
    .map((word, index) => 
      index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('');
}

// 使用例
function getResourceName(resourceType: string): string {
  return `${PREFIX}${resourceType.charAt(0).toUpperCase()}${resourceType.slice(1)}`;
}

export class FargateFirelensS3CloudfrontStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Assets
    const asset = new assets.Asset(this, getResourceName('asset'), {
      path: path.join(__dirname, "extra.conf"),
    });

    // Firehose
    const logBucket = new s3.Bucket(this, getResourceName('logBucket'), {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    new firehose.DeliveryStream(this, getResourceName('deliveryStream'), {
      deliveryStreamName: getResourceName('deliveryStream'),
      destination: new destinations.S3Bucket(logBucket),
    });

    // CloudFrontログ用のバケットポリシーを追加
    logBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [
          new iam.ServicePrincipal('cloudfront.amazonaws.com')
        ],
        actions: ['s3:PutObject'],
        resources: [logBucket.arnForObjects('*')],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/*`
          }
        }
      })
    );

    // VPC
    const vpc = new ec2.Vpc(this, getResourceName('vpc'), {
      vpcName: getResourceName('vpc'),
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{
        name: 'Public',
        subnetType: ec2.SubnetType.PUBLIC,
        mapPublicIpOnLaunch: true,
        cidrMask: 24
      }],
      createInternetGateway: false
    });

    // VPCのLogical IDを設定
    const cfnVpc = vpc.node.defaultChild as ec2.CfnVPC;
    cfnVpc?.overrideLogicalId(getResourceName('vpc'));

    // IGWの作成
    const igw = new ec2.CfnInternetGateway(this, getResourceName('igw'), {
      tags: [{ key: 'Name', value: getResourceName('igw') }]
    });
    igw.overrideLogicalId(getResourceName('igw'));

    // IGWのアタッチ
    const vpcGatewayAttachment = new ec2.CfnVPCGatewayAttachment(
      this, 
      getResourceName('vpcGatewayAttachment'),
      {
        vpcId: vpc.vpcId,
        internetGatewayId: igw.ref
      }
    );
    vpcGatewayAttachment.overrideLogicalId(getResourceName('vpcGatewayAttachment'));

    // パブリックサブネットの設定
    vpc.publicSubnets.forEach((subnet, index) => {
      const az = index === 0 ? 'a' : 'c';
      const cfnSubnet = subnet.node.defaultChild as ec2.CfnSubnet;
      
      // サブネットの設定
      cfnSubnet.overrideLogicalId(getResourceName(`publicSubnet1${az}`));
      cfnSubnet.addPropertyOverride('Tags', [
        { Key: 'Name', Value: getResourceName(`publicSubnet1${az}`) }
      ]);

      // ルートテーブルの設定
      const routeTable = subnet.node.findChild('RouteTable') as ec2.CfnRouteTable;
      routeTable.overrideLogicalId(getResourceName(`publicRt1${az}`));
      routeTable.addPropertyOverride('Tags', [
        { Key: 'Name', Value: getResourceName(`publicRt1${az}`) }
      ]);

      // パブリックルートの追加
      const publicRoute = new ec2.CfnRoute(this, `PublicRoute${index}`, {
        routeTableId: routeTable.ref,
        destinationCidrBlock: '0.0.0.0/0',
        gatewayId: igw.ref,
      });
      publicRoute.overrideLogicalId(getResourceName(`publicRoute1${az}`));
      publicRoute.addDependency(vpcGatewayAttachment);
    });

    // Fargate用のセキュリティグループ
    const fargateSecurityGroup = new ec2.SecurityGroup(
      this,
      getResourceName('fargateSecurityGroup'),
      {
        vpc,
        securityGroupName: getResourceName('fargateSecurityGroup'),
        description: 'Security group for Fargate containers'
      }
    );

    fargateSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(3000),
      'Allow traffic on port 3000'
    );

    // VPC Endpoints
    vpc.addInterfaceEndpoint(getResourceName('ecrApiEndpoint'), {
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
    });

    vpc.addInterfaceEndpoint(getResourceName('ecrDockerEndpoint'), {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
    });

    vpc.addInterfaceEndpoint(getResourceName('cloudwatchEndpoint'), {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
    });

    vpc.addGatewayEndpoint(getResourceName('s3Endpoint'), {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, getResourceName('cluster'), { vpc });

    // Task Role
    const taskRole = new iam.Role(this, getResourceName('taskRole'), {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "logs:CreateLogStream",
          "logs:CreateLogGroup",
          "logs:DescribeLogStreams",
          "logs:PutLogEvents",
          "s3:GetObject",
          "s3:GetBucketLocation",
          "firehose:PutRecordBatch",
        ],
        resources: ["*"],
        effect: Effect.ALLOW,
      })
    );

    // Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      getResourceName('taskDefinition'),
      {
        cpu: 512,
        memoryLimitMiB: 1024,
        taskRole: taskRole,
      }
    );

    // Add ECR permissions to execution role
    taskDefinition.addToExecutionRolePolicy(
      new iam.PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ],
        resources: ["*"]
      })
    );

    // Fluent Bit Log Router
    taskDefinition.addFirelensLogRouter(getResourceName('logRouter'), {
      firelensConfig: {
        type: FirelensLogRouterType.FLUENTBIT,
      },
      environment: {
        aws_fluent_bit_init_s3_1: `arn:aws:s3:::${asset.s3BucketName}/${asset.s3ObjectKey}`,
      },
      image: ecs.ContainerImage.fromRegistry(
        "public.ecr.aws/aws-observability/aws-for-fluent-bit:init-latest"
      ),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: `${PREFIX}-log-router`,
      }),
    });

    // Container Definition
    taskDefinition.defaultContainer = taskDefinition.addContainer(
      getResourceName('nextjs'),
      {
        image: ecs.ContainerImage.fromRegistry(
          "985539793438.dkr.ecr.ap-northeast-1.amazonaws.com/nextjs-app"
        ),
        logging: ecs.LogDrivers.firelens({
          options: {},
        }),
        portMappings: [
          // { containerPort: 80 },
          { containerPort: 3000 }
        ],
      }
    );

    // 画像保存用S3バケット
    const imageBucket = new s3.Bucket(this, getResourceName('imageBucket'), {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.GET,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: ['*'],
          exposedHeaders: [],
        },
      ],
    });

    // CloudFront Distribution
    const oac = new cloudfront.CfnOriginAccessControl(
      this, 
      getResourceName('oac'),
      {
        originAccessControlConfig: {
          name: getResourceName('oac'),
          originAccessControlOriginType: 's3',
          signingBehavior: 'always',
          signingProtocol: 'sigv4'
        }
      }
    );

    const distribution = new cloudfront.Distribution(
      this, 
      getResourceName('distribution'),
      {
        defaultBehavior: {
          origin: new origins.S3Origin(imageBucket),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
          responseHeadersPolicy: new cloudfront.ResponseHeadersPolicy(this, `${PREFIX}-country-headers-policy`, {
            responseHeadersPolicyName: `${PREFIX}-country-headers`,
            customHeadersBehavior: {
              customHeaders: [
                {
                  header: 'CloudFront-Viewer-Country',
                  value: '${CloudFront-Viewer-Country}',
                  override: true
                },
                {
                  header: 'CloudFront-Viewer-Country-Name',
                  value: '${CloudFront-Viewer-Country-Name}',
                  override: true
                }
              ]
            }
          })
        },
        enableLogging: true,
        logBucket: logBucket,
        logFilePrefix: 'cloudfront-logs/',
        logIncludesCookies: true,
      }
    );

    // Configure Origin Access Control
    const cfnDistribution = distribution.node.defaultChild as cloudfront.CfnDistribution;
    cfnDistribution.addPropertyOverride('DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity', '');
    cfnDistribution.addPropertyOverride('DistributionConfig.Origins.0.OriginAccessControlId', oac.ref);

    // S3バケットポリシーを更新
    imageBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [
          new iam.ServicePrincipal('cloudfront.amazonaws.com')
        ],
        actions: ['s3:GetObject'],
        resources: [imageBucket.arnForObjects('*')],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`
          }
        }
      })
    );

    // CloudFront Service Principal用のポリシー
    imageBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCloudFrontServicePrincipal',
        effect: iam.Effect.ALLOW,
        principals: [
          new iam.ServicePrincipal('cloudfront.amazonaws.com')
        ],
        actions: ['s3:GetObject'],
        resources: [imageBucket.arnForObjects('*')],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`
          }
        }
      })
    );

    // IAMユーザーアクセス用のポリシーを追加
    imageBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowIAMUserAccess',
        effect: iam.Effect.ALLOW,
        principals: [
          new iam.AccountRootPrincipal()
        ],
        actions: [
          's3:PutObject',
          's3:GetObject',
          's3:DeleteObject'
        ],
        resources: [imageBucket.arnForObjects('*')]
      })
    );

    // タスクロールにS3とCloudFront権限を追加
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:DeleteObject",
          "cloudfront:CreateInvalidation",
        ],
        resources: [
          imageBucket.arnForObjects('*'),
          imageBucket.bucketArn,
          `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
        ],
      })
    );

    // 環境変数をコンテナに追加
    taskDefinition.defaultContainer?.addEnvironment('S3_BUCKET_NAME', imageBucket.bucketName);
    taskDefinition.defaultContainer?.addEnvironment('CLOUDFRONT_DISTRIBUTION_ID', distribution.distributionId);
    taskDefinition.defaultContainer?.addEnvironment('CLOUDFRONT_DOMAIN_NAME', distribution.distributionDomainName);
    taskDefinition.defaultContainer?.addEnvironment('DATABASE_URL', "postgresql://neondb_owner:Nrp3FfO1goiB@ep-noisy-cherry-a7rp6riz.ap-southeast-2.aws.neon.tech/neondb?sslmode=require");

    // 出力
    new CfnOutput(this, 'ImageBucketName', { value: imageBucket.bucketName });
    new CfnOutput(this, 'CloudFrontDomain', { value: distribution.distributionDomainName });
    new CfnOutput(this, 'CloudFrontDistributionId', { value: distribution.distributionId });

    // Fargate Service
    new ecs_patterns.ApplicationLoadBalancedFargateService(this, getResourceName('fargateService'), {
      cluster,
      taskDefinition: taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [fargateSecurityGroup]
    });
  }
}