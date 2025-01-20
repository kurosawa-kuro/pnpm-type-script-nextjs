import { Construct } from "constructs";
import {
  aws_ecs as ecs,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_s3 as s3,
  aws_s3_assets as assets,
  Stack,
  StackProps,
  RemovalPolicy
} from "aws-cdk-lib";
import { FirelensLogRouterType } from "aws-cdk-lib/aws-ecs";
import * as path from "path";
import * as firehose from "@aws-cdk/aws-kinesisfirehose-alpha";
import * as destinations from "@aws-cdk/aws-kinesisfirehose-destinations-alpha";

interface ContainerConfig {
  cpu: number;
  memoryLimitMiB: number;
  firelensMemoryMiB: number;
  appMemoryMiB: number;
  containerImage: string;
}

interface ResourceConfig {
  prefix: string;
  vpcCidr: string;
  appPort: number;
  containerConfig: ContainerConfig;
}

export class CommonResourceStack extends Stack {
  public taskDefinition!: ecs.FargateTaskDefinition;
  public asset!: assets.Asset;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
  }

  public createNetworkResources(resourceName: string, config: { vpcCidr: string, appPort: number }): { vpc: ec2.Vpc, securityGroup: ec2.SecurityGroup } {
    const vpc = new ec2.Vpc(this, resourceName + 'Vpc', {
      vpcName: resourceName + 'Vpc',
      ipAddresses: ec2.IpAddresses.cidr(config.vpcCidr),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          mapPublicIpOnLaunch: true,
          cidrMask: 24
        }
      ]
    });

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

    const securityGroup = new ec2.SecurityGroup(this, resourceName + 'SecurityGroup', {
      vpc,
      securityGroupName: resourceName + 'SecurityGroup',
      description: 'Security group for Fargate containers',
      allowAllOutbound: true,
    });

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(config.appPort),
      'Allow inbound HTTP'
    );

    return { vpc, securityGroup };
  }

  public createStorageResources(resourceName: string): { logBucket: s3.Bucket, imageBucket: s3.Bucket } {
    const logBucket = new s3.Bucket(this, resourceName + 'LogBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new firehose.DeliveryStream(this, resourceName + 'DeliveryStream', {
      deliveryStreamName: `${resourceName}-delivery-stream`,
      destination: new destinations.S3Bucket(logBucket),
    });

    const imageBucket = new s3.Bucket(this, resourceName + 'ImageBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [{
        allowedHeaders: ['*'],
        allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.POST, s3.HttpMethods.GET, s3.HttpMethods.DELETE],
        allowedOrigins: ['*'],
        exposedHeaders: [],
      }],
    });

    return { logBucket, imageBucket };
  }

  public createIAMResources(prefix: string, logBucket: s3.Bucket): { taskRole: iam.Role, executionRole: iam.Role } {
    const taskRole = new iam.Role(this, prefix + 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: prefix + 'TaskRole',
    });

    taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));
    
    taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:*'],
      resources: [
        logBucket.bucketArn,
        `${logBucket.bucketArn}/*`
      ],
    }));

    taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
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
    }));

    const executionRole = new iam.Role(this, prefix + 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: prefix + 'ExecutionRole',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    return { taskRole, executionRole };
  }

  public createECSResources(
    config: ResourceConfig,
    vpc: ec2.Vpc,
    securityGroup: ec2.SecurityGroup,
    taskRole: iam.Role,
    executionRole: iam.Role,
    logBucket: s3.Bucket
  ): { cluster: ecs.Cluster, taskDefinition: ecs.FargateTaskDefinition, service: ecs.FargateService } {
    const cluster = new ecs.Cluster(this, config.prefix + 'Cluster', {
      vpc,
      clusterName: config.prefix + 'Cluster',
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, config.prefix + 'TaskDef', {
      family: config.prefix + 'TaskDef',
      cpu: 512,
      memoryLimitMiB: 1024,
      taskRole,
      executionRole,
    });

    taskDefinition.addToExecutionRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ],
        resources: ["*"]
      })
    );

    const asset = new assets.Asset(this, config.prefix + 'ExtraConf', {
      path: path.join(__dirname, "extra.conf"),
    });

    const firelensLogRouter = taskDefinition.addFirelensLogRouter(config.prefix + 'Firelens', {
      firelensConfig: {
        type: FirelensLogRouterType.FLUENTBIT,
      },
      image: ecs.ContainerImage.fromRegistry(
        "public.ecr.aws/aws-observability/aws-for-fluent-bit:init-latest"
      ),
      memoryReservationMiB: config.containerConfig.firelensMemoryMiB,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: config.prefix + 'Firelens',
      }),
      environment: {
        AWS_REGION: Stack.of(this).region,
        FLB_LOG_LEVEL: "info"
      }
    });

    const appContainer = taskDefinition.addContainer(config.prefix + 'App', {
      image: ecs.ContainerImage.fromRegistry(config.containerConfig.containerImage),
      memoryReservationMiB: config.containerConfig.appMemoryMiB,
      essential: true,
      logging: ecs.LogDrivers.firelens({
        options: {
          Name: 's3',
          region: Stack.of(this).region,
          bucket: logBucket.bucketName,
          total_file_size: '1M',
          upload_timeout: '1m',
          s3_key_format: '/fluent-bit-logs/$TAG/%Y/%m/%d/%H/%M/%S',
          s3_key_format_tag_delimiters: '.'
        }
      }),
      portMappings: [
        { containerPort: config.appPort },
        { containerPort: 3000 }
      ],
    });

    taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:PutObject',
        's3:GetObject',
        's3:ListBucket'
      ],
      resources: [
        logBucket.bucketArn,
        `${logBucket.bucketArn}/*`
      ]
    }));

    const service = new ecs.FargateService(this, config.prefix + 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [securityGroup],
      vpcSubnets: { 
        subnetType: ec2.SubnetType.PUBLIC,
        onePerAz: true  // 各AZに1つのサブネットを確保
      },
      circuitBreaker: { rollback: true },  // サービスの自動ロールバックを有効化
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE',
          weight: 1,
        }
      ]
    });

    // サービスのヘルスチェック設定
    service.node.addDependency(cluster);  // クラスターへの依存関係を明示的に追加

    this.taskDefinition = taskDefinition;
    this.asset = asset;

    return { cluster, taskDefinition, service };
  }

  public createCloudfrontResources(
    prefix: string,
    imageBucket: s3.Bucket,
    service: ecs.FargateService
  ): { distribution: cloudfront.Distribution } {
    const distribution = new cloudfront.Distribution(this, prefix + 'Distribution', {
      defaultBehavior: {
        origin: new origins.HttpOrigin(`${service.cluster.clusterName}.${this.region}.amazonaws.com`, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        }),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      },
      additionalBehaviors: {
        '/images/*': {
          origin: new origins.S3Origin(imageBucket),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      },
    });

    return { distribution };
  }
}