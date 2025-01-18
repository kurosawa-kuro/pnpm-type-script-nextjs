import { Construct } from "constructs";
import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_iam as iam,
  aws_s3 as s3,
  aws_s3_assets as assets,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { FirelensLogRouterType } from "aws-cdk-lib/aws-ecs";
import { Effect } from "aws-cdk-lib/aws-iam";
import * as path from "path";
import * as firehose from "@aws-cdk/aws-kinesisfirehose-alpha";
import * as destinations from "@aws-cdk/aws-kinesisfirehose-destinations-alpha";

const PREFIX = 'cdk-faragate-fluent-03';

export class CdkEcsFirelensStack extends Stack {
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
    });

    new firehose.DeliveryStream(this, `${PREFIX}-delivery-stream`, {
      deliveryStreamName: `${PREFIX}-delivery-stream`,
      destinations: [new destinations.S3Bucket(logBucket)],
    });

    // VPC
    const vpc = new ec2.Vpc(this, `${PREFIX}-vpc`, { 
      maxAzs: 2, 
      natGateways: 1 
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

    // Security Group for Fargate
    const fargateSecurityGroup = new ec2.SecurityGroup(
      this,
      `${PREFIX}-fargate-sg`,
      {
        vpc,
        description: 'Security group for Fargate containers'
      }
    );

    // Add ingress rules for ports 80 and 3000
    fargateSecurityGroup.addIngressRule(
      ec2.Peer.ipv4("0.0.0.0/0"),
      ec2.Port.tcp(80),
      'Allow HTTP traffic'
    );

    fargateSecurityGroup.addIngressRule(
      ec2.Peer.ipv4("0.0.0.0/0"),
      ec2.Port.tcp(3000),
      'Allow traffic on port 3000'
    );

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