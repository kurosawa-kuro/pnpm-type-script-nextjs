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

const PREFIX = 'cdk-faragate-01';

export class FargateFirelensS3CloudfrontStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Assets
    const asset = new assets.Asset(this, `${PREFIX}-asset`, {
      path: path.join(__dirname, "extra.conf"),
    });

    // Firehose
    const logBucket = new s3.Bucket(this, `${PREFIX}-log-bucket`, {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    new firehose.DeliveryStream(this, `${PREFIX}-delivery-stream`, {
      deliveryStreamName: `${PREFIX}-delivery-stream`,
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
    const vpc = new ec2.Vpc(this, `${PREFIX}-vpc`, {
      vpcName: `${PREFIX}-vpc`,
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
    cfnVpc?.overrideLogicalId(`${PREFIX}-vpc`);

    // IGWの作成
    const igw = new ec2.CfnInternetGateway(this, 'IGW', {
      tags: [{ key: 'Name', value: `${PREFIX}-igw` }]
    });
    igw.overrideLogicalId(`${PREFIX}-igw`);

    // IGWのアタッチ
    const vpcGatewayAttachment = new ec2.CfnVPCGatewayAttachment(this, 'VPCGW', {
      vpcId: vpc.vpcId,
      internetGatewayId: igw.ref
    });
    vpcGatewayAttachment.overrideLogicalId(`${PREFIX}-vpc-gateway-attachment`);

    // パブリックサブネットの設定
    vpc.publicSubnets.forEach((subnet, index) => {
      const az = index === 0 ? 'a' : 'c';
      const cfnSubnet = subnet.node.defaultChild as ec2.CfnSubnet;
      
      // サブネットの設定
      cfnSubnet.overrideLogicalId(`${PREFIX}-public-subnet-1${az}`);
      cfnSubnet.addPropertyOverride('Tags', [
        { Key: 'Name', Value: `${PREFIX}-public-subnet-1${az}` }
      ]);

      // ルートテーブルの設定
      const routeTable = subnet.node.findChild('RouteTable') as ec2.CfnRouteTable;
      routeTable.overrideLogicalId(`${PREFIX}-public-rt-1${az}`);
      routeTable.addPropertyOverride('Tags', [
        { Key: 'Name', Value: `${PREFIX}-public-rt-1${az}` }
      ]);

      // パブリックルートの追加
      const publicRoute = new ec2.CfnRoute(this, `PublicRoute${index}`, {
        routeTableId: routeTable.ref,
        destinationCidrBlock: '0.0.0.0/0',
        gatewayId: igw.ref,
      });
      publicRoute.overrideLogicalId(`${PREFIX}-public-route-1${az}`);
      publicRoute.addDependency(vpcGatewayAttachment);
    });

    // ALB用のセキュリティグループ
    const albSecurityGroup = new ec2.SecurityGroup(this, `${PREFIX}-alb-sg`, {
      vpc,
      securityGroupName: `${PREFIX}-alb-sg`,
      description: 'Security group for ALB',
      allowAllOutbound: true,
    });

    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP'
    );

    // Fargate用のセキュリティグループ
    const fargateSecurityGroup = new ec2.SecurityGroup(
      this,
      `${PREFIX}-fargate-sg`,
      {
        vpc,
        securityGroupName: `${PREFIX}-fargate-sg`,
        description: 'Security group for Fargate containers'
      }
    );

    fargateSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(albSecurityGroup.securityGroupId),
      ec2.Port.tcp(80),
      'Allow traffic from ALB'
    );

    // ALBの作成
    const alb = new elbv2.ApplicationLoadBalancer(this, `${PREFIX}-alb`, {
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }
    });

    // ターゲットグループの作成
    const targetGroup = new elbv2.ApplicationTargetGroup(this, `${PREFIX}-target-group`, {
      vpc,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/health',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 2,
        timeout: Duration.seconds(5),
        interval: Duration.seconds(30),
      }
    });

    // リスナーの追加
    alb.addListener(`${PREFIX}-http-listener`, {
      port: 80,
      defaultTargetGroups: [targetGroup]
    });

    // 出力の追加
    new CfnOutput(this, 'AlbDnsName', {
      value: alb.loadBalancerDnsName,
      description: 'ALB DNS Name'
    });

    // Add VPC Endpoints
    vpc.addInterfaceEndpoint('ecr-api-endpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
    });

    vpc.addInterfaceEndpoint('ecr-docker-endpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
    });

    vpc.addInterfaceEndpoint('cloudwatch-endpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
    });

    vpc.addGatewayEndpoint('s3-endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, `${PREFIX}-cluster`, { vpc });

    // Task Role
    const taskRole = new iam.Role(this, `${PREFIX}-task-role`, {
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
      `${PREFIX}-task-definition`,
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
    taskDefinition.addFirelensLogRouter(`${PREFIX}-log-router`, {
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
      `${PREFIX}-nextjs`,
      {
        image: ecs.ContainerImage.fromRegistry(
          "985539793438.dkr.ecr.ap-northeast-1.amazonaws.com/nextjs-app"
        ),
        logging: ecs.LogDrivers.firelens({
          options: {},
        }),
        portMappings: [
          { containerPort: 80 },
          { containerPort: 3000 }
        ],
      }
    );

    // 画像保存用S3バケット
    const imageBucket = new s3.Bucket(this, `${PREFIX}-image-bucket`, {
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
    const oac = new cloudfront.CfnOriginAccessControl(this, `${PREFIX}-oac`, {
      originAccessControlConfig: {
        name: `${PREFIX}-oac`,
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4'
      }
    });

    const distribution = new cloudfront.Distribution(this, `${PREFIX}-distribution`, {
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
              },
              {
                header: 'CloudFront-Viewer-Country-Region',
                value: '${CloudFront-Viewer-Country-Region}',
                override: true
              },
              {
                header: 'CloudFront-Viewer-City',
                value: '${CloudFront-Viewer-City}',
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
    });

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

    // 出力
    new CfnOutput(this, 'ImageBucketName', { value: imageBucket.bucketName });
    new CfnOutput(this, 'CloudFrontDomain', { value: distribution.distributionDomainName });
    new CfnOutput(this, 'CloudFrontDistributionId', { value: distribution.distributionId });

    // Fargate Service
    new ecs.FargateService(this, `${PREFIX}-fargate-service`, {
      cluster,
      taskDefinition: taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [fargateSecurityGroup],
    });
  }
}