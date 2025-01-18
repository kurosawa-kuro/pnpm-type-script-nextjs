import { Construct } from "constructs";
import {
  aws_ecs as ecs,
  aws_s3_assets as assets,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  Stack,
  StackProps,
  CfnOutput,
} from "aws-cdk-lib";
import { FirelensLogRouterType } from "aws-cdk-lib/aws-ecs";
import * as path from "path";
import * as firehose from "@aws-cdk/aws-kinesisfirehose-alpha";
import * as destinations from "@aws-cdk/aws-kinesisfirehose-destinations-alpha";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import { CommonResourceStack, getResourceName } from './common-resource-stack';

interface FargateFirelensS3CloudfrontStackProps extends StackProps {
  prefix: string;
  commonResources: CommonResourceStack;
}

export class FargateFirelensS3CloudfrontStack extends Stack {
  constructor(scope: Construct, id: string, props: FargateFirelensS3CloudfrontStackProps) {
    super(scope, id, props);

    const { vpc, fargateSecurityGroup, taskRole, logBucket, imageBucket } = props.commonResources;

    // Assets
    const asset = new assets.Asset(this, getResourceName(props.prefix, 'asset'), {
      path: path.join(__dirname, "extra.conf"),
    });

    // Firehose
    new firehose.DeliveryStream(this, getResourceName(props.prefix, 'deliveryStream'), {
      deliveryStreamName: getResourceName(props.prefix, 'deliveryStream'),
      destination: new destinations.S3Bucket(logBucket),
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, getResourceName(props.prefix, 'cluster'), { vpc });

    // Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      getResourceName(props.prefix, 'taskDefinition'),
      {
        cpu: 512,
        memoryLimitMiB: 1024,
        taskRole: taskRole,
      }
    );

    // Firelensログルーターコンテナ
    const firelensLog = taskDefinition.addFirelensLogRouter(
      getResourceName(props.prefix, 'firelensLog'),
      {
        image: ecs.ContainerImage.fromRegistry('amazon/aws-for-fluent-bit:latest'),
        firelensConfig: {
          type: FirelensLogRouterType.FLUENTBIT,
          options: {
            enableECSLogMetadata: true,
            configFileValue: asset.s3ObjectUrl,
          },
        },
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: getResourceName(props.prefix, 'firelens'),
        }),
        memoryReservationMiB: 50,
      }
    );

    // アプリケーションコンテナ
    const appContainer = taskDefinition.addContainer(
      getResourceName(props.prefix, 'appContainer'),
      {
        image: ecs.ContainerImage.fromRegistry('nginx:latest'),
        logging: ecs.LogDrivers.firelens({
          options: {
            Name: 'firehose',
            region: this.region,
            delivery_stream: getResourceName(props.prefix, 'deliveryStream'),
          },
        }),
        memoryReservationMiB: 256,
        portMappings: [{ containerPort: 80 }],
      }
    );

    // CloudFront Distribution
    const distribution = new cloudfront.Distribution(
      this,
      getResourceName(props.prefix, 'distribution'),
      {
        defaultBehavior: {
          origin: new origins.S3Origin(imageBucket),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        additionalBehaviors: {
          '/api/*': {
            origin: new origins.HttpOrigin(`${getResourceName(props.prefix, 'api')}.${this.region}.amazonaws.com`),
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          },
        },
        priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
        enableLogging: true,
        logBucket: logBucket,
        logFilePrefix: 'cloudfront-logs/',
      }
    );

    // Fargate Service
    const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      getResourceName(props.prefix, 'fargateService'),
      {
        cluster,
        taskDefinition: taskDefinition,
        desiredCount: 1,
        assignPublicIp: true,
        securityGroups: [fargateSecurityGroup],
        publicLoadBalancer: true,
      }
    );

    // Output
    new CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain Name',
    });

    new CfnOutput(this, 'LoadBalancerDNS', {
      value: fargateService.loadBalancer.loadBalancerDnsName,
      description: 'Application Load Balancer DNS Name',
    });
  }
}