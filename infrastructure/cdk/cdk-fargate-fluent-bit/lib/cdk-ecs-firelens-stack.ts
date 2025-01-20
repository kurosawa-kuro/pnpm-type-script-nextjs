import { Construct } from "constructs";
import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elb,
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

export class CdkEcsFirelensStack extends Stack {
  private readonly vpc: ec2.Vpc;
  private readonly logBucket: s3.Bucket;
  private readonly albSecurityGroup: ec2.SecurityGroup;
  private readonly fargateSecurityGroup: ec2.SecurityGroup;
  private readonly targetGroup: elb.ApplicationTargetGroup;
  private readonly taskRole: iam.Role;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ロギングインフラ
    this.logBucket = new s3.Bucket(this, "logBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const asset = new assets.Asset(this, "asset", {
      path: path.join(__dirname, "extra.conf"),
    });

    new firehose.DeliveryStream(this, "logDeliveryStream", {
      deliveryStreamName: "log-delivery-stream02",
      destinations: [new destinations.S3Bucket(this.logBucket)],
    });

    // ネットワークインフラ
    this.vpc = new ec2.Vpc(this, "Vpc", { maxAzs: 2, natGateways: 0 });

    this.albSecurityGroup = new ec2.SecurityGroup(this, "albSecurityGroup", {
      vpc: this.vpc,
    });
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.ipv4("0.0.0.0/0"),
      ec2.Port.tcp(80)
    );

    this.fargateSecurityGroup = new ec2.SecurityGroup(this, "fargateSecurityGroup", {
      vpc: this.vpc,
    });
    this.fargateSecurityGroup.addIngressRule(
      this.albSecurityGroup,
      ec2.Port.allTraffic()
    );

    // ALB設定
    const alb = new elb.ApplicationLoadBalancer(this, "alb", {
      vpc: this.vpc,
      securityGroup: this.albSecurityGroup,
      internetFacing: true,
    });

    const listener = alb.addListener("listener", {
      protocol: elb.ApplicationProtocol.HTTP,
      port: 80,
    });

    this.targetGroup = new elb.ApplicationTargetGroup(this, "targetGroup", {
      vpc: this.vpc,
      port: 80,
      protocol: elb.ApplicationProtocol.HTTP,
      targetType: elb.TargetType.IP,
      healthCheck: {
        path: "/",
        healthyHttpCodes: "200",
      },
    });

    listener.addTargetGroups("addTargetGroup", {
      targetGroups: [this.targetGroup],
    });

    // ECSインフラ
    const cluster = new ecs.Cluster(this, "cluster", { vpc: this.vpc });
    
    this.taskRole = new iam.Role(this, "taskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    this.taskRole.addToPolicy(
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

    const taskDefinition = this.createTaskDefinition(asset);
    
    const fargateService = new ecs.FargateService(this, "fargateService", {
      cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [this.fargateSecurityGroup],
    });

    fargateService.attachToApplicationTargetGroup(this.targetGroup);
  }

  private createTaskDefinition(asset: assets.Asset): ecs.FargateTaskDefinition {
    const taskDefinition = new ecs.FargateTaskDefinition(this, "taskDefinition", {
      cpu: 512,
      memoryLimitMiB: 1024,
      taskRole: this.taskRole,
    });

    taskDefinition.addFirelensLogRouter("firelensLogRouter", {
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
        streamPrefix: "log-router",
      }),
    });

    taskDefinition.defaultContainer = taskDefinition.addContainer("nginxContainer", {
      image: ecs.ContainerImage.fromRegistry("public.ecr.aws/nginx/nginx:latest"),
      logging: ecs.LogDrivers.firelens({
        options: {},
      }),
      portMappings: [{ containerPort: 80 }],
    });

    return taskDefinition;
  }
}
