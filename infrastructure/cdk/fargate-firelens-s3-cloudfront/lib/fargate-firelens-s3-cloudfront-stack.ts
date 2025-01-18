import { Construct } from "constructs";
import {
  aws_ecs as ecs,
  aws_s3_assets as assets,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_s3 as s3,
  Stack,
  StackProps,
  CfnOutput,
  RemovalPolicy,
} from "aws-cdk-lib";
import { FirelensLogRouterType } from "aws-cdk-lib/aws-ecs";
import * as path from "path";
import * as firehose from "@aws-cdk/aws-kinesisfirehose-alpha";
import * as destinations from "@aws-cdk/aws-kinesisfirehose-destinations-alpha";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import { CommonResourceStack } from "./common-resource-stack";

// スタックの設定インターフェース
interface StackConfig {
  prefix: string;
  vpcCidr: string;
  containerConfig: {
    cpu: number;
    memoryLimitMiB: number;
    firelensMemoryMiB: number;
    appMemoryMiB: number;
  };
}

interface FargateFirelensS3CloudfrontStackProps extends StackProps {
  config: {
    prefix: string;
    vpcCidr: string;
    appPort: number;
    containerConfig: {
      cpu: number;
      memoryLimitMiB: number;
      firelensMemoryMiB: number;
      appMemoryMiB: number;
    }
  };
  commonResources: CommonResourceStack;
}

export class FargateFirelensS3CloudfrontStack extends Stack {
  private readonly config: StackConfig;
  private vpc: ec2.Vpc;
  private securityGroup: ec2.SecurityGroup;
  private taskRole: iam.Role;
  private logBucket: s3.Bucket;
  private imageBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: FargateFirelensS3CloudfrontStackProps) {
    super(scope, id, props);

    // propsから設定を取得
    this.config = props.config;

    // リソースの作成
    this.createNetworkResources();
    this.createStorageResources();
    this.createIamResources();
    this.createApplicationResources();
  }

  // ネットワークリソースの作成
  private createNetworkResources(): void {
    // VPC作成
    this.vpc = new ec2.Vpc(this, this.getResourceName('vpc'), {
      vpcName: this.getResourceName('vpc'),
      ipAddresses: ec2.IpAddresses.cidr(this.config.vpcCidr),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{
        name: 'Public',
        subnetType: ec2.SubnetType.PUBLIC,
        mapPublicIpOnLaunch: true,
        cidrMask: 24
      }],
    });

    // セキュリティグループ作成
    this.securityGroup = new ec2.SecurityGroup(this, this.getResourceName('securityGroup'), {
      vpc: this.vpc,
      securityGroupName: this.getResourceName('securityGroup'),
      description: 'Security group for Fargate containers'
    });

    this.securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));
    this.securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));
    this.securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3000), 'Allow application traffic');
  }

  // ストレージリソースの作成
  private createStorageResources(): void {
    this.logBucket = new s3.Bucket(this, this.getResourceName('logBucket'), {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    this.imageBucket = new s3.Bucket(this, this.getResourceName('imageBucket'), {
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
  }

  // IAMリソースの作成
  private createIamResources(): void {
    this.taskRole = new iam.Role(this, this.getResourceName('taskRole'), {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    this.taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:PutObject', 's3:GetObject', 's3:ListBucket'],
      resources: ['arn:aws:s3:::*/*'],
    }));
  }

  // アプリケーションリソースの作成
  private createApplicationResources(): void {
    const asset = new assets.Asset(this, this.getResourceName('asset'), {
      path: path.join(__dirname, "extra.conf"),
    });

    const deliveryStream = new firehose.DeliveryStream(this, this.getResourceName('deliveryStream'), {
      deliveryStreamName: this.getResourceName('deliveryStream'),
      destination: new destinations.S3Bucket(this.logBucket),
    });

    const cluster = new ecs.Cluster(this, this.getResourceName('cluster'), { vpc: this.vpc });
    const taskDefinition = this.createTaskDefinition();
    
    // Fargate Service
    const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      this.getResourceName('fargateService'),
      {
        cluster,
        taskDefinition,
        desiredCount: 1,
        assignPublicIp: true,
        securityGroups: [this.securityGroup],
        publicLoadBalancer: true,
      }
    );

    // CloudFront Distribution
    const distribution = this.createCloudFrontDistribution();

    // Outputs
    this.createOutputs(distribution, fargateService);
  }

  // タスク定義の作成
  private createTaskDefinition(): ecs.FargateTaskDefinition {
    const asset = new assets.Asset(this, this.getResourceName('asset'), {
      path: path.join(__dirname, "extra.conf"),
    });

    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      this.getResourceName('taskDefinition'),
      {
        cpu: this.config.containerConfig.cpu,
        memoryLimitMiB: this.config.containerConfig.memoryLimitMiB,
        taskRole: this.taskRole,
      }
    );

    // Firelensログルーター
    taskDefinition.addFirelensLogRouter(this.getResourceName('firelensLog'), {
      image: ecs.ContainerImage.fromRegistry('amazon/aws-for-fluent-bit:latest'),
      firelensConfig: {
        type: FirelensLogRouterType.FLUENTBIT,
        options: {
          enableECSLogMetadata: true,
          configFileValue: asset.s3ObjectUrl,
        },
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: this.getResourceName('firelens'),
      }),
      memoryReservationMiB: this.config.containerConfig.firelensMemoryMiB,
    });

    // アプリケーションコンテナ
    taskDefinition.addContainer(this.getResourceName('appContainer'), {
      image: ecs.ContainerImage.fromRegistry('nginx:latest'),
      logging: ecs.LogDrivers.firelens({
        options: {
          Name: 'firehose',
          region: this.region,
          delivery_stream: this.getResourceName('deliveryStream'),
        },
      }),
      memoryReservationMiB: this.config.containerConfig.appMemoryMiB,
      portMappings: [{ containerPort: 80 }],
    });

    return taskDefinition;
  }

  // CloudFront Distributionの作成
  private createCloudFrontDistribution(): cloudfront.Distribution {
    return new cloudfront.Distribution(this, this.getResourceName('distribution'), {
      defaultBehavior: {
        origin: new origins.S3Origin(this.imageBucket),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(`${this.getResourceName('api')}.${this.region}.amazonaws.com`),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        },
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      enableLogging: true,
      logBucket: this.logBucket,
      logFilePrefix: 'cloudfront-logs/',
    });
  }

  // 出力の作成
  private createOutputs(
    distribution: cloudfront.Distribution,
    fargateService: ecs_patterns.ApplicationLoadBalancedFargateService
  ): void {
    new CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain Name',
    });

    new CfnOutput(this, 'LoadBalancerDNS', {
      value: fargateService.loadBalancer.loadBalancerDnsName,
      description: 'Application Load Balancer DNS Name',
    });
  }

  // リソース名の生成
  private getResourceName(resourceType: string): string {
    return `${this.config.prefix}${resourceType.charAt(0).toUpperCase()}${resourceType.slice(1)}`;
  }
}